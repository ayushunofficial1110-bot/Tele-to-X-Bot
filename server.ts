import express from 'express';
import path from 'path';
import fs from 'fs';
import { db } from './server/db.ts';
import { telegramBot } from './server/telegramBot.ts';
import { telegramClient, parseTelegramChannelInput, formatXInput, isXUrl } from './server/telegramClient.ts';
import { xClient } from './server/xClient.ts';
import { sourceMonitor } from './server/monitor.ts';
import { automationQueue } from './server/queue.ts';
import { detectAdOrPromotion, rewriteSocialPost } from './server/gemini.ts';
import { getAppUrl, isAiStudioEnvironment } from './server/config.ts';

const PORT = Number(process.env.PORT) || 3000;

// OAuth 2.0 PKCE Session Map (isolated per request state)
const oauthSessions = new Map<string, { userId: string; codeVerifier: string; redirectUri: string; createdAt: number }>();

// Admin Security Middleware (Protected strictly by ADMIN_KEY env var)
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const adminKey = (req.headers['x-admin-key'] as string) || (req.query.adminKey as string);
  const configuredKey = (process.env.ADMIN_KEY || '').trim();

  if (!configuredKey) {
    return res.status(500).json({
      ok: false,
      error: 'ADMIN_KEY is not configured on the server. Please set ADMIN_KEY in your environment variables.',
    });
  }

  if (!adminKey || adminKey.trim() !== configuredKey) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Invalid or missing ADMIN_KEY' });
  }
  next();
};

let isServerStarted = false;

