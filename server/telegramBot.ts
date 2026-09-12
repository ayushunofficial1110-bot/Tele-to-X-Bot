import { db } from './db.ts';
import { automationQueue } from './queue.ts';
import { BotUser, Automation, TelegramInlineButton } from '../src/types.ts';

export interface TelegramMessageResponse {
  text: string;
  replyMarkup?: {
    inline_keyboard?: TelegramInlineButton[][];
  };
}

// In-memory wizard state for multi-step creation
interface WizardState {
  step: 'direction' | 'source' | 'destination' | 'confirm';
  direction?: 'x_to_telegram' | 'telegram_to_x';
  source?: string;
  destination?: string;
  name?: string;
}

const userWizards: Map<string, WizardState> = new Map();

export class TelegramBotHandler {
  /**
   * Main entry point for both live Telegram Webhook and Web Simulator
   */
  public async handleUpdate(update: {
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
  }): Promise<TelegramMessageResponse> {
    const fromUser = update.message?.from || update.callback_query?.from;
    if (!fromUser) {
      return { text: 'Invalid update payload' };
    }

    const tgId = String(fromUser.id);
    const tgUsername = fromUser.username ? `@${fromUser.username}` : `@user_${tgId}`;
    const firstName = fromUser.first_name || 'User';

    // 1. Ensure user exists in multi-tenant DB (isolated by user ID)
    let user = db.getUser(tgId);
    if (!user) {
      user = db.upsertUser({
        id: `user_${tgId}`,
        telegramId: tgId,
        telegramUsername: tgUsername,
        firstName,
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
      db.logSystem('info', 'telegram_bot', `New SaaS user registered via Telegram: ${tgUsername} (${tgId})`, user.id);
    }

    // 2. Handle Callback Query (Inline Keyboard Clicks)
    if (update.callback_query?.data) {
      return this.handleCallback(user, update.callback_query.data);
    }

    // 3. Handle Text Messages and Commands
    const text = update.message?.text?.trim() || '';
    return this.handleText(user, text);
  }

  private async handleText(user: BotUser, text: string): Promise<TelegramMessageResponse> {
    // Check if user is currently in a step-by-step wizard
    const wizard = userWizards.get(user.id);
    if (wizard && !text.startsWith('/')) {
      return this.handleWizardInput(user, wizard, text);
    }

    if (text === '/start' || text.toLowerCase() === 'menu' || text.toLowerCase() === 'start') {
      userWizards.delete(user.id);
      return this.getMainMenu(user);
    }

    if (text === '/automations' || text === '⚡ My Automations') {
      return this.getAutomationsMenu(user);
    }

    if (text === '/new' || text === '➕ New Automation') {
      return this.startWizard(user);
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

    // Fallback response with main navigation
    return {
      text: `👋 Hello ${user.firstName}! I didn't recognize that command.\n\nUse the buttons below to manage your automations, or type /start to reset.`,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '⚡ My Automations', callback_data: 'view_automations' },
            { text: '➕ New Automation', callback_data: 'new_automation_start' },
          ],
          [
            { text: '🤖 Other Bots', callback_data: 'other_bots_view' },
            { text: 'ℹ️ Setup Guide', callback_data: 'help_view' },
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

    // Wizard direction selection
    if (data === 'wiz_dir_x2tg') {
      const wizard: WizardState = { step: 'source', direction: 'x_to_telegram' };
      userWizards.set(user.id, wizard);
      return {
        text: `🚀 **Step 1/3: Select X (Twitter) Source**\n\nEnter the X username/handle you want to monitor (e.g. \`@OpenAI\` or \`@sama\`):\n\n*(Type the handle in chat below)*`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: 'Use @techcrunch', callback_data: 'wiz_source_techcrunch' }],
            [{ text: 'Use @OpenAI', callback_data: 'wiz_source_openai' }],
            [{ text: '« Cancel', callback_data: 'main_menu' }],
          ],
        },
      };
    }

