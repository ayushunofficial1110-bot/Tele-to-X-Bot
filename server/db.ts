import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { MongoClient, Db as MongoDatabase } from 'mongodb';
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
  botUsername: 'X2TelegramBot',
  webhookUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/telegram/webhook`,
  isWebhookActive: false,
  adminSecret: process.env.ADMIN_KEY || '',
  autoProcessSampleQueue: true,
};

export function computeContentHash(content: string, urls: string[] = []): string {
  // Normalize content: lowercase, remove non-alphanumeric, append sorted normalized URLs
  const normalizedText = content
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 300);

  const normalizedUrls = [...urls]
    .map((u) => u.toLowerCase().trim().replace(/https?:\/\/(www\.)?/, ''))
    .sort()
    .join('|');

  return crypto.createHash('sha256').update(`${normalizedText}::${normalizedUrls}`).digest('hex');
}

class Database {
  private data: DatabaseSchema;
  private mongoClient: MongoClient | null = null;
  private mongoDb: MongoDatabase | null = null;
  private isMongoConnected = false;

  constructor() {
    this.data = this.loadLocal();
    this.initMongo();
  }

  /**
   * Initializes real MongoDB connection if MONGODB_URI is provided.
   */
  private async initMongo() {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
    if (!mongoUri) {
      this.logSystem(
        'info',
        'mongodb',
        'MONGODB_URI not configured. Operating in persistent file-backed mode (data/db.json).'
      );
      return;
    }

    try {
      this.mongoClient = new MongoClient(mongoUri, {
        connectTimeoutMS: 8000,
        serverSelectionTimeoutMS: 8000,
      });

      await this.mongoClient.connect();
      this.mongoDb = this.mongoClient.db('x2telegram');
      this.isMongoConnected = true;

      const maskedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
      this.logSystem('success', 'mongodb', `Connected to real MongoDB instance: ${maskedUri}`);

      // Ensure indexes
      await Promise.all([
        this.mongoDb.collection('users').createIndex({ id: 1 }, { unique: true }),
        this.mongoDb.collection('users').createIndex({ telegramId: 1 }, { unique: true }),
        this.mongoDb.collection('users').createIndex({ authToken: 1 }),
        this.mongoDb.collection('automations').createIndex({ id: 1 }, { unique: true }),
        this.mongoDb.collection('automations').createIndex({ userId: 1 }),
        this.mongoDb.collection('posts').createIndex({ id: 1 }, { unique: true }),
        this.mongoDb.collection('posts').createIndex({ automationId: 1, sourcePostId: 1 }),
        this.mongoDb.collection('posts').createIndex({ contentHash: 1 }),
        this.mongoDb.collection('other_bots').createIndex({ id: 1 }, { unique: true }),
      ]);

      // Hydrate state from MongoDB
      await this.hydrateFromMongo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.isMongoConnected = false;
      this.logSystem(
        'warn',
        'mongodb',
        `Could not connect to MongoDB (${msg}). Falling back to persistent local storage.`
      );
    }
  }

  private async hydrateFromMongo() {
    if (!this.mongoDb) return;
    try {
      const [users, automations, posts, otherBots, settingsDoc] = await Promise.all([
        this.mongoDb.collection<BotUser>('users').find({}).toArray(),
        this.mongoDb.collection<Automation>('automations').find({}).toArray(),
        this.mongoDb.collection<PostLog>('posts').find({}).limit(500).sort({ createdAt: -1 }).toArray(),
        this.mongoDb.collection<OtherBot>('other_bots').find({}).sort({ order: 1 }).toArray(),
        this.mongoDb.collection<{ _id: string; settings: SystemSettings }>('settings').findOne({ _id: 'global' }),
      ]);

      if (users.length > 0) this.data.users = users;
      if (automations.length > 0) this.data.automations = automations;
      if (posts.length > 0) this.data.posts = posts;
      if (otherBots.length > 0) this.data.otherBots = otherBots;
      if (settingsDoc?.settings) this.data.settings = { ...DEFAULT_SETTINGS, ...settingsDoc.settings };

      this.persistLocal();
      this.logSystem(
        'info',
        'mongodb',
        `Hydrated from MongoDB: ${this.data.users.length} users, ${this.data.automations.length} automations, ${this.data.otherBots.length} bots.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logSystem('error', 'mongodb', `Failed to hydrate data from MongoDB: ${msg}`);
    }
  }

  private loadLocal(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          users: Array.isArray(parsed.users) ? parsed.users : [],
          automations: Array.isArray(parsed.automations) ? parsed.automations : [],
          posts: Array.isArray(parsed.posts) ? parsed.posts : [],
          otherBots: Array.isArray(parsed.otherBots) ? parsed.otherBots : [],
          systemLogs: Array.isArray(parsed.systemLogs) ? parsed.systemLogs : [],
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        };
      }
    } catch (err) {
      console.error('[DB] Failed to read database file, initializing clean database:', err);
    }

    const initial: DatabaseSchema = {
      users: [],
      automations: [],
      posts: [],
      otherBots: [],
      systemLogs: [
        {
          id: 'log_init',
          timestamp: new Date().toISOString(),
          level: 'info',
          source: 'engine',
          message: 'Public Multi-User Bot Engine initialized with isolated tenancy.',
        },
      ],
      settings: DEFAULT_SETTINGS,
    };
    this.saveLocalData(initial);
    return initial;
  }

  private saveLocalData(dataToSave: DatabaseSchema) {
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

  private persistLocal() {
    this.saveLocalData(this.data);
  }

  // --- Owner & Personal Bot Settings ---

  public getOwner(): BotUser {
    let owner = this.data.users[0];
    if (!owner) {
      owner = {
        id: 'owner_personal',
        telegramId: process.env.OWNER_TELEGRAM_ID || '10000001',
        telegramUsername: '@owner',
        firstName: 'Owner',
        authToken: `tga_owner_${crypto.randomBytes(8).toString('hex')}`,
        plan: 'enterprise',
        postsProcessedCount: 0,
        postsFailedCount: 0,
        postsFilteredAdsCount: 0,
        status: 'active',
        settings: {
          autoRewrite: true,
          adFilterEnabled: true,
          preserveFactsStrict: true,
          defaultPostFormat: 'auto',
          xCredentials: {
            bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
            apiKey: process.env.TWITTER_CLIENT_ID || '',
            apiSecret: process.env.TWITTER_CLIENT_SECRET || '',
          },
          telegramChannelId: process.env.TELEGRAM_CHANNEL_ID || '',
        },
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      this.data.users.push(owner);
      this.persistLocal();
    }
    return owner;
  }

  // --- Users ---

  public getUsers(): BotUser[] {
    return this.data.users;
  }

  public getUser(userIdOrTgId: string): BotUser | undefined {
    return this.data.users.find(
      (u) =>
        u.id === userIdOrTgId ||
        u.telegramId === userIdOrTgId ||
        u.telegramUsername.toLowerCase() === userIdOrTgId.toLowerCase()
    );
  }

  public getUserByToken(authToken: string): BotUser | undefined {
    if (!authToken) return undefined;
    return this.data.users.find((u) => u.authToken === authToken);
  }

  public upsertUser(user: BotUser): BotUser {
    // Ensure user has a secure auth token for passwordless dashboard login
    if (!user.authToken) {
      user.authToken = `tga_${user.telegramId}_${crypto.randomBytes(8).toString('hex')}`;
    }

    const idx = this.data.users.findIndex((u) => u.id === user.id || u.telegramId === user.telegramId);
    if (idx >= 0) {
      this.data.users[idx] = { ...this.data.users[idx], ...user, lastActiveAt: new Date().toISOString() };
    } else {
      this.data.users.push(user);
    }

    this.persistLocal();

    // Async sync to MongoDB
    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb
        .collection('users')
        .updateOne({ id: user.id }, { $set: user }, { upsert: true })
        .catch((err) => console.error('[Mongo] upsertUser error:', err));
    }

    return user;
  }

  // --- Automations ---

  public getAutomations(userId: string): Automation[] {
    return this.data.automations.filter((a) => a.userId === userId);
  }

  public getAllAutomations(): Automation[] {
    return this.data.automations;
  }

  public getAutomation(id: string, userId?: string): Automation | undefined {
    return this.data.automations.find((a) => a.id === id && (!userId || a.userId === userId));
  }

  public createAutomation(auto: Automation): Automation {
    this.data.automations.push(auto);
    this.persistLocal();

    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb
        .collection('automations')
        .insertOne(auto)
        .catch((err) => console.error('[Mongo] createAutomation error:', err));
    }

    return auto;
  }

  public updateAutomation(id: string, userId: string, patch: Partial<Automation>): Automation | undefined {
    const idx = this.data.automations.findIndex((a) => a.id === id && a.userId === userId);
    if (idx >= 0) {
      this.data.automations[idx] = {
        ...this.data.automations[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      const updated = this.data.automations[idx];
      this.persistLocal();

      if (this.isMongoConnected && this.mongoDb) {
        this.mongoDb
          .collection('automations')
          .updateOne({ id, userId }, { $set: patch })
          .catch((err) => console.error('[Mongo] updateAutomation error:', err));
      }

      return updated;
    }
    return undefined;
  }

  public deleteAutomation(id: string, userId: string): boolean {
    const initLen = this.data.automations.length;
    this.data.automations = this.data.automations.filter((a) => !(a.id === id && a.userId === userId));
    const changed = this.data.automations.length !== initLen;
    if (changed) {
      this.persistLocal();
      if (this.isMongoConnected && this.mongoDb) {
        this.mongoDb
          .collection('automations')
          .deleteOne({ id, userId })
          .catch((err) => console.error('[Mongo] deleteAutomation error:', err));
      }
    }
    return changed;
  }

  // --- Post Logs & Strict Deduplication ---

  public getPostLogs(userId?: string, limit = 50): PostLog[] {
    const list = userId ? this.data.posts.filter((p) => p.userId === userId) : this.data.posts;
    return list.slice(0, limit);
  }

  public addPostLog(log: PostLog): PostLog {
    // If not provided, compute content hash for deduplication
    if (!log.contentHash) {
      const urls: string[] = (log.sourceContent.match(/https?:\/\/[^\s]+/g) || []) as string[];
      log.contentHash = computeContentHash(log.sourceContent, urls);
    }

    this.data.posts.unshift(log);
    // Keep in-memory slice manageable
    if (this.data.posts.length > 500) {
      this.data.posts = this.data.posts.slice(0, 500);
    }
    this.persistLocal();

    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb
        .collection('posts')
        .insertOne(log)
        .catch((err) => console.error('[Mongo] addPostLog error:', err));
    }

    // Update user stats
    const user = this.getUser(log.userId);
    if (user) {
      if (log.status === 'published') {
        user.postsProcessedCount = (user.postsProcessedCount || 0) + 1;
      } else if (log.status === 'filtered_ad') {
        user.postsFilteredAdsCount = (user.postsFilteredAdsCount || 0) + 1;
      } else if (log.status === 'failed') {
        user.postsFailedCount = (user.postsFailedCount || 0) + 1;
      }
      this.upsertUser(user);
    }

    return log;
  }

  public isPostProcessed(automationId: string, sourcePostId: string): boolean {
    return this.data.posts.some(
      (p) => p.automationId === automationId && p.sourcePostId === sourcePostId
    );
  }

  public isContentDuplicate(automationId: string, content: string): boolean {
    const urls: string[] = (content.match(/https?:\/\/[^\s]+/g) || []) as string[];
    const hash = computeContentHash(content, urls);
    return this.data.posts.some(
      (p) => p.automationId === automationId && p.contentHash === hash && p.status === 'published'
    );
  }

  // --- Other Bots (Configured by Admin) ---

  public getOtherBots(onlyEnabled = true): OtherBot[] {
    const list = onlyEnabled ? this.data.otherBots.filter((b) => b.enabled) : this.data.otherBots;
    return [...list].sort((a, b) => a.order - b.order);
  }

  public getOtherBot(id: string): OtherBot | undefined {
    return this.data.otherBots.find((b) => b.id === id);
  }

  public upsertOtherBot(bot: OtherBot): OtherBot {
    const idx = this.data.otherBots.findIndex((b) => b.id === bot.id);
    if (idx >= 0) {
      this.data.otherBots[idx] = { ...bot, updatedAt: new Date().toISOString() };
    } else {
      this.data.otherBots.push(bot);
    }
    this.persistLocal();

    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb
        .collection('other_bots')
        .updateOne({ id: bot.id }, { $set: bot }, { upsert: true })
        .catch((err) => console.error('[Mongo] upsertOtherBot error:', err));
    }

    return bot;
  }

  public deleteOtherBot(id: string): boolean {
    const initLen = this.data.otherBots.length;
    this.data.otherBots = this.data.otherBots.filter((b) => b.id !== id);
    const changed = this.data.otherBots.length !== initLen;
    if (changed) {
      this.persistLocal();
      if (this.isMongoConnected && this.mongoDb) {
        this.mongoDb
          .collection('other_bots')
          .deleteOne({ id })
          .catch((err) => console.error('[Mongo] deleteOtherBot error:', err));
      }
    }
    return changed;
  }

  public recordBotClick(id: string) {
    const bot = this.data.otherBots.find((b) => b.id === id);
    if (bot) {
      bot.clicksCount = (bot.clicksCount || 0) + 1;
      this.persistLocal();
      if (this.isMongoConnected && this.mongoDb) {
        this.mongoDb
          .collection('other_bots')
          .updateOne({ id }, { $inc: { clicksCount: 1 } })
          .catch((err) => console.error('[Mongo] recordBotClick error:', err));
      }
    }
  }

  // --- System Logs ---

  public logSystem(
    level: 'info' | 'warn' | 'error' | 'success',
    source: 'engine' | 'telegram_bot' | 'gemini' | 'ad_detector' | 'queue' | 'api' | 'monitor' | 'x_client' | 'mongodb',
    message: string,
    userId?: string,
    metadata?: Record<string, unknown>
  ) {
    const log: SystemLog = {
      id: `syslog_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      userId,
      metadata,
    };

    console.log(`[${log.level.toUpperCase()}][${log.source}] ${log.message}${userId ? ` (User: ${userId})` : ''}`);

    this.data.systemLogs.unshift(log);
    if (this.data.systemLogs.length > 300) {
      this.data.systemLogs = this.data.systemLogs.slice(0, 300);
    }
    this.persistLocal();

    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb
        .collection('system_logs')
        .insertOne(log)
        .catch(() => {});
    }
  }

  public getSystemLogs(limit = 100): SystemLog[] {
    return this.data.systemLogs.slice(0, limit);
  }

  // --- Settings ---

  public getSettings(): SystemSettings {
    return this.data.settings;
  }

  public updateSettings(patch: Partial<SystemSettings>): SystemSettings {
    this.data.settings = { ...this.data.settings, ...patch };
    this.persistLocal();

    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb
        .collection('settings')
        .updateOne({ _id: 'global' as any }, { $set: { settings: this.data.settings } }, { upsert: true })
        .catch((err) => console.error('[Mongo] updateSettings error:', err));
    }

    return this.data.settings;
  }

  // --- System Stats (Strictly Real Data) ---

  public getSystemStats(): SystemStats {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const users = this.data.users;
    const automations = this.data.automations;
    const posts = this.data.posts;

    const activeUsers = users.filter((u) => {
      const hasActiveAuto = automations.some((a) => a.userId === u.id && a.status === 'active');
      const activeRecently = new Date(u.lastActiveAt).getTime() >= thirtyDaysAgo;
      return u.status === 'active' && (hasActiveAuto || activeRecently);
    }).length;

    const newUsers24h = users.filter((u) => new Date(u.createdAt).getTime() >= oneDayAgo).length;
    const newUsers7d = users.filter((u) => new Date(u.createdAt).getTime() >= sevenDaysAgo).length;

    const activeAutomations = automations.filter((a) => a.status === 'active').length;

    const postsProcessed = posts.filter((p) => p.status === 'published').length;
    const failedPosts = posts.filter((p) => p.status === 'failed').length;
    const adFilteredPosts = posts.filter((p) => p.status === 'filtered_ad').length;

    return {
      totalUsers: users.length,
      activeUsers,
      newUsers24h,
      newUsers7d,
      activeAutomations,
      totalAutomations: automations.length,
      postsProcessed,
      failedPosts,
      adFilteredPosts,
      queuePendingCount: 0,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    };
  }
}

export const db = new Database();