async function startServer() {
  if (isServerStarted) {
    return;
  }
  isServerStarted = true;

  const app = express();
  app.enable('trust proxy');
  app.use(express.json());

  // --- Health Check ---
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      time: new Date().toISOString(),
      appUrl: getAppUrl(),
      env: process.env.NODE_ENV || 'development',
    });
  });

  // --- Telegram Webhook (Disabled: Personal Bot operates strictly via Telegram Long Polling) ---
  app.all('/api/telegram/webhook', (_req, res) => {
    res.status(410).json({
      ok: false,
      error: 'Telegram webhook is disabled. This personal bot operates exclusively via Telegram Long Polling.',
    });
  });

  // --- Telegram Channel Verification & Permission Check ---
  app.post('/api/telegram/verify-channel', async (req, res) => {
    try {
      const { channelId, botToken } = req.body;
      if (!channelId) {
        return res.status(400).json({ ok: false, error: 'Channel identifier is required' });
      }

      const result = await telegramClient.verifyChannelPermissions(channelId, botToken);
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // --- X (Twitter) OAuth 2.0 PKCE Endpoints ---
  app.get('/api/auth/x/login', (req, res) => {
    try {
      const userId = (req.query.userId as string);
      if (!userId) {
        return res.status(400).json({ ok: false, error: 'Missing userId parameter' });
      }

      const user = db.getUser(userId);
      if (!user) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      const appUrl = getAppUrl();
      const redirectUri = `${appUrl}/api/auth/x/callback`;
      const { verifier, challenge } = xClient.generatePKCE();
      const state = `xstate_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      oauthSessions.set(state, {
        userId,
        codeVerifier: verifier,
        redirectUri,
        createdAt: Date.now(),
      });

      const authUrl = xClient.getOAuth2AuthorizeUrl({
        redirectUri,
        state,
        codeChallenge: challenge,
      });

      // If opened directly from Telegram or web browser link, redirect immediately to X authorization
      if (req.accepts('html') && !req.xhr && !req.headers.accept?.includes('application/json')) {
        return res.redirect(authUrl);
      }

      res.json({ ok: true, url: authUrl, state });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.get('/api/auth/x/callback', async (req, res) => {
    try {
      const { code, state, error, error_description } = req.query as Record<string, string>;
      if (error) {
        return res.send(`<html><body style="font-family: sans-serif; padding: 40px; background: #0f172a; color: white;"><h2>X Authorization Failed</h2><p>${error_description || error}</p><a href="/" style="color: #38bdf8;">Return to App</a></body></html>`);
      }

      if (!code || !state) {
        return res.status(400).send('Missing code or state parameter.');
      }

      const session = oauthSessions.get(state);
      if (!session) {
        return res.status(400).send('Expired or invalid OAuth session. Please try again from Dashboard.');
      }

      oauthSessions.delete(state);

      // Exchange authorization code for official OAuth2 tokens
      const tokenResult = await xClient.exchangeOAuth2Code({
        code,
        codeVerifier: session.codeVerifier,
        redirectUri: session.redirectUri,
      });

      // Persist tokens isolated strictly to this specific user
      const user = db.getUser(session.userId);
      if (user) {
        user.settings.xCredentials = {
          ...user.settings.xCredentials,
          oauth2AccessToken: tokenResult.accessToken,
          oauth2RefreshToken: tokenResult.refreshToken,
          oauth2ExpiresAt: Date.now() + tokenResult.expiresIn * 1000,
          oauth2Scope: tokenResult.scope,
        };
        db.upsertUser(user);
        db.logSystem('success', 'api', `User ${user.telegramUsername} authorized X account via OAuth2 PKCE`, user.id);
      }

      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>X Authorization Successful</title></head>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
            <div style="text-align: center; max-width: 450px; padding: 32px; background: #1e293b; border-radius: 12px; border: 1px solid #334155;">
              <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
              <h2 style="margin: 0 0 8px;">X Account Connected!</h2>
              <p style="color: #94a3b8; font-size: 14px; margin-bottom: 24px;">Your Twitter/X account is now authorized for automated posting.</p>
              <a href="/?oauth=success" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Back to Dashboard</a>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'X_OAUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 1200);
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).send(`<html><body style="font-family: sans-serif; padding: 40px; background: #0f172a; color: white;"><h2>OAuth Exchange Failed</h2><p>${message}</p><a href="/" style="color: #38bdf8;">Return</a></body></html>`);
    }
  });

  app.post('/api/auth/x/disconnect', (req, res) => {
    const { userId } = req.body;
    const user = db.getUser(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    user.settings.xCredentials.oauth2AccessToken = undefined;
    user.settings.xCredentials.oauth2RefreshToken = undefined;
    user.settings.xCredentials.oauth2ExpiresAt = undefined;
    db.upsertUser(user);
    db.logSystem('info', 'api', `User ${user.telegramUsername} disconnected X authorization`, user.id);
    res.json({ ok: true });
  });

  // --- Public Bot Info ---
  app.get('/api/telegram/info', (_req, res) => {
    const settings = db.getSettings();
    const botUsername = (settings.botUsername || process.env.TELEGRAM_BOT_USERNAME || '').replace('@', '');
    res.json({ ok: true, botUsername });
  });

  // --- User Authentication & Management ---

  // Auth by token (from Telegram /start link) or Telegram ID
  app.post('/api/user/auth-by-token', (req, res) => {
    const { token, telegramId, username } = req.body;

    let user: any = null;
    if (token) {
      user = db.getUserByToken(token);
    }
    if (!user && telegramId) {
      user = db.getUser(telegramId);
    }
    if (!user && username) {
      user = db.getUser(username);
    }

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found for provided credentials' });
    }

    user.lastActiveAt = new Date().toISOString();
    db.upsertUser(user);

    res.json({ ok: true, user });
  });

  // Authenticate existing registered telegram user via Web Gateway
  app.post('/api/user/register-or-login', (req, res) => {
    const { telegramHandle } = req.body;
    if (!telegramHandle) {
      return res.status(400).json({ ok: false, error: 'Telegram handle or ID is required' });
    }

    const cleanHandle = telegramHandle.trim().startsWith('@')
      ? telegramHandle.trim()
      : `@${telegramHandle.trim()}`;

    const user = db.getUser(cleanHandle);
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: 'Account not found. Please message your Telegram bot and send /start to activate your dashboard.',
      });
    }

    user.lastActiveAt = new Date().toISOString();
    db.upsertUser(user);
    res.json({ ok: true, user });
  });

  app.get('/api/user/profile', (req, res) => {
    const userId = req.query.userId as string;
    const token = req.query.token as string;

    let user: any = null;
    if (token) user = db.getUserByToken(token);
    if (!user && userId) user = db.getUser(userId);

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    res.json({ ok: true, user });
  });

  // --- Automations (Strictly Isolated per User) ---

  app.get('/api/user/automations', (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId is required' });
    }
    const automations = db.getAutomations(userId);
    res.json({ ok: true, automations });
  });

  app.post('/api/user/automations', (req, res) => {
    try {
      const { userId, name, direction, source, destination, settings } = req.body;
      if (!userId || !source || !destination) {
        return res.status(400).json({ ok: false, error: 'Missing required parameters' });
      }

      const user = db.getUser(userId);
      if (!user) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      // Format source and destination properly
      let cleanSource = source.trim();
      let cleanDestination = destination.trim();

      if (direction === 'x_to_telegram') {
        cleanSource = formatXInput(cleanSource);
        const parsed = parseTelegramChannelInput(cleanDestination);
        if (parsed.valid) cleanDestination = parsed.canonical;
      } else {
        const parsed = parseTelegramChannelInput(cleanSource);
        if (parsed.valid) cleanSource = parsed.canonical;
        cleanDestination = formatXInput(cleanDestination);
      }

      const created = db.createAutomation({
        id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId,
        name: name || `${cleanSource} ➔ ${cleanDestination}`,
        direction: direction || 'x_to_telegram',
        source: cleanSource,
        destination: cleanDestination,
        status: 'active',
        settings: {
          filterPromotions: true,
          autoRewrite: true,
          format: 'auto',
          includeMedia: true,
          includeOriginalLink: true,
          preserveHashtags: true,
          ...(settings || {}),
        },
        stats: {
          processedCount: 0,
          skippedAdsCount: 0,
          failedCount: 0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      db.logSystem('info', 'api', `Created automation ${created.name}`, userId);
      res.json({ ok: true, automation: created });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/user/automations/:id/toggle', (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    const auto = db.getAutomation(id, userId);
    if (!auto) return res.status(404).json({ ok: false, error: 'Automation not found' });

    const newStatus = auto.status === 'active' ? 'paused' : 'active';
    const updated = db.updateAutomation(id, userId, { status: newStatus });
    res.json({ ok: true, automation: updated });
  });

  app.post('/api/user/automations/:id/sync', async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      const auto = db.getAutomation(id, userId);
      if (!auto) return res.status(404).json({ ok: false, error: 'Automation not found' });

      sourceMonitor.resetCooldown(id);

      if (auto.direction === 'x_to_telegram') {
        const user = db.getUser(userId);
        const creds = user?.settings?.xCredentials;
        let tweets;
        try {
          tweets = await xClient.fetchRecentTweets(
            auto.source,
            auto.lastSeenPostId,
            {
              bearerToken: creds?.bearerToken,
              oauth2AccessToken: creds?.oauth2AccessToken,
            }
          );
        } catch (pollErr: unknown) {
          const pollMsg = pollErr instanceof Error ? pollErr.message : String(pollErr);
          const isCreditsDepleted = pollMsg.toLowerCase().includes('credits depleted');
          const notice = isCreditsDepleted
            ? `Official X API read quota is currently depleted for ${auto.source}. Free tier permits posting to X (Telegram ➔ X), but reading requires X API Basic credits. You can still test your bridge using the 'Test Run' button.`
            : pollMsg;

          db.updateAutomation(auto.id, userId, {
            lastError: notice,
            lastPollAt: new Date().toISOString(),
          });

          return res.json({
            ok: false,
            isCreditsDepleted,
            error: notice,
            message: notice,
          });
        }

        if (tweets && tweets.length > 0) {
          for (const t of tweets) {
            automationQueue.enqueuePost(auto, {
              sourcePostId: t.id,
              sourceAuthor: t.author,
              sourceContent: t.text,
              sourceUrl: t.url,
              media: t.media,
            });
          }
          db.updateAutomation(auto.id, userId, {
            lastSeenPostId: tweets[0].id,
            lastPollAt: new Date().toISOString(),
            lastError: undefined,
          });
          return res.json({ ok: true, syncedCount: tweets.length, message: `Queued ${tweets.length} new tweets for processing!` });
        }

        db.updateAutomation(auto.id, userId, {
          lastPollAt: new Date().toISOString(),
          lastError: undefined,
        });
        return res.json({ ok: true, syncedCount: 0, message: 'Source checked. No new posts since last poll.' });
      } else {
        return res.json({ ok: true, syncedCount: 0, message: 'Channel automations continuously listen for new posts.' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.delete('/api/user/automations/:id', (req, res) => {
    const { id } = req.params;
    const userId = (req.query.userId as string) || (req.body.userId as string);
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId is required' });
    }
    const success = db.deleteAutomation(id, userId);
    res.json({ ok: success });
  });

  app.post('/api/user/settings', (req, res) => {
    const { userId, settings } = req.body;
    const user = db.getUser(userId);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    user.settings = { ...user.settings, ...settings };
    db.upsertUser(user);
    res.json({ ok: true, settings: user.settings });
  });

  app.get('/api/user/logs', (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId is required' });
    }
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = db.getPostLogs(userId, limit);
    res.json({ ok: true, logs });
  });

  // --- Public: Other Bots (Only Admin-Configured & Enabled Bots) ---
  app.get('/api/other-bots', (req, res) => {
    const bots = db.getOtherBots(true);
    res.json({ ok: true, bots });
  });

  app.post('/api/other-bots/:id/click', (req, res) => {
    db.recordBotClick(req.params.id);
    res.json({ ok: true });
  });

  // --- AI Pipeline Testing Lab (Direct Playground) ---
  app.post('/api/pipeline/test', async (req, res) => {
    try {
      const { content, direction, format, author } = req.body;
      if (!content) {
        return res.status(400).json({ ok: false, error: 'Content is required' });
      }

      const urls: string[] = (content.match(/https?:\/\/[^\s]+/g) || []) as string[];
      const [adResult, rewriteResult] = await Promise.all([
        detectAdOrPromotion(content, urls, author || '@SourceAccount'),
        rewriteSocialPost({
          content,
          direction: direction || 'x_to_telegram',
          preferredFormat: format || 'auto',
          sourceAuthor: author || '@SourceAccount',
        }),
      ]);

      res.json({
        ok: true,
        adResult,
        rewriteResult,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // --- Admin Endpoints (Protected by ADMIN_KEY) ---

  app.post('/api/admin/verify-key', (req, res) => {
    const { adminKey } = req.body;
    const configuredKey = (process.env.ADMIN_KEY || '').trim();
    if (!configuredKey) {
      return res.status(500).json({
        ok: false,
        error: 'ADMIN_KEY is not configured on the server. Please set ADMIN_KEY in your environment variables.',
      });
    }
    if (!adminKey || adminKey.trim() !== configuredKey) {
      return res.status(401).json({ ok: false, error: 'Invalid ADMIN_KEY' });
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const stats = db.getSystemStats();
    stats.queuePendingCount = automationQueue.getPendingCount();
    res.json({ ok: true, stats });
  });

  app.get('/api/admin/logs', requireAdmin, (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = db.getSystemLogs(limit);
    res.json({ ok: true, logs });
  });

  app.post('/api/admin/broadcast', requireAdmin, async (req, res) => {
    try {
      const { text, buttonText, buttonUrl } = req.body;
      if (!text) return res.status(400).json({ ok: false, error: 'Broadcast text required' });

      const result = await telegramBot.broadcast(text, buttonText, buttonUrl);
      res.json({ ok: true, result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.get('/api/admin/other-bots', requireAdmin, (req, res) => {
    const bots = db.getOtherBots(false);
    res.json({ ok: true, bots });
  });

  app.post('/api/admin/other-bots', requireAdmin, (req, res) => {
    try {
      const { name, username, description, category, url, icon, badge, enabled, order } = req.body;
      if (!name || !username) {
        return res.status(400).json({ ok: false, error: 'Name and Username are required' });
      }

      const cleanUsername = username.startsWith('@') ? username : `@${username}`;
      const bot = db.upsertOtherBot({
        id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        name,
        username: cleanUsername,
        description: description || '',
        category: category || 'Utilities',
        url: url || `https://t.me/${cleanUsername.replace('@', '')}`,
        icon: icon || '🤖',
        badge: badge || '',
        enabled: enabled !== false,
        clicksCount: 0,
        order: Number(order) || 1,
        createdAt: new Date().toISOString(),
      });
      db.logSystem('info', 'api', `Admin added new bot: ${bot.name} (${bot.username})`);
      res.json({ ok: true, bot });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.put('/api/admin/other-bots/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const existing = db.getOtherBots(false).find((b) => b.id === id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Bot not found' });

    const updated = db.upsertOtherBot({
      ...existing,
      ...req.body,
      id,
    });
    db.logSystem('info', 'api', `Admin updated bot: ${updated.name}`);
    res.json({ ok: true, bot: updated });
  });

  app.delete('/api/admin/other-bots/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const success = db.deleteOtherBot(id);
    db.logSystem('info', 'api', `Admin deleted bot ID: ${id}`);
    res.json({ ok: success });
  });

  app.get('/api/admin/settings', requireAdmin, (req, res) => {
    const settings = db.getSettings();
    const botStatus = telegramBot.getBotStatus();
    const safeSettings = {
      botUsername: settings.botUsername || process.env.TELEGRAM_BOT_USERNAME || '',
      hasTelegramToken: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim().length > 10),
      hasAdminKey: Boolean(process.env.ADMIN_KEY && process.env.ADMIN_KEY.trim().length > 0),
      hasMongoUri: Boolean(process.env.MONGODB_URI || process.env.MONGO_URI),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasTwitterCreds: Boolean(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET),
      isTokenUnauthorized: botStatus.isTokenUnauthorized,
      isPolling: botStatus.isPolling,
      isAiStudio: botStatus.isAiStudio,
      lastUpdateId: botStatus.lastUpdateId,
    };
    res.json({ ok: true, settings: safeSettings });
  });

  app.post('/api/admin/settings', requireAdmin, (req, res) => {
    // Reject/ignore any credentials or secret fields: credentials must come ONLY from process.env
    const forbiddenFields = [
      'botToken',
      'adminSecret',
      'TELEGRAM_BOT_TOKEN',
      'ADMIN_KEY',
      'TWITTER_CLIENT_SECRET',
      'TWITTER_BEARER_TOKEN',
      'TWITTER_CLIENT_ID',
      'GEMINI_API_KEY',
      'MONGODB_URI',
      'MONGO_URI',
    ];
    for (const field of forbiddenFields) {
      if (req.body && req.body[field] !== undefined) {
        delete req.body[field];
      }
    }

    const { botUsername } = req.body;
    const updated = db.updateSettings({
      ...(botUsername !== undefined && { botUsername }),
    });
    res.json({ ok: true, settings: updated });
  });

  app.post('/api/admin/telegram-test', requireAdmin, async (req, res) => {
    try {
      const token = telegramClient.getActiveToken();
      if (!token) {
        return res.status(400).json({
          ok: false,
          error: 'TELEGRAM_BOT_TOKEN environment variable is not configured on the server.',
        });
      }

      // 1. Test getMe
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const meJson = (await meRes.json()) as any;
      if (!meJson.ok) {
        const desc = meJson.description || 'Unknown error';
        if (meJson.error_code === 401 || meRes.status === 401) {
          return res.status(400).json({
            ok: false,
            error: 'Telegram API 401: Unauthorized. The TELEGRAM_BOT_TOKEN in your environment variables is invalid or was revoked by @BotFather.',
          });
        }
        return res.status(400).json({ ok: false, error: `Telegram Error [${meJson.error_code || meRes.status}]: ${desc}` });
      }

      // Ensure webhook is removed so long-polling operates cleanly
      try {
        await telegramClient.deleteWebhook(false, token);
      } catch {}

      if (meJson.result?.username) {
        db.updateSettings({ botUsername: meJson.result.username });
      }

      // Wake up bot polling with active token only if not running in AI Studio
      if (!isAiStudioEnvironment()) {
        telegramBot.wakeUpPolling();
      }

      res.json({
        ok: true,
        botInfo: meJson.result,
        message: `Verified and connected as @${meJson.result?.username}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // --- Vite / Static Handling ---
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProd = process.env.NODE_ENV === 'production' || hasDist;

  if (isProd && hasDist) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[X2Telegram Server] Running on http://0.0.0.0:${PORT}`);
    if (!isAiStudioEnvironment()) {
      sourceMonitor.start();
      telegramBot.startPolling();
    } else {
      console.log(
        '[X2Telegram Server] ⏸️ Running in AI Gemini Studio mode: Web UI & Admin Panel active. Telegram Bot polling is STOPPED to prevent 409 conflict with Render production.'
      );
    }
  });

  // Graceful shutdown handling to clean up Telegram polling connection and avoid 409 conflict on restarts
  const gracefulShutdown = async (signal: string) => {
    console.log(`[X2Telegram Server] Received ${signal}. Stopping background workers...`);
    try {
      sourceMonitor.stop();
    } catch {}
    try {
      await telegramBot.stopPolling();
    } catch {}
    server.close(() => {
      console.log('[X2Telegram Server] HTTP server closed.');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

startServer();