    if (data === 'wiz_dir_tg2x') {
      const wizard: WizardState = { step: 'source', direction: 'telegram_to_x' };
      userWizards.set(user.id, wizard);
      return {
        text: `🚀 **Step 1/3: Select Source Telegram Channel**\n\nEnter your Telegram channel username or ID (e.g. \`@my_crypto_hub\` or \`-1001234567890\`):\n\n*(Make sure this bot is added as an Administrator to the channel)*`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: 'Use @tech_pulse_daily', callback_data: 'wiz_source_techpulse' }],
            [{ text: '« Cancel', callback_data: 'main_menu' }],
          ],
        },
      };
    }

    // Fast-track wizard sources
    if (data.startsWith('wiz_source_')) {
      const wizard = userWizards.get(user.id);
      if (wizard) {
        const sourceMap: Record<string, string> = {
          wiz_source_techcrunch: '@techcrunch',
          wiz_source_openai: '@OpenAI',
          wiz_source_techpulse: '@tech_pulse_daily',
        };
        const source = sourceMap[data] || '@tech_news';
        wizard.source = source;
        wizard.step = 'destination';
        return {
          text: `✅ Source set to: **${source}**\n\n🎯 **Step 2/3: Set Destination**\n${
            wizard.direction === 'x_to_telegram'
              ? 'Enter your Telegram Channel username (e.g. `@my_news_feed`):'
              : 'Enter your authorized X destination handle (e.g. `@my_x_account`):'
          }`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: 'Use Default Test Channel (@my_feed)', callback_data: 'wiz_dest_default' }],
              [{ text: '« Cancel', callback_data: 'main_menu' }],
            ],
          },
        };
      }
    }

    if (data === 'wiz_dest_default') {
      const wizard = userWizards.get(user.id);
      if (wizard) {
        wizard.destination = wizard.direction === 'x_to_telegram' ? '@my_telegram_channel' : `@${user.telegramUsername.replace('@', '')}_x`;
        return this.finishWizard(user, wizard);
      }
    }

    // Toggle automation status
    if (data.startsWith('toggle_auto_')) {
      const autoId = data.replace('toggle_auto_', '');
      const auto = db.getAutomation(autoId, user.id);
      if (auto) {
        const newStatus = auto.status === 'active' ? 'paused' : 'active';
        db.updateAutomation(autoId, user.id, { status: newStatus });
        return {
          text: `⚡ Automation **${auto.name}** is now **${newStatus.toUpperCase()}**.`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: '« Back to Automations', callback_data: 'view_automations' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }],
            ],
          },
        };
      }
    }

    // Delete automation
    if (data.startsWith('delete_auto_')) {
      const autoId = data.replace('delete_auto_', '');
      db.deleteAutomation(autoId, user.id);
      return {
        text: `🗑️ Automation removed successfully.`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: '« Back to Automations', callback_data: 'view_automations' }],
            [{ text: '🏠 Main Menu', callback_data: 'main_menu' }],
          ],
        },
      };
    }

    // Trigger test run on automation
    if (data.startsWith('test_auto_')) {
      const autoId = data.replace('test_auto_', '');
      const auto = db.getAutomation(autoId, user.id);
      if (auto) {
        const samplePost = {
          sourcePostId: `test_${Date.now()}`,
          sourceAuthor: auto.source,
          sourceContent: `Major milestone reached: autonomous AI agents now reliably execute distributed multi-cloud deployments with strict factual constraints. Zero human intervention needed.`,
          sourceUrl: `https://x.com/${auto.source.replace('@', '')}/status/${Date.now()}`,
        };
        const res = automationQueue.enqueuePost(auto, samplePost);
        return {
          text: `🚀 Test post enqueued for **${auto.name}**!\n\nStatus: ${res.status}\n\nThe queue worker will run the post through the Gemini Fact-Preserving Rewriter & Ad Filter, then dispatch to ${auto.destination}.`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: '📊 View My Logs', callback_data: 'stats_view' }],
              [{ text: '« Back to Automations', callback_data: 'view_automations' }],
            ],
          },
        };
      }
    }

    // Track click on other bot
    if (data.startsWith('bot_click_')) {
      const botId = data.replace('bot_click_', '');
      db.recordBotClick(botId);
      const bots = db.getOtherBots(false);
      const bot = bots.find((b) => b.id === botId);
      if (bot) {
        return {
          text: `${bot.icon} **${bot.name}** (${bot.username})\n\n${bot.description}\n\nCategory: ${bot.category}`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: `🚀 Open ${bot.name}`, url: bot.url }],
              [{ text: '« Back to Other Bots', callback_data: 'other_bots_view' }],
            ],
          },
        };
      }
    }

    return this.getMainMenu(user);
  }

  private handleWizardInput(user: BotUser, wizard: WizardState, text: string): TelegramMessageResponse {
    if (wizard.step === 'source') {
      wizard.source = text.trim();
      wizard.step = 'destination';
      return {
        text: `✅ Source set: **${wizard.source}**\n\n🎯 **Step 2/3: Set Destination**\n${
          wizard.direction === 'x_to_telegram'
            ? 'Enter your destination Telegram Channel (e.g. `@my_channel_name`):'
            : 'Enter your destination X handle (e.g. `@my_x_handle`):'
        }`,
        replyMarkup: {
          inline_keyboard: [[{ text: '« Cancel', callback_data: 'main_menu' }]],
        },
      };
    }

    if (wizard.step === 'destination') {
      wizard.destination = text.trim();
      return this.finishWizard(user, wizard);
    }

    return this.getMainMenu(user);
  }

  private finishWizard(user: BotUser, wizard: WizardState): TelegramMessageResponse {
    const direction = wizard.direction || 'x_to_telegram';
    const source = wizard.source || '@source';
    const destination = wizard.destination || '@destination';
    const name = `${source} ➔ ${destination}`;

    const newAuto: Automation = {
      id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      name,
      direction,
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
    userWizards.delete(user.id);

    return {
      text: `🎉 **Automation Activated Successfully!**\n\n**Name:** ${name}\n**Direction:** ${
        direction === 'x_to_telegram' ? 'X (Twitter) ➔ Telegram Channel' : 'Telegram Channel ➔ X'
      }\n**Smart Features:**\n• ✨ Fact-Preserving Rewriting: **Enabled**\n• 🛡️ Ad & Promo Detector: **Active**\n• ⚡ Rate-limit protection: **Active**\n\nNew posts will be automatically monitored, reformatted, and forwarded!`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🧪 Send Test Post Now', callback_data: `test_auto_${newAuto.id}` }],
          [{ text: '⚡ View All Automations', callback_data: 'view_automations' }],
          [{ text: '🏠 Main Menu', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  private getMainMenu(user: BotUser): TelegramMessageResponse {
    const automations = db.getAutomations(user.id);
    const activeCount = automations.filter((a) => a.status === 'active').length;

    const text = `🤖 **X (Twitter) ↔ Telegram Automation**\n\nWelcome back, **${user.firstName}**!\n\n💼 **Plan:** ${user.plan.toUpperCase()}\n⚡ **Active Automations:** ${activeCount} / ${automations.length}\n📊 **Posts Forwarded:** ${user.postsProcessedCount}\n🛡️ **Ads Blocked:** ${user.postsFilteredAdsCount}\n\nSeamlessly cross-post between X and Telegram channels with strict fact-preserving AI rewriting and promotional spam filtering.`;

    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '⚡ My Automations', callback_data: 'view_automations' },
            { text: '➕ New Automation', callback_data: 'new_automation_start' },
          ],
          [
            { text: '⚙️ Settings & X Auth', callback_data: 'settings_view' },
            { text: '🤖 Other Bots', callback_data: 'other_bots_view' },
          ],
          [
            { text: '📊 My Stats & Logs', callback_data: 'stats_view' },
            { text: 'ℹ️ Setup Guide', callback_data: 'help_view' },
          ],
        ],
      },
    };
  }

  private getAutomationsMenu(user: BotUser): TelegramMessageResponse {
    const automations = db.getAutomations(user.id);

    if (automations.length === 0) {
      return {
        text: `⚡ **My Automations**\n\nYou have no automations configured yet.\n\nClick **➕ New Automation** to connect your first X account or Telegram channel in 30 seconds!`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: '➕ Create Automation', callback_data: 'new_automation_start' }],
            [{ text: '« Main Menu', callback_data: 'main_menu' }],
          ],
        },
      };
    }

    let text = `⚡ **Your Automations (${automations.length})**\n\n`;
    const keyboard: TelegramInlineButton[][] = [];

    automations.forEach((auto, i) => {
      const statusIcon = auto.status === 'active' ? '🟢 Active' : '⏸️ Paused';
      text += `**${i + 1}. ${auto.name}**\nStatus: ${statusIcon} | Processed: ${auto.stats.processedCount} | Ads Skipped: ${auto.stats.skippedAdsCount}\n\n`;

      keyboard.push([
        {
          text: `${auto.status === 'active' ? '⏸️ Pause' : '▶️ Resume'} #${i + 1}`,
          callback_data: `toggle_auto_${auto.id}`,
        },
        {
          text: `🧪 Test #${i + 1}`,
          callback_data: `test_auto_${auto.id}`,
        },
        {
          text: `🗑️ Delete`,
          callback_data: `delete_auto_${auto.id}`,
        },
      ]);
    });

    keyboard.push([
      { text: '➕ Add Another Automation', callback_data: 'new_automation_start' },
      { text: '« Main Menu', callback_data: 'main_menu' },
    ]);

    return { text, replyMarkup: { inline_keyboard: keyboard } };
  }

  private startWizard(user: BotUser): TelegramMessageResponse {
    userWizards.set(user.id, { step: 'direction' });
    return {
      text: `➕ **Create New Automation**\n\nChoose the cross-posting direction:`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '1️⃣ X (Twitter) ➔ Telegram Channel', callback_data: 'wiz_dir_x2tg' }],
          [{ text: '2️⃣ Telegram Channel ➔ X (Twitter)', callback_data: 'wiz_dir_tg2x' }],
          [{ text: '« Cancel', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  private getSettingsMenu(user: BotUser): TelegramMessageResponse {
    const creds = user.settings.xCredentials;
    const xStatus = creds?.bearerToken || creds?.accessToken ? '🟢 Connected' : '⚪ Not Linked (Using Public Monitored Handles)';

    const text = `⚙️ **Your Isolated Settings & Keys**\n\nUser ID: \`${user.id}\`\nPlan: **${user.plan.toUpperCase()}**\n\n**X (Twitter) Authorization:**\nStatus: ${xStatus}\nHandle: ${creds?.accountHandle || 'None specified'}\n\n**Automated AI Engine:**\n• Fact-Preserving Rewriter: ${user.settings.autoRewrite ? '✅ Enabled' : '❌ Off'}\n• Ad & Spam Filter: ${user.settings.adFilterEnabled ? '✅ Enabled' : '❌ Off'}\n• Strict Fact Verification: ${user.settings.preserveFactsStrict ? '✅ Strict' : 'Normal'}\n\n*Note: Your API credentials and channel tokens are fully encrypted and isolated strictly to your user ID.*`;

    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '➕ Create Automation', callback_data: 'new_automation_start' }],
          [{ text: '« Main Menu', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  private getOtherBotsMenu(): TelegramMessageResponse {
    const bots = db.getOtherBots(true);

    let text = `🤖 **Recommended Telegram Bots**\n\nExplore our suite of specialized Telegram bots:\n\n`;
    const keyboard: TelegramInlineButton[][] = [];

    bots.forEach((bot) => {
      text += `${bot.icon} **${bot.name}** (${bot.username})\n${bot.description}\nCategory: \`${bot.category}\`\n\n`;
      keyboard.push([
        {
          text: `${bot.icon} Open ${bot.name}`,
          callback_data: `bot_click_${bot.id}`,
        },
      ]);
    });

    keyboard.push([{ text: '« Main Menu', callback_data: 'main_menu' }]);

    return { text, replyMarkup: { inline_keyboard: keyboard } };
  }

  private getStatsMenu(user: BotUser): TelegramMessageResponse {
    const posts = db.getPostLogs(user.id, 5);
    let text = `📊 **My Usage & Forwarding Logs**\n\n`;
    text += `• Total Published: **${user.postsProcessedCount}**\n`;
    text += `• Promotional Posts Filtered: **${user.postsFilteredAdsCount}**\n`;
    text += `• Failed Retries: **${user.postsFailedCount}**\n\n`;
    text += `**Recent 5 Posts:**\n`;

    if (posts.length === 0) {
      text += `_No posts recorded yet. Trigger a test run or wait for live updates._\n`;
    } else {
      posts.forEach((p, idx) => {
        const statusBadge =
          p.status === 'published'
            ? '✅ Published'
            : p.status === 'filtered_ad'
            ? '🛡️ Ad Filtered'
            : '⚠️ ' + p.status;
        const time = new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        text += `${idx + 1}. [${time}] ${statusBadge} - ${p.sourceAuthor}\n"${p.sourceContent.slice(0, 60)}..."\n\n`;
      });
    }

    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '⚡ My Automations', callback_data: 'view_automations' }],
          [{ text: '« Main Menu', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  private getHelpMenu(): TelegramMessageResponse {
    const text = `ℹ️ **Setup Guide: Adding the Bot to Channels**\n\n**1. For X ➔ Telegram Channel:**\n1. Open your Telegram Channel settings.\n2. Tap **Administrators** ➔ **Add Admin**.\n3. Search for this bot's username and add it.\n4. Grant **"Post Messages"** permission.\n5. In this bot, create an automation with your channel username (e.g. \`@my_channel\`).\n\n**2. For Telegram ➔ X:**\n1. Add the bot to your Telegram Channel as Admin.\n2. When you publish a post in your channel, this bot will receive the post.\n3. Long posts are automatically rewritten or converted into threads fitting X 280-char limits.\n\n**3. Smart Ad Filtering:**\nOur built-in Gemini AI automatically detects token shills, affiliate codes, presales, and promo hashtags to keep your channels clean.`;

    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '➕ Create Automation Now', callback_data: 'new_automation_start' }],
          [{ text: '« Main Menu', callback_data: 'main_menu' }],
        ],
      },
    };
  }

  /**
   * Broadcast message to all users in database (Admin feature)
   */
  public async broadcast(messageText: string, buttonText?: string, buttonUrl?: string): Promise<{ sent: number; total: number }> {
    const users = db.getUsers();
    const settings = db.getSettings();
    let sent = 0;

    for (const user of users) {
      if (settings.botToken && !settings.botToken.includes('TODO')) {
        try {
          const body: Record<string, unknown> = {
            chat_id: user.telegramId,
            text: messageText,
            parse_mode: 'Markdown',
          };
          if (buttonText && buttonUrl) {
            body.reply_markup = {
              inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
            };
          }
          await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          sent++;
        } catch {
          // continue
        }
      } else {
        // In simulation mode, count as sent
        sent++;
      }
    }

    db.logSystem('info', 'telegram_bot', `Broadcast completed: delivered to ${sent}/${users.length} users`);
    return { sent, total: users.length };
  }
}

export const telegramBot = new TelegramBotHandler();
