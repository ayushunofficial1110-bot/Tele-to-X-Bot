import fs from 'fs';
import path from 'path';
import {
  BotUser,
  Automation,
  PostLog,
  OtherBot,
  SystemLog,
  SystemSettings,
  SystemStats,
} from '../src/types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface DatabaseSchema {
  users: BotUser[];
  automations: Automation[];
  posts: PostLog[];
  otherBots: OtherBot[];
  systemLogs: SystemLog[];
  settings: SystemSettings;
}

const startTime = Date.now();

const DEFAULT_SETTINGS: SystemSettings = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  botUsername: 'X2TelegramAutoBot',
  webhookUrl: `${process.env.APP_URL || 'https://my-app.run.app'}/api/telegram/webhook`,
  isWebhookActive: false,
  adminSecret: process.env.ADMIN_KEY || 'admin_secret_key',
  autoProcessSampleQueue: true,
};

const DEFAULT_OTHER_BOTS: OtherBot[] = [
  {
    id: 'bot_crypto_whale',
    name: 'CryptoWhale Alert',
    username: '@CryptoWhaleTrackerBot',
    description: 'Instant alerts on large on-chain transactions, exchange inflows, and token movements across 12 blockchains.',
    category: 'Crypto & Trading',
    url: 'https://t.me/CryptoWhaleTrackerBot',
    icon: '🐋',
    badge: 'Trending',
    enabled: true,
    clicksCount: 1420,
    order: 1,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'bot_ai_summarizer',
    name: 'OmniAI Article Reader',
    username: '@OmniArticleReaderBot',
    description: 'Forward any paywalled or long article URL to get a 30-second bulleted executive summary directly in Telegram.',
    category: 'Productivity',
    url: 'https://t.me/OmniArticleReaderBot',
    icon: '⚡',
    badge: 'Popular',
    enabled: true,
    clicksCount: 2890,
    order: 2,
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
  },
  {
    id: 'bot_social_scheduler',
    name: 'PostPilot Social Scheduler',
    username: '@PostPilotSchedulerBot',
    description: 'Schedule broadcasts, format rich Telegram markdown polls, and preview visual media threads before publishing.',
    category: 'Marketing',
    url: 'https://t.me/PostPilotSchedulerBot',
    icon: '📅',
    enabled: true,
    clicksCount: 934,
    order: 3,
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
  },
  {
    id: 'bot_rss_feed',
    name: 'FeedMatrix Instant RSS',
    username: '@FeedMatrixBot',
    description: 'Subscribe to any RSS, YouTube, or Substack publication and receive real-time updates directly in your private channels.',
    category: 'News & Media',
    url: 'https://t.me/FeedMatrixBot',
    icon: '📰',
    enabled: true,
    clicksCount: 651,
    order: 4,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

const DEFAULT_USERS: BotUser[] = [
  {
    id: 'user_alice_tech',
    telegramId: '78291041',
    telegramUsername: '@alice_tech',
    firstName: 'Alice Chen',
    plan: 'pro',
    postsProcessedCount: 42,
    postsFailedCount: 1,
    postsFilteredAdsCount: 8,
    status: 'active',
    settings: {
      autoRewrite: true,
      adFilterEnabled: true,
      preserveFactsStrict: true,
      defaultPostFormat: 'auto',
      xCredentials: {
        accountHandle: '@alicewriter',
        bearerToken: 'x_sec_bearer_alice_sample',
      },
      telegramChannelId: '@tech_pulse_daily',
    },
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    lastActiveAt: new Date().toISOString(),
  },
  {
    id: 'user_bob_crypto',
    telegramId: '99201488',
    telegramUsername: '@bob_crypto',
    firstName: 'Bob Martinez',
    plan: 'free',
    postsProcessedCount: 19,
    postsFailedCount: 0,
    postsFilteredAdsCount: 14,
    status: 'active',
    settings: {
      autoRewrite: true,
      adFilterEnabled: true,
      preserveFactsStrict: true,
      defaultPostFormat: 'thread',
      xCredentials: {
        accountHandle: '@bob_defi',
      },
      telegramChannelId: '@crypto_insider_signals',
    },
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    lastActiveAt: new Date().toISOString(),
  },
];

const DEFAULT_AUTOMATIONS: Automation[] = [
  {
    id: 'auto_alice_01',
    userId: 'user_alice_tech',
    name: 'X (@OpenAI) ➔ @tech_pulse_daily',
    direction: 'x_to_telegram',
    source: '@OpenAI',
    destination: '@tech_pulse_daily',
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
      processedCount: 28,
      skippedAdsCount: 2,
      failedCount: 0,
      lastRunAt: new Date(Date.now() - 15 * 60000).toISOString(),
    },
    lastSeenPostId: '1839201948271049281',
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'auto_alice_02',
    userId: 'user_alice_tech',
    name: '@tech_pulse_daily ➔ X (@alicewriter)',
    direction: 'telegram_to_x',
    source: '@tech_pulse_daily',
    destination: '@alicewriter',
    status: 'active',
    settings: {
      filterPromotions: true,
      autoRewrite: true,
      format: 'thread',
      includeMedia: true,
      includeOriginalLink: false,
      preserveHashtags: true,
    },
    stats: {
      processedCount: 14,
      skippedAdsCount: 0,
      failedCount: 1,
      lastRunAt: new Date(Date.now() - 60 * 60000).toISOString(),
    },
    lastSeenPostId: 'msg_98214',
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'auto_bob_01',
    userId: 'user_bob_crypto',
    name: 'X (@VitalikButerin) ➔ @crypto_insider_signals',
    direction: 'x_to_telegram',
    source: '@VitalikButerin',
    destination: '@crypto_insider_signals',
    status: 'active',
    settings: {
      filterPromotions: true,
      autoRewrite: true,
      format: 'concise',
      includeMedia: true,
      includeOriginalLink: true,
      preserveHashtags: false,
    },
    stats: {
      processedCount: 19,
      skippedAdsCount: 14,
      failedCount: 0,
      lastRunAt: new Date(Date.now() - 40 * 60000).toISOString(),
    },
    lastSeenPostId: '1839109283746152431',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEFAULT_POSTS: PostLog[] = [
  {
    id: 'post_log_101',
    userId: 'user_alice_tech',
    automationId: 'auto_alice_01',
    direction: 'x_to_telegram',
    sourcePostId: '1839201948271049281',
    sourceAuthor: '@OpenAI',
    sourceContent: 'Introducing our newest reasoning models for complex mathematics, coding, and scientific benchmark evaluation. Available today in preview.',
    sourceUrl: 'https://x.com/OpenAI/status/1839201948271049281',
    media: [
      {
        type: 'image',
        url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
      },
    ],
    processedContent: '🧠 OpenAI has released its latest family of reasoning models, engineered specifically for advanced mathematics, software engineering, and scientific benchmarks. The models are available starting today in preview.\n\n🔗 Original: https://x.com/OpenAI/status/1839201948271049281',
    isAd: false,
    adConfidence: 0.05,
    adReasoning: 'Official product release announcement from verified source without affiliate links or promotional coupon markers.',
    adCategory: 'organic',
    status: 'published',
    attempts: 1,
    maxAttempts: 3,
    publishedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    createdAt: new Date(Date.now() - 16 * 60000).toISOString(),
  },
  {
    id: 'post_log_102',
    userId: 'user_alice_tech',
    automationId: 'auto_alice_01',
    direction: 'x_to_telegram',
    sourcePostId: '1839201948271049299',
    sourceAuthor: '@OpenAI_Affiliate_Bot',
    sourceContent: 'URGENT: Win $10,000 in free AI credits! Click t.co/freecredit token presale ends in 2 hours! 🚀🚀 #ad',
    sourceUrl: 'https://x.com/fake/status/1839201948271049299',
    media: [],
    processedContent: '[Blocked Ad Content]',
    isAd: true,
    adConfidence: 0.98,
    adReasoning: 'Detected high-confidence spam markers: token presale, urgency claims, suspicious shortlink, and explicit #ad tag.',
    adCategory: 'crypto_shill',
    status: 'filtered_ad',
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
  },
];

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          users: parsed.users || DEFAULT_USERS,
          automations: parsed.automations || DEFAULT_AUTOMATIONS,
          posts: parsed.posts || DEFAULT_POSTS,
          otherBots: parsed.otherBots || DEFAULT_OTHER_BOTS,
          systemLogs: parsed.systemLogs || [],
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        };
      }
    } catch (err) {
      console.error('[DB] Failed to read database file, initializing defaults:', err);
    }

    const initial: DatabaseSchema = {
      users: DEFAULT_USERS,
      automations: DEFAULT_AUTOMATIONS,
      posts: DEFAULT_POSTS,
      otherBots: DEFAULT_OTHER_BOTS,
      systemLogs: [
        {
          id: 'log_init',
          timestamp: new Date().toISOString(),
          level: 'info',
          source: 'engine',
          message: 'System database initialized with multi-tenant SaaS schema.',
        },
      ],
      settings: DEFAULT_SETTINGS,
    };
    this.saveData(initial);
    return initial;
  }

  private saveData(dataToSave: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tmpPath, DB_FILE);
    } catch (err) {
      console.error('[DB] Failed to persist data to disk:', err);
    }
  }

  private persist() {
    this.saveData(this.data);
  }

  // --- Users ---
  public getUsers(): BotUser[] {
    return this.data.users;
  }

  public getUser(userIdOrTgId: string): BotUser | undefined {
    return this.data.users.find(
      (u) => u.id === userIdOrTgId || u.telegramId === userIdOrTgId || u.telegramUsername.toLowerCase() === userIdOrTgId.toLowerCase()
    );
  }

  public upsertUser(user: BotUser): BotUser {
    const idx = this.data.users.findIndex((u) => u.id === user.id || u.telegramId === user.telegramId);
    if (idx >= 0) {
      this.data.users[idx] = { ...this.data.users[idx], ...user, lastActiveAt: new Date().toISOString() };
    } else {
      this.data.users.push(user);
    }
    this.persist();
    return user;
  }

  // --- Automations (Strict user isolation) ---
  public getAutomations(userId: string): Automation[] {
    return this.data.automations.filter((a) => a.userId === userId);
  }

  public getAllAutomations(): Automation[] {
    return this.data.automations;
  }

  public getAutomation(id: string, userId?: string): Automation | undefined {
    return this.data.automations.find((a) => a.id === id && (!userId || a.userId === userId));
  }

  public createAutomation(automation: Automation): Automation {
    this.data.automations.push(automation);
    this.persist();
    this.logSystem('info', 'engine', `Created automation ${automation.name} for user ${automation.userId}`, automation.userId);
    return automation;
  }

  public updateAutomation(id: string, userId: string, patch: Partial<Automation>): Automation | undefined {
    const idx = this.data.automations.findIndex((a) => a.id === id && a.userId === userId);
    if (idx === -1) return undefined;
    this.data.automations[idx] = {
      ...this.data.automations[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.data.automations[idx];
  }

  public deleteAutomation(id: string, userId: string): boolean {
    const initialLen = this.data.automations.length;
    this.data.automations = this.data.automations.filter((a) => !(a.id === id && a.userId === userId));
    const changed = this.data.automations.length < initialLen;
    if (changed) {
      this.persist();
      this.logSystem('info', 'engine', `Deleted automation ${id} for user ${userId}`, userId);
    }
    return changed;
  }

  // --- Posts & Activity Logs ---
  public addPostLog(post: PostLog): PostLog {
    this.data.posts.unshift(post);
    if (this.data.posts.length > 1000) {
      this.data.posts = this.data.posts.slice(0, 1000);
    }

    // Update user stats
    const user = this.data.users.find((u) => u.id === post.userId);
    if (user) {
      if (post.status === 'published') user.postsProcessedCount++;
      if (post.status === 'failed') user.postsFailedCount++;
      if (post.status === 'filtered_ad') user.postsFilteredAdsCount++;
      user.lastActiveAt = new Date().toISOString();
    }

    // Update automation stats
    const auto = this.data.automations.find((a) => a.id === post.automationId);
    if (auto) {
      if (post.status === 'published') auto.stats.processedCount++;
      if (post.status === 'failed') auto.stats.failedCount++;
      if (post.status === 'filtered_ad') auto.stats.skippedAdsCount++;
      auto.stats.lastRunAt = new Date().toISOString();
    }

    this.persist();
    return post;
  }

  public getPostLogs(userId?: string, limit = 50): PostLog[] {
    const filtered = userId ? this.data.posts.filter((p) => p.userId === userId) : this.data.posts;
    return filtered.slice(0, limit);
  }

  public isPostProcessed(automationId: string, sourcePostId: string): boolean {
    return this.data.posts.some(
      (p) => p.automationId === automationId && p.sourcePostId === sourcePostId && p.status === 'published'
    );
  }

  // --- Other Bots Management ---
  public getOtherBots(onlyEnabled = true): OtherBot[] {
    const list = onlyEnabled ? this.data.otherBots.filter((b) => b.enabled) : this.data.otherBots;
    return list.sort((a, b) => a.order - b.order);
  }

  public upsertOtherBot(bot: OtherBot): OtherBot {
    const idx = this.data.otherBots.findIndex((b) => b.id === bot.id);
    if (idx >= 0) {
      this.data.otherBots[idx] = { ...this.data.otherBots[idx], ...bot };
    } else {
      this.data.otherBots.push(bot);
    }
    this.persist();
    this.logSystem('info', 'api', `Updated 'Other Bots' entry: ${bot.name} (${bot.username})`);
    return bot;
  }

  public deleteOtherBot(id: string): boolean {
    const initLen = this.data.otherBots.length;
    this.data.otherBots = this.data.otherBots.filter((b) => b.id !== id);
    if (this.data.otherBots.length < initLen) {
      this.persist();
      this.logSystem('info', 'api', `Deleted 'Other Bots' entry ${id}`);
      return true;
    }
    return false;
  }

  public recordBotClick(id: string): void {
    const bot = this.data.otherBots.find((b) => b.id === id);
    if (bot) {
      bot.clicksCount = (bot.clicksCount || 0) + 1;
      this.persist();
    }
  }

  // --- System Logs ---
  public logSystem(
    level: 'info' | 'warn' | 'error' | 'success',
    source: SystemLog['source'],
    message: string,
    userId?: string,
    metadata?: Record<string, unknown>
  ): SystemLog {
    const logItem: SystemLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      userId,
      metadata,
    };
    this.data.systemLogs.unshift(logItem);
    if (this.data.systemLogs.length > 500) {
      this.data.systemLogs = this.data.systemLogs.slice(0, 500);
    }
    this.persist();
    return logItem;
  }

  public getSystemLogs(limit = 100): SystemLog[] {
    return this.data.systemLogs.slice(0, limit);
  }

  // --- Settings & Stats ---
  public getSettings(): SystemSettings {
    return this.data.settings;
  }

  public updateSettings(patch: Partial<SystemSettings>): SystemSettings {
    this.data.settings = { ...this.data.settings, ...patch };
    this.persist();
    this.logSystem('info', 'api', 'System settings updated');
    return this.data.settings;
  }

  public getSystemStats(): SystemStats {
    const oneDayAgo = Date.now() - 24 * 3600 * 1000;
    const totalUsers = this.data.users.length;
    const activeUsers = this.data.users.filter((u) => u.status === 'active').length;
    const newUsers24h = this.data.users.filter(
      (u) => new Date(u.createdAt).getTime() > oneDayAgo
    ).length;

    const totalAutomations = this.data.automations.length;
    const activeAutomations = this.data.automations.filter((a) => a.status === 'active').length;

    let postsProcessed = 0;
    let failedPosts = 0;
    let adFilteredPosts = 0;

    for (const post of this.data.posts) {
      if (post.status === 'published') postsProcessed++;
      if (post.status === 'failed') failedPosts++;
      if (post.status === 'filtered_ad') adFilteredPosts++;
    }

    return {
      totalUsers,
      activeUsers,
      newUsers24h,
      activeAutomations,
      totalAutomations,
      postsProcessed,
      failedPosts,
      adFilteredPosts,
      queuePendingCount: 0,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    };
  }
}

export const db = new Database();
