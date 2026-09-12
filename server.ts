import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.ts';
import { telegramBot } from './server/telegramBot.ts';
import { automationQueue } from './server/queue.ts';
import { detectAdOrPromotion, rewriteSocialPost } from './server/gemini.ts';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- Health Check ---
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      time: new Date().toISOString(),
    });
  });

  // --- Telegram Webhook (For production Telegram deployment) ---
  app.post('/api/telegram/webhook', async (req, res) => {
    try {
      const update = req.body;
      const response = await telegramBot.handleUpdate(update);
      res.json({ ok: true, response });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      db.logSystem('error', 'telegram_bot', `Webhook handling failed: ${message}`);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // --- Telegram Browser Simulator Endpoint ---
  app.post('/api/telegram/simulate', async (req, res) => {
    try {
      const { userId, text, callbackData } = req.body;
      const user = db.getUser(userId || 'user_alice_tech') || db.getUsers()[0];

      let updatePayload: {
        message?: {
          message_id: number;
          from: { id: number; username?: string; first_name?: string };
          chat: { id: number };
          text?: string;
        };
        callback_query?: {
          id: string;
          from: { id: number; username?: string; first_name?: string };
          message?: { message_id: number; chat: { id: number } };
          data?: string;
        };
      };

      if (callbackData) {
        updatePayload = {
          callback_query: {
            id: `cb_${Date.now()}`,
            from: {
              id: parseInt(user.telegramId) || 12345678,
              username: user.telegramUsername.replace('@', ''),
              first_name: user.firstName,
            },
            data: callbackData,
          },
        };
      } else {
        updatePayload = {
          message: {
            message_id: Date.now(),
            from: {
              id: parseInt(user.telegramId) || 12345678,
              username: user.telegramUsername.replace('@', ''),
              first_name: user.firstName,
            },
            chat: { id: parseInt(user.telegramId) || 12345678 },
            text: text || '/start',
          },
        };
      }

      const response = await telegramBot.handleUpdate(updatePayload);
      res.json({ ok: true, response });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // --- Trigger Sample Incoming Post through Queue ---
  app.post('/api/telegram/trigger-sample', async (req, res) => {
    try {
      const { automationId, userId, content, author, isPromotional, mediaUrl } = req.body;
      const auto = db.getAutomation(automationId, userId);
      if (!auto) {
        return res.status(404).json({ ok: false, error: 'Automation not found' });
      }

      const postData = {
        sourcePostId: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sourceAuthor: author || auto.source,
        sourceContent:
          content ||
          (isPromotional
            ? '🚀 URGENT PRESALE: Win $50,000 in free tokens! Connect wallet now at t.co/presale-airdrop before timer expires! 100x guaranteed #ad'
            : 'Anthropic announces Claude 3.7 Sonnet with hybrid reasoning capabilities, combining instant thinking and extended step-by-step mathematical proofs.'),
        sourceUrl: `https://x.com/${(author || auto.source).replace('@', '')}/status/${Date.now()}`,
        media: mediaUrl
          ? [
              {
                type: 'image' as const,
                url: mediaUrl,
              },
            ]
          : [],
      };

      const result = automationQueue.enqueuePost(auto, postData);
      res.json({ ok: true, result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // --- Multi-User SaaS Endpoints ---
  app.get('/api/user/users', (req, res) => {
    const users = db.getUsers();
    res.json({ ok: true, users });
  });

  app.get('/api/user/profile', (req, res) => {
    const userId = (req.query.userId as string) || 'user_alice_tech';
    const user = db.getUser(userId) || db.getUsers()[0];
    res.json({ ok: true, user });
  });

  app.post('/api/user/switch-or-create', (req, res) => {
    const { username, firstName, plan } = req.body;
    const cleanUsername = username ? (username.startsWith('@') ? username : `@${username}`) : `@user_${Date.now().toString().slice(-4)}`;
    let user = db.getUser(cleanUsername);
    if (!user) {
      const newId = `user_${Date.now().toString().slice(-6)}`;
      user = db.upsertUser({
        id: newId,
        telegramId: String(Math.floor(10000000 + Math.random() * 90000000)),
        telegramUsername: cleanUsername,
        firstName: firstName || 'New Creator',
        plan: plan || 'free',
        postsProcessedCount: 0,
        postsFailedCount: 0,
        postsFilteredAdsCount: 0,
        status: 'active',
        settings: {
          autoRewrite: true,
          adFilterEnabled: true,
          preserveFactsStrict: true,
          defaultPostFormat: 'auto',
          xCredentials: {},
        },
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      });
    }
    res.json({ ok: true, user });
  });

  app.get('/api/user/automations', (req, res) => {
    const userId = (req.query.userId as string) || 'user_alice_tech';
    const automations = db.getAutomations(userId);
    res.json({ ok: true, automations });
  });

  app.post('/api/user/automations', (req, res) => {
    try {
      const { userId, name, direction, source, destination, settings } = req.body;
      if (!userId || !source || !destination) {
        return res.status(400).json({ ok: false, error: 'Missing required parameters' });
      }

      const created = db.createAutomation({
        id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId,
        name: name || `${source} ➔ ${destination}`,
        direction: direction || 'x_to_telegram',
        source,
        destination,
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

  app.delete('/api/user/automations/:id', (req, res) => {
    const { id } = req.params;
    const userId = (req.query.userId as string) || (req.body.userId as string);
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
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = db.getPostLogs(userId, limit);
    res.json({ ok: true, logs });
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

  // --- Admin Endpoints ---
  app.get('/api/admin/stats', (req, res) => {
    const stats = db.getSystemStats();
    stats.queuePendingCount = automationQueue.getPendingCount();
    res.json({ ok: true, stats });
  });

  app.get('/api/admin/logs', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = db.getSystemLogs(limit);
    res.json({ ok: true, logs });
  });

  app.post('/api/admin/broadcast', async (req, res) => {
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

  app.get('/api/admin/other-bots', (req, res) => {
    const bots = db.getOtherBots(false);
    res.json({ ok: true, bots });
  });

  app.post('/api/admin/other-bots', (req, res) => {
    try {
      const { name, username, description, category, url, icon, badge, enabled, order } = req.body;
      const cleanUsername = username.startsWith('@') ? username : `@${username}`;
      const bot = db.upsertOtherBot({
        id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        name,
        username: cleanUsername,
        description,
        category: category || 'Utilities',
        url: url || `https://t.me/${cleanUsername.replace('@', '')}`,
        icon: icon || '🤖',
        badge,
        enabled: enabled !== false,
        clicksCount: 0,
        order: order || 1,
        createdAt: new Date().toISOString(),
      });
      res.json({ ok: true, bot });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.put('/api/admin/other-bots/:id', (req, res) => {
    const { id } = req.params;
    const existing = db.getOtherBots(false).find((b) => b.id === id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Bot not found' });

    const updated = db.upsertOtherBot({
      ...existing,
      ...req.body,
      id,
    });
    res.json({ ok: true, bot: updated });
  });

  app.delete('/api/admin/other-bots/:id', (req, res) => {
    const { id } = req.params;
    const success = db.deleteOtherBot(id);
    res.json({ ok: success });
  });

  app.get('/api/admin/settings', (req, res) => {
    const settings = db.getSettings();
    // Mask sensitive tokens for safe display
    const masked = {
      ...settings,
      botTokenMasked: settings.botToken ? `${settings.botToken.slice(0, 7)}...${settings.botToken.slice(-4)}` : '',
    };
    res.json({ ok: true, settings: masked });
  });

  app.post('/api/admin/settings', (req, res) => {
    const { botToken, botUsername, webhookUrl } = req.body;
    const updated = db.updateSettings({
      ...(botToken !== undefined && { botToken }),
      ...(botUsername !== undefined && { botUsername }),
      ...(webhookUrl !== undefined && { webhookUrl }),
    });
    res.json({ ok: true, settings: updated });
  });

  app.post('/api/admin/telegram-test', async (req, res) => {
    try {
      const { botToken, webhookUrl } = req.body;
      const token = botToken || db.getSettings().botToken;
      if (!token) {
        return res.status(400).json({ ok: false, error: 'No Telegram bot token provided' });
      }

      // 1. Test getMe
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const meJson = await meRes.json();
      if (!meJson.ok) {
        return res.status(400).json({ ok: false, error: `Telegram Error: ${meJson.description}` });
      }

      // 2. Set Webhook if requested
      let webhookStatus = null;
      if (webhookUrl) {
        const hookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
        webhookStatus = await hookRes.json();
      }

      res.json({
        ok: true,
        botInfo: meJson.result,
        webhookStatus,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // --- Vite / Static Handling ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[X2Telegram Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
