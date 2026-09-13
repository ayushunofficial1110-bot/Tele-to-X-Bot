import crypto from 'node:crypto';
import { db } from './db.ts';
import { automationQueue } from './queue.ts';
import { telegramClient, parseTelegramChannelInput } from './telegramClient.ts';
import { sourceMonitor } from './monitor.ts';
import { BotUser, Automation, TelegramInlineButton } from '../src/types.ts';

export interface TelegramMessageResponse {
  text: string;
  replyMarkup?: {
    inline_keyboard?: TelegramInlineButton[][];
  };
}

// In-memory wizard state for multi-step creation in Telegram chat
interface WizardState {
  step: 'direction' | 'source' | 'destination' | 'confirm';
  direction?: 'x_to_telegram' | 'telegram_to_x';
  source?: string;
  destination?: string;
  name?: string;
}

const userWizards: Map<string, WizardState> = new Map();

export class TelegramBotHandler {
  private isPolling = false;
  private pollingLoopRunning = false;
  private lastUpdateId = 0;
  private consecutiveErrors = 0;
  private isTokenUnauthorized = false;
  private lastUnauthorizedToken = '';

  /**
   * Main entry point for live Telegram Webhooks, Long Polling, and Web Simulator
   */
  public async handleUpdate(
    update: {
      update_id?: number;
      message?: {
        message_id: number;
        from: { id: number; username?: string; first_name?: string };
        chat: { id: number };
        text?: string;
      };
      channel_post?: {
        message_id: number;
        chat: { id: number; username?: string; title?: string };
        text?: string;
        caption?: string;
      };
      callback_query?: {
        id: string;
        from: { id: number; username?: string; first_name?: string };
        message?: { message_id: number; chat: { id: number } };
        data?: string;
      };
      my_chat_member?: any;
    },
    isLive = false
  ): Promise<TelegramMessageResponse> {
    // 0. Channel post detection for Telegram ➔ X automations
    if (update.channel_post) {
      console.log(
        `[Telegram Bot] Processing channel post update (msg_id=${update.channel_post.message_id}, chat=${update.channel_post.chat?.title || update.channel_post.chat?.id})`
      );
      sourceMonitor.handleIncomingTelegramChannelPost(update.channel_post);
      return { text: 'Channel post received' };
    }

    const fromUser = update.message?.from || update.callback_query?.from;
    if (!fromUser) {
      if (update.my_chat_member) {
        console.log(
          `[Telegram Bot] Chat member status updated in chat ${update.my_chat_member.chat?.id}: status=${update.my_chat_member.new_chat_member?.status}`
        );
      }
      return { text: 'Update acknowledged' };
    }

    const tgId = String(fromUser.id);
    const tgUsername = fromUser.username ? `@${fromUser.username}` : `@user_${tgId}`;
    const firstName = fromUser.first_name || 'User';

    // 1. Automatic User Registration via /start (No admin approval required)
    let user = db.getUser(tgId);
    if (!user) {
      const authToken = `tga_${tgId}_${crypto.randomBytes(8).toString('hex')}`;
      user = db.upsertUser({
        id: `usr_${tgId}`,
        telegramId: tgId,
        telegramUsername: tgUsername,
        firstName,
        authToken,
        plan: 'free',
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
      console.log(`[Telegram Bot] Registered new user from Telegram: ${tgUsername} (${tgId})`);
      db.logSystem('info', 'telegram_bot', `New user registered via /start: ${tgUsername} (${tgId})`, user.id);
    } else {
      user.lastActiveAt = new Date().toISOString();
      if (!user.authToken) {
        user.authToken = `tga_${tgId}_${crypto.randomBytes(8).toString('hex')}`;
      }
      db.upsertUser(user);
    }

    let response: TelegramMessageResponse;
    const text = update.message?.text?.trim() || '';
    const isStart = text.startsWith('/start') || text.toLowerCase() === 'start';
    const targetChatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;

    if (isStart) {
      console.log(`[Telegram Bot] 🚀 Processing /start command from user ${tgUsername} (${tgId}) in chat ${targetChatId}`);
      db.logSystem('info', 'telegram_bot', `Processing /start command from ${tgUsername} (${tgId})`);
    }

    // 2. Handle Callback Query (Inline Keyboard Clicks)
    if (update.callback_query?.data) {
      console.log(`[Telegram Bot] Handling callback query "${update.callback_query.data}" from user ${tgUsername}`);
      response = await this.handleCallback(user, update.callback_query.data);
      if (isLive && telegramClient.hasValidToken()) {
        await telegramClient.answerCallbackQuery(update.callback_query.id);
      }
    } else {
      // 3. Handle Text Messages and Commands
      response = await this.handleText(user, text);
    }

    // 4. Live Telegram Delivery
    if (isLive && telegramClient.hasValidToken() && targetChatId) {
      try {
        const sentResult = await telegramClient.sendMessage(targetChatId, response.text, {
          parse_mode: 'Markdown',
          reply_markup: response.replyMarkup,
        });
        if (isStart) {
          console.log(
            `[Telegram Bot] ✅ /start reply successfully sent to user ${tgUsername} (${tgId}) in chat ${targetChatId} (msg_id: ${sentResult?.message_id || 'ok'})`
          );
          db.logSystem('info', 'telegram_bot', `/start reply successfully sent to ${tgUsername} in chat ${targetChatId}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Telegram Bot] ❌ Live delivery failure for chat ${targetChatId}:`, msg);
        db.logSystem('warn', 'telegram_bot', `Live delivery notice for chat ${targetChatId}: ${msg}`);
      }
    }

    return response;
  }

  public startPolling() {
    if (this.isPolling) {
      console.log('[Telegram Bot] startPolling called, but polling worker is already active.');
      return;
    }
    this.isPolling = true;
    console.log('[Telegram Bot] Initializing Telegram Bot long-polling worker...');
    db.logSystem('info', 'telegram_bot', 'Telegram Bot long-polling worker started.');
    this.runPollingLoop();
  }

  public stopPolling() {
    this.isPolling = false;
    console.log('[Telegram Bot] Polling worker stopped.');
  }

  public wakeUpPolling(newToken?: string) {
    if (newToken) {
      this.isTokenUnauthorized = false;
      this.lastUnauthorizedToken = '';
      this.consecutiveErrors = 0;
    }
    if (!this.isPolling) {
      this.startPolling();
    }
  }

  public getBotStatus() {
    const activeToken = telegramClient.getActiveToken();
    return {
      isPolling: this.isPolling,
      isTokenUnauthorized: this.isTokenUnauthorized,
      hasToken: Boolean(activeToken && activeToken.length > 10),
      tokenMasked: activeToken && activeToken.length > 8 ? `${activeToken.slice(0, 5)}...${activeToken.slice(-4)}` : '',
      lastUpdateId: this.lastUpdateId,
    };
  }

  private async runPollingLoop() {
    if (this.pollingLoopRunning) {
      console.log('[Telegram Bot] Polling loop is already running.');
      return;
    }
    this.pollingLoopRunning = true;

    let webhookChecked = false;

    while (this.isPolling) {
      const token = telegramClient.getActiveToken();
      if (!token || token.length < 10) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      // If token changed, reset unauthorized state
      if (this.lastUnauthorizedToken && token !== this.lastUnauthorizedToken) {
        this.isTokenUnauthorized = false;
        this.lastUnauthorizedToken = '';
        this.consecutiveErrors = 0;
        webhookChecked = false;
      }

      // If this token was identified as unauthorized (401), pause polling until updated
      if (this.isTokenUnauthorized && token === this.lastUnauthorizedToken) {
        await new Promise((r) => setTimeout(r, 15000));
        continue;
      }

      // Check webhook status once on start to remove any conflicting webhook while keeping pending updates
      if (!webhookChecked) {
        try {
          const webhookInfo = await telegramClient.getWebhookInfo(token);
          if (webhookInfo && webhookInfo.url) {
            console.log(
              `[Telegram Bot] Active webhook found (${webhookInfo.url}). Clearing webhook to enable long-polling without losing pending updates...`
            );
            await telegramClient.deleteWebhook(false, token);
            console.log('[Telegram Bot] Webhook deleted successfully.');
          } else {
            console.log(
              `[Telegram Bot] Webhook status verified (clean). Pending updates in queue: ${webhookInfo?.pending_update_count ?? '0'}.`
            );
          }
          webhookChecked = true;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[Telegram Bot] Notice during webhook verification: ${msg}`);
          webhookChecked = true;
        }
      }

      try {
        const payload: any = {
          timeout: 25,
          limit: 100,
          allowed_updates: ['message', 'channel_post', 'callback_query', 'my_chat_member'],
        };
        // Advance offset: must be greater by 1 than highest update_id seen
        if (this.lastUpdateId > 0) {
          payload.offset = this.lastUpdateId + 1;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000); // 25s long-poll + 10s buffer

        const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const status = res.status;
          const text = await res.text();
          let json: any = null;
          try {
            json = JSON.parse(text);
          } catch {}

          if (status === 401) {
            this.isTokenUnauthorized = true;
            this.lastUnauthorizedToken = token;
            console.warn(
              `[Telegram Bot] ⚠️ Configured Bot Token is unauthorized or revoked by @BotFather (HTTP 401). Polling paused. Please set a valid TELEGRAM_BOT_TOKEN environment variable or configure in Admin Settings.`
            );
            db.logSystem(
              'warn',
              'telegram_bot',
              'Configured Telegram Bot Token returned HTTP 401 Unauthorized. Polling paused until a valid token is provided.'
            );
            await new Promise((r) => setTimeout(r, 15000));
            continue;
          }

          if (status === 409) {
            console.warn('[Telegram Bot] ⚠️ Conflict (409): Webhook active or duplicate getUpdates. Clearing webhook...');
            try {
              await telegramClient.deleteWebhook(false, token);
            } catch {}
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }

          if (status === 429) {
            const retryAfter = json?.parameters?.retry_after || 5;
            console.warn(`[Telegram Bot] ⚠️ Rate limited (429). Telegram requested waiting ${retryAfter}s.`);
            await new Promise((r) => setTimeout(r, retryAfter * 1000));
            continue;
          }

          console.warn(`[Telegram Bot] Notice: Telegram getUpdates returned status [${status}]: ${json?.description || text}`);
          this.consecutiveErrors++;
          const backoff = Math.min(15000, 2000 * Math.pow(1.5, this.consecutiveErrors));
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        const data: any = await res.json();
        this.consecutiveErrors = 0;

        if (data.ok && Array.isArray(data.result)) {
          const updates = data.result;

          if (updates.length > 0) {
            console.log(`[Telegram Bot] 📥 Received ${updates.length} update(s) from Telegram.`);
            for (const update of updates) {
              const uId = update.update_id;
              let updateType = 'unknown';
              let senderInfo = '';

              if (update.message) {
                const txt = update.message.text ? `"${update.message.text.substring(0, 35)}"` : '(media/attachment)';
                updateType = `message: ${txt}`;
                senderInfo = update.message.from?.username
                  ? `@${update.message.from.username}`
                  : `id=${update.message.from?.id}`;
              } else if (update.channel_post) {
                updateType = `channel_post: ${update.channel_post.chat?.title || update.channel_post.chat?.id}`;
                senderInfo = `chat_id=${update.channel_post.chat?.id}`;
              } else if (update.callback_query) {
                updateType = `callback_query: "${update.callback_query.data}"`;
                senderInfo = update.callback_query.from?.username
                  ? `@${update.callback_query.from.username}`
                  : `id=${update.callback_query.from?.id}`;
              } else if (update.my_chat_member) {
                updateType = `my_chat_member`;
                senderInfo = `chat_id=${update.my_chat_member.chat?.id}`;
              }

              console.log(`[Telegram Bot] ⚡ Processing update_id=${uId} [type: ${updateType}] from ${senderInfo}`);

              // Advance highest seen update ID so next request confirms this update to Telegram
              this.lastUpdateId = Math.max(this.lastUpdateId, uId);

              try {
                await this.handleUpdate(update, true);
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[Telegram Bot] ❌ Error executing handleUpdate for update_id=${uId}:`, msg);
              }
            }
          }
        }

        // Loop immediately for real-time responsiveness
        await new Promise((r) => setTimeout(r, 100));
      } catch (err: unknown) {
        const error = err as any;
        if (error?.name === 'AbortError') {
          // Timeout on fetch - standard completion of a 25s long poll when no updates occurred
          continue;
        }

        const msg = err instanceof Error ? err.message : String(err);
        this.consecutiveErrors++;
        const backoff = Math.min(15000, 1000 * Math.pow(1.5, this.consecutiveErrors));
        console.warn(`[Telegram Bot] ⚠️ Polling network pause (${msg}). Re-polling in ${Math.round(backoff / 1000)}s...`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    this.pollingLoopRunning = false;
  }

  private async handleText(user: BotUser, text: string): Promise<TelegramMessageResponse> {
    // Check if user is currently inside an onboarding creation wizard
    const wizard = userWizards.get(user.id);
    if (wizard && !text.startsWith('/')) {
      return this.handleWizardInput(user, wizard, text);
    }

    if (text.startsWith('/start') || text.toLowerCase() === 'menu' || text.toLowerCase() === 'start') {
      userWizards.delete(user.id);
      return this.getMainMenu(user);
    }

    if (text === '/sync' || text === '🔄 Sync Now') {
      sourceMonitor.checkSources().catch(() => {});
      return {
        text: `🔄 **Immediate Sync Triggered!**\n\nPolling configured X sources now for any new posts. If new content is found, it will be automatically filtered, rewritten, and dispatched!`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: '⚡ View Bridges', callback_data: 'view_automations' }],
            [{ text: '« Main Menu', callback_data: 'main_menu' }],
          ],
        },
      };
    }

    if (text === '/automations' || text === '⚡ My Automations') {
      return this.getAutomationsMenu(user);
    }

    if (text === '/new' || text === '➕ New Automation' || text === '🚀 Setup Bridge') {
      return this.startWizard(user);
    }

    if (text === '/connect_x' || text === '🔗 Connect X') {
      return this.getConnectXMenu(user);
    }

    if (text === '/settings' || text === '⚙️ Settings') {
      return this.getSettingsMenu(user);
    }

    if (text === '/otherbots' || text === '🤖 Other Bots') {
      return this.getOtherBotsMenu();
    }

    if (text === '/stats' || text === '📊 My Stats') {
      return this.getStatsMenu(user);
    }

    if (text === '/help' || text === 'ℹ️ Help & Guide') {
      return this.getHelpMenu();
    }

    return {
      text: `👋 Hello ${user.firstName}! Use the buttons below or send /start anytime to manage your cross-posting:`,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '⚡ My Bridges', callback_data: 'view_automations' },
            { text: '➕ Set Up Bridge', callback_data: 'new_automation_start' },
          ],
          [
            { text: '⚙️ Settings', callback_data: 'settings_view' },
            { text: '🌐 Web Dashboard', url: `${process.env.APP_URL || 'http://localhost:3000'}/?auth_token=${user.authToken}` },
          ],
        ],
      },
    };
  }

  private async handleCallback(user: BotUser, data: string): Promise<TelegramMessageResponse> {
    if (data === 'main_menu') {
      userWizards.delete(user.id);
      return this.getMainMenu(user);
    }

    if (data === 'view_automations') {
      return this.getAutomationsMenu(user);
    }

    if (data === 'new_automation_start') {
      return this.startWizard(user);
    }

    if (data === 'connect_x_view') {
      return this.getConnectXMenu(user);
    }

    if (data === 'settings_view') {
      return this.getSettingsMenu(user);
    }

    if (data === 'other_bots_view') {
      return this.getOtherBotsMenu();
    }

    if (data === 'stats_view') {
      return this.getStatsMenu(user);
    }

    if (data === 'help_view') {
      return this.getHelpMenu();
    }

    // Toggle user preferences
    if (data === 'toggle_setting_rewrite') {
      user.settings.autoRewrite = !user.settings.autoRewrite;
      db.upsertUser(user);
      return this.getSettingsMenu(user, `AI Rewriter is now ${user.settings.autoRewrite ? 'ON' : 'OFF'}`);
    }

    if (data === 'toggle_setting_adfilter') {
      user.settings.adFilterEnabled = !user.settings.adFilterEnabled;
      db.upsertUser(user);
      return this.getSettingsMenu(user, `Spam & Ad Filter is now ${user.settings.adFilterEnabled ? 'ON' : 'OFF'}`);
    }

    if (data === 'cycle_setting_format') {
      const formats: ('auto' | 'concise' | 'thread')[] = ['auto', 'concise', 'thread'];
      const currentIndex = formats.indexOf(user.settings.defaultPostFormat || 'auto');
      user.settings.defaultPostFormat = formats[(currentIndex + 1) % formats.length];
      db.upsertUser(user);
      return this.getSettingsMenu(user, `Post Format set to ${user.settings.defaultPostFormat.toUpperCase()}`);
    }

    // Wizard direction selection (Guided onboarding)
    if (data === 'wiz_dir_x2tg') {
      const wizard: WizardState = { step: 'source', direction: 'x_to_telegram' };
      userWizards.set(user.id, wizard);
      return {
        text: `🐦 **Step 1 of 2: Which X (Twitter) account do you want to monitor?**\n\nPlease type the X username in the chat below (for example: \`@OpenAI\` or \`@sama\`):\n\n*(No password or API key is required)*`,
        replyMarkup: {
          inline_keyboard: [[{ text: '« Cancel', callback_data: 'main_menu' }]],
        },
      };
    }

    if (data === 'wiz_dir_tg2x') {
      const isConnected = Boolean(user.settings.xCredentials?.oauth2AccessToken);
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const oauthUrl = `${appUrl}/api/auth/x/login?userId=${user.id}`;

      if (!isConnected) {
        return {
          text: `📢 **Step 1 of 2: Connect Your X (Twitter) Account**\n\nTo publish from your Telegram channel to X, please authorize your X account with 1-click using official X OAuth 2.0:\n\n🔒 *We never ask for your password or API keys. Authorize securely via twitter.com.*`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: '🔗 Authorize on X (Twitter)', url: oauthUrl }],
              [{ text: 'I have authorized, continue ➔', callback_data: 'wiz_dir_tg2x_authorized' }],
              [{ text: '« Cancel', callback_data: 'main_menu' }],
            ],
          },
        };
      }

      return this.proceedToTg2xStep2(user);
    }

    if (data === 'wiz_dir_tg2x_authorized') {
      return this.proceedToTg2xStep2(user);
    }

    if (data.startsWith('auto_toggle_')) {
      const autoId = data.replace('auto_toggle_', '');
      const auto = db.getAutomation(autoId, user.id);
      if (auto) {
        const newStatus = auto.status === 'active' ? 'paused' : 'active';
        db.updateAutomation(autoId, user.id, { status: newStatus });
        return this.getAutomationsMenu(user, `Automation is now ${newStatus.toUpperCase()}`);
      }
    }

    if (data.startsWith('auto_del_')) {
      const autoId = data.replace('auto_del_', '');
      db.deleteAutomation(autoId, user.id);
      return this.getAutomationsMenu(user, `Automation deleted successfully.`);
    }

    return this.getMainMenu(user);
  }

  private proceedToTg2xStep2(user: BotUser): TelegramMessageResponse {
    const wizard: WizardState = { step: 'source', direction: 'telegram_to_x' };
    userWizards.set(user.id, wizard);
    return {
      text: `📢 **Step 2 of 2: Which Telegram channel do you want to cross-post from?**\n\n1️⃣ Add this bot as an **Administrator** in your Telegram channel.\n2️⃣ Send your channel username or link (for example: \`@my_channel\` or \`https://t.me/my_channel\`):\n\n*(Type it in the chat below)*`,
      replyMarkup: {
        inline_keyboard: [[{ text: '« Cancel', callback_data: 'main_menu' }]],
      },
    };
  }

  private startWizard(user: BotUser): TelegramMessageResponse {
    userWizards.set(user.id, { step: 'direction' });
    return {
      text: `➕ **Set Up a Cross-Posting Bridge**\n\nChoose the sync direction for this bridge:`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🐦 X (Twitter) ➔ 📢 Telegram Channel', callback_data: 'wiz_dir_x2tg' }],
          [{ text: '📢 Telegram Channel ➔ 🐦 X (Twitter)', callback_data: 'wiz_dir_tg2x' }],
          [{ text: '« Back to Menu', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  private async handleWizardInput(user: BotUser, wizard: WizardState, text: string): Promise<TelegramMessageResponse> {
    const cleanInput = text.trim();

    if (wizard.step === 'source') {
      if (wizard.direction === 'x_to_telegram') {
        const handle = cleanInput.startsWith('@') ? cleanInput : `@${cleanInput}`;
        if (!/^@[a-zA-Z0-9_]{1,25}$/.test(handle)) {
          return {
            text: `⚠️ Please enter a valid X handle (for example: \`@OpenAI\` or \`@sama\`):`,
            replyMarkup: { inline_keyboard: [[{ text: '« Cancel', callback_data: 'main_menu' }]] },
          };
        }
        wizard.source = handle;
        wizard.step = 'destination';
        return {
          text: `✅ Source set to: **${handle}**\n\n📢 **Step 2 of 2: Where should new posts be published in Telegram?**\n\n1️⃣ Add this bot as an **Administrator** in your Telegram channel with *Post Messages* permission.\n2️⃣ Send your channel username or link below (for example: \`@my_channel\` or \`https://t.me/my_channel\`):`,
          replyMarkup: { inline_keyboard: [[{ text: '« Cancel', callback_data: 'main_menu' }]] },
        };
      } else {
        // telegram_to_x
        const parsed = parseTelegramChannelInput(cleanInput);
        if (!parsed.valid) {
          return {
            text: `⚠️ ${parsed.error}\n\nPlease enter your channel username (e.g. \`@my_channel\`) or invite link:`,
            replyMarkup: { inline_keyboard: [[{ text: '« Cancel', callback_data: 'main_menu' }]] },
          };
        }
        wizard.source = parsed.canonical;
        wizard.step = 'destination';

        const userXHandle = user.settings.xCredentials?.accountHandle || user.telegramUsername;
        wizard.destination = userXHandle;

        return this.finishWizard(user, wizard);
      }
    }

    if (wizard.step === 'destination') {
      let destination = cleanInput;
      if (wizard.direction === 'x_to_telegram') {
        const parsed = parseTelegramChannelInput(cleanInput);
        if (!parsed.valid) {
          return {
            text: `⚠️ ${parsed.error}\n\nPlease enter your channel username (e.g. \`@my_channel\`) or invite link:`,
            replyMarkup: { inline_keyboard: [[{ text: '« Cancel', callback_data: 'main_menu' }]] },
          };
        }
        destination = parsed.canonical;
      } else {
        destination = cleanInput.startsWith('@') ? cleanInput : `@${cleanInput}`;
      }

      wizard.destination = destination;
      return this.finishWizard(user, wizard);
    }

    return this.getMainMenu(user);
  }

  private finishWizard(user: BotUser, wizard: WizardState): TelegramMessageResponse {
    userWizards.delete(user.id);

    const newAuto: Automation = {
      id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      name: `${wizard.source} ➔ ${wizard.destination}`,
      direction: wizard.direction || 'x_to_telegram',
      source: wizard.source || '',
      destination: wizard.destination || '',
      status: 'active',
      settings: {
        filterPromotions: user.settings.adFilterEnabled ?? true,
        autoRewrite: user.settings.autoRewrite ?? true,
        format: user.settings.defaultPostFormat || 'auto',
        includeMedia: true,
        includeOriginalLink: true,
        preserveHashtags: true,
      },
      stats: {
        processedCount: 0,
        skippedAdsCount: 0,
        failedCount: 0,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.createAutomation(newAuto);
    db.logSystem('info', 'telegram_bot', `User activated cross-posting bridge: ${newAuto.name}`, user.id);

    const isXToTg = newAuto.direction === 'x_to_telegram';

    return {
      text: `🎉 **Cross-Posting Bridge is Live!**\n\n• **Bridge**: ${newAuto.name}\n• **Direction**: ${isXToTg ? 'X (Twitter) ➔ Telegram' : 'Telegram ➔ X (Twitter)'}\n• **Status**: 🟢 **Active**\n\n✨ **AI Fact Preservation**: Active (all dates, quotes & numbers preserved)\n🛡️ **Spam & Ad Filter**: Active (promotional ads & shills automatically blocked)\n📸 **Media Synchronization**: Active (photos, videos & galleries)`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '⚡ View My Bridges', callback_data: 'view_automations' }],
          [{ text: '➕ Set Up Another Bridge', callback_data: 'new_automation_start' }],
          [{ text: '🌐 Open Web Dashboard', url: `${process.env.APP_URL || 'http://localhost:3000'}/?auth_token=${user.authToken}` }],
          [{ text: '« Main Menu', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  private getMainMenu(user: BotUser): TelegramMessageResponse {
    const automations = db.getAutomations(user.id);
    const activeCount = automations.filter((a) => a.status === 'active').length;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const webLoginUrl = `${appUrl}/?auth_token=${user.authToken}`;

    // If new user with 0 automations, present the guided welcome onboarding
    if (automations.length === 0) {
      return {
        text: `👋 **Welcome, ${user.firstName}!**\n\n🤖 **X (Twitter) ↔ Telegram Sync Bot**\nI automatically sync your content between X and Telegram channels with:\n\n✨ **AI Fact-Preserving Rewrites**: Adapts tone while keeping 100% of facts, quotes, dates, and metrics.\n🛡️ **Spam & Ad Filter**: Discards token presales, crypto shills, and sponsor ads.\n🔒 **Zero API Keys Required**: Authorize with 1 click or set up public channels directly.\n\n🚀 **Let's set up your first bridge in 2 simple steps:**`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: '🐦 X (Twitter) ➔ 📢 Telegram Channel', callback_data: 'wiz_dir_x2tg' }],
            [{ text: '📢 Telegram Channel ➔ 🐦 X (Twitter)', callback_data: 'wiz_dir_tg2x' }],
            [
              { text: '🌐 Web Dashboard', url: webLoginUrl },
              { text: '⚙️ Settings', callback_data: 'settings_view' },
            ],
            [
              { text: '🤖 Recommended Bots', callback_data: 'other_bots_view' },
              { text: 'ℹ️ How It Works', callback_data: 'help_view' },
            ],
          ],
        },
      };
    }

    return {
      text: `👋 **Welcome back, ${user.firstName}!**\n\n📊 **Your Workspace:**\n• Active Bridges: **${activeCount} / ${automations.length}**\n• Posts Processed: **${user.postsProcessedCount || 0}**\n• Ads Blocked: **${user.postsFilteredAdsCount || 0}**\n\nSelect an option below or open your personal Web Dashboard:`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '⚡ My Bridges', callback_data: 'view_automations' }],
          [{ text: '➕ Set Up New Bridge', callback_data: 'new_automation_start' }],
          [
            { text: '🌐 Open Web Dashboard', url: webLoginUrl },
            { text: '⚙️ Settings', callback_data: 'settings_view' },
          ],
          [
            { text: '🔗 Connect X Account', callback_data: 'connect_x_view' },
            { text: '🤖 Recommended Bots', callback_data: 'other_bots_view' },
          ],
          [{ text: '📊 Statistics', callback_data: 'stats_view' }],
        ],
      },
    };
  }

  private getAutomationsMenu(user: BotUser, notice?: string): TelegramMessageResponse {
    const automations = db.getAutomations(user.id);

    let text = `${notice ? `ℹ️ *${notice}*\n\n` : ''}⚡ **Your Active Bridges (${automations.length})**\n\n`;

    if (automations.length === 0) {
      text += `You haven't set up any cross-posting bridges yet.\n\nClick **➕ Set Up New Bridge** below to link your first X handle and Telegram channel in 1 minute!`;
      return {
        text,
        replyMarkup: {
          inline_keyboard: [
            [{ text: '➕ Set Up New Bridge', callback_data: 'new_automation_start' }],
            [{ text: '« Main Menu', callback_data: 'main_menu' }],
          ],
        },
      };
    }

    const keyboard: TelegramInlineButton[][] = [];

    automations.forEach((auto, i) => {
      const icon = auto.status === 'active' ? '🟢' : '⏸️';
      text += `${i + 1}. ${icon} **${auto.name}**\n   Processed: ${auto.stats.processedCount} | Blocked Ads: ${auto.stats.skippedAdsCount}\n\n`;
      keyboard.push([
        { text: `${auto.status === 'active' ? '⏸️ Pause' : '▶️ Resume'} #${i + 1}`, callback_data: `auto_toggle_${auto.id}` },
        { text: `🗑️ Delete #${i + 1}`, callback_data: `auto_del_${auto.id}` },
      ]);
    });

    keyboard.push([{ text: '➕ Set Up Another Bridge', callback_data: 'new_automation_start' }]);
    keyboard.push([{ text: '« Main Menu', callback_data: 'main_menu' }]);

    return { text, replyMarkup: { inline_keyboard: keyboard } };
  }

  private getSettingsMenu(user: BotUser, notice?: string): TelegramMessageResponse {
    const rewriteOn = user.settings.autoRewrite !== false;
    const adFilterOn = user.settings.adFilterEnabled !== false;
    const format = user.settings.defaultPostFormat || 'auto';

    let text = `${notice ? `ℹ️ *${notice}*\n\n` : ''}⚙️ **Your Cross-Posting Settings**\n\nTap the buttons below to toggle your content preferences:\n\n• **AI Rewriter**: Rewrites posts naturally while strictly preserving quotes, facts, dates, and claims.\n• **Ad & Shill Filter**: Automatically detects and skips sponsored posts, token presales, and affiliate links.\n• **Post Format**: Choose between adaptive auto-sizing, 280-character concise posts, or multi-part threads.`;

    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: `✨ AI Rewriter: ${rewriteOn ? '🟢 ON' : '⚪ OFF'}`, callback_data: 'toggle_setting_rewrite' }],
          [{ text: `🛡️ Spam & Ad Filter: ${adFilterOn ? '🟢 ON' : '⚪ OFF'}`, callback_data: 'toggle_setting_adfilter' }],
          [{ text: `📝 Format: ${format.toUpperCase()}`, callback_data: 'cycle_setting_format' }],
          [{ text: '« Main Menu', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  private getConnectXMenu(user: BotUser): TelegramMessageResponse {
    const isConnected = Boolean(user.settings.xCredentials?.oauth2AccessToken);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const oauthUrl = `${appUrl}/api/auth/x/login?userId=${user.id}`;
    const handle = user.settings.xCredentials?.accountHandle;

    let text = `🔗 **Connect Your X (Twitter) Account**\n\n`;
    if (isConnected) {
      text += `✅ Your X account is **Connected via OAuth 2.0 PKCE**${handle ? ` (${handle})` : ''}.\n\nYou are authorized to post from Telegram to X. No passwords or API keys are stored on our servers.`;
      return {
        text,
        replyMarkup: {
          inline_keyboard: [
            [{ text: '⚡ View My Bridges', callback_data: 'view_automations' }],
            [{ text: '« Main Menu', callback_data: 'main_menu' }],
          ],
        },
      };
    }

    text += `To publish posts from Telegram to X, authorize your X account with 1-click using official X OAuth 2.0:\n\n1️⃣ Tap **Authorize on X (Twitter)** below.\n2️⃣ Authorize the official sync application.\n3️⃣ Return here to start publishing!`;

    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🔗 Authorize on X (Twitter)', url: oauthUrl }],
          [{ text: '« Main Menu', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  private getOtherBotsMenu(): TelegramMessageResponse {
    // Only fetch bots explicitly added and enabled by the administrator from the Admin Panel
    const bots = db.getOtherBots(true);

    if (bots.length === 0) {
      return {
        text: `🤖 **Recommended Partner Bots**\n\nThere are currently no other partner bots listed.\n\nFeatured tools configured by the administrator will appear here.`,
        replyMarkup: { inline_keyboard: [[{ text: '« Main Menu', callback_data: 'main_menu' }]] },
      };
    }

    let text = `🤖 **Recommended Partner Bots (${bots.length})**\n\nExplore tools verified by our team:\n\n`;
    const keyboard: TelegramInlineButton[][] = [];

    bots.forEach((bot) => {
      text += `${bot.icon || '🤖'} **${bot.name}**\n${bot.description}\n\n`;
      keyboard.push([
        { text: `${bot.icon || '🤖'} Open ${bot.name}`, url: bot.url || `https://t.me/${bot.username.replace('@', '')}` },
      ]);
    });

    keyboard.push([{ text: '« Main Menu', callback_data: 'main_menu' }]);
    return { text, replyMarkup: { inline_keyboard: keyboard } };
  }

  private getStatsMenu(user: BotUser): TelegramMessageResponse {
    const automations = db.getAutomations(user.id);
    const totalProcessed = automations.reduce((acc, a) => acc + a.stats.processedCount, 0);
    const totalSkippedAds = automations.reduce((acc, a) => acc + a.stats.skippedAdsCount, 0);
    const totalFailed = automations.reduce((acc, a) => acc + a.stats.failedCount, 0);

    return {
      text: `📊 **Your Processing Statistics**\n\n👤 Account: **${user.telegramUsername}**\n📅 Member Since: **${new Date(user.createdAt).toLocaleDateString()}**\n\n📈 **Deliveries:**\n• Active Bridges: **${automations.filter((a) => a.status === 'active').length}**\n• Posts Processed & Published: **${totalProcessed}**\n• Commercial Ads & Spam Filtered: **${totalSkippedAds}**\n• Failed Deliveries: **${totalFailed}**\n\n💡 *AI preserves 100% of facts, names, dates, and numbers while removing promotional clutter.*`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '⚡ View My Bridges', callback_data: 'view_automations' }],
          [{ text: '« Main Menu', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  private getHelpMenu(): TelegramMessageResponse {
    return {
      text: `ℹ️ **Simple Setup Guide**\n\n**1. For X (Twitter) ➔ Telegram:**\n• Add this bot as an **Administrator** in your Telegram channel with *Post Messages* permission.\n• Send /new or tap **➕ Set Up Bridge**.\n• Select *X ➔ Telegram* and provide the X handle and your channel link.\n\n**2. For Telegram ➔ X (Twitter):**\n• Tap **🔗 Connect X Account** to authorize via official X OAuth 2.0.\n• Add the bot to your Telegram channel.\n• Posts in your channel will be published to X automatically!\n\n**Commands:**\n/start - Open main menu\n/new - Set up a new cross-posting bridge\n/automations - Manage active bridges\n/settings - Toggle AI rewrite & ad filter\n/otherbots - View recommended partner bots\n/help - Show this guide`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '➕ Set Up Bridge Now', callback_data: 'new_automation_start' }],
          [{ text: '« Main Menu', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  public async broadcast(
    text: string,
    buttonText?: string,
    buttonUrl?: string
  ): Promise<{ sent: number; failed: number; total: number }> {
    const users = db.getUsers();
    let sent = 0;
    let failed = 0;

    const replyMarkup =
      buttonText && buttonUrl
        ? { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] }
        : undefined;

    for (const u of users) {
      if (!u.telegramId) continue;
      try {
        if (telegramClient.hasValidToken()) {
          await telegramClient.sendMessage(u.telegramId, text, {
            parse_mode: 'Markdown',
            reply_markup: replyMarkup,
          });
          sent++;
        } else {
          sent++;
        }
      } catch {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 60));
    }

    db.logSystem('info', 'telegram_bot', `Broadcast completed: delivered to ${sent}/${users.length} users`);
    return { sent, failed, total: users.length };
  }
}

export const telegramBot = new TelegramBotHandler();
