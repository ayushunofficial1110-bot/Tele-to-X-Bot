// server.ts
import express from "express";
import path2 from "path";
import fs2 from "fs";

// server/db.ts
import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { MongoClient } from "mongodb";
var DATA_DIR = path.join(process.cwd(), "data");
var DB_FILE = path.join(DATA_DIR, "db.json");
var startTime = Date.now();
var DEFAULT_SETTINGS = {
  botUsername: process.env.TELEGRAM_BOT_USERNAME || "TeleToXBot"
};
function computeContentHash(content, urls = []) {
  const normalizedText = content.toLowerCase().replace(/https?:\/\/[^\s]+/g, "").replace(/[^a-z0-9]/g, "").slice(0, 300);
  const normalizedUrls = [...urls].map((u) => u.toLowerCase().trim().replace(/https?:\/\/(www\.)?/, "")).sort().join("|");
  return crypto.createHash("sha256").update(`${normalizedText}::${normalizedUrls}`).digest("hex");
}
var Database = class {
  constructor() {
    this.mongoClient = null;
    this.mongoDb = null;
    this.isMongoConnected = false;
    this.data = this.loadLocal();
    this.initMongo();
  }
  /**
   * Initializes real MongoDB connection if MONGODB_URI is provided.
   */
  async initMongo() {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
    if (!mongoUri) {
      this.logSystem(
        "info",
        "mongodb",
        "MONGODB_URI not configured. Operating in persistent file-backed mode (data/db.json)."
      );
      return;
    }
    try {
      this.mongoClient = new MongoClient(mongoUri, {
        connectTimeoutMS: 8e3,
        serverSelectionTimeoutMS: 8e3
      });
      await this.mongoClient.connect();
      this.mongoDb = this.mongoClient.db("x2telegram");
      this.isMongoConnected = true;
      this.logSystem("success", "mongodb", "Connected to real MongoDB instance.");
      await Promise.all([
        this.mongoDb.collection("users").createIndex({ id: 1 }, { unique: true }),
        this.mongoDb.collection("users").createIndex({ telegramId: 1 }, { unique: true }),
        this.mongoDb.collection("users").createIndex({ authToken: 1 }),
        this.mongoDb.collection("automations").createIndex({ id: 1 }, { unique: true }),
        this.mongoDb.collection("automations").createIndex({ userId: 1 }),
        this.mongoDb.collection("posts").createIndex({ id: 1 }, { unique: true }),
        this.mongoDb.collection("posts").createIndex({ automationId: 1, sourcePostId: 1 }),
        this.mongoDb.collection("posts").createIndex({ contentHash: 1 }),
        this.mongoDb.collection("other_bots").createIndex({ id: 1 }, { unique: true })
      ]);
      await this.hydrateFromMongo();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.isMongoConnected = false;
      this.logSystem(
        "warn",
        "mongodb",
        `Could not connect to MongoDB (${msg}). Falling back to persistent local storage.`
      );
    }
  }
  async hydrateFromMongo() {
    if (!this.mongoDb) return;
    try {
      const [users, automations, posts, otherBots, settingsDoc] = await Promise.all([
        this.mongoDb.collection("users").find({}).toArray(),
        this.mongoDb.collection("automations").find({}).toArray(),
        this.mongoDb.collection("posts").find({}).limit(500).sort({ createdAt: -1 }).toArray(),
        this.mongoDb.collection("other_bots").find({}).sort({ order: 1 }).toArray(),
        this.mongoDb.collection("settings").findOne({ _id: "global" })
      ]);
      if (users.length > 0) this.data.users = users;
      if (automations.length > 0) this.data.automations = automations;
      if (posts.length > 0) this.data.posts = posts;
      if (otherBots.length > 0) this.data.otherBots = otherBots;
      if (settingsDoc?.settings) {
        this.data.settings = this.sanitizeSettings(settingsDoc.settings);
      }
      this.logSystem(
        "info",
        "mongodb",
        `Hydrated from MongoDB: ${this.data.users.length} users, ${this.data.automations.length} automations, ${this.data.otherBots.length} bots.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logSystem("error", "mongodb", `Failed to hydrate data from MongoDB: ${msg}`);
    }
  }
  loadLocal() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          users: Array.isArray(parsed.users) ? parsed.users : [],
          automations: Array.isArray(parsed.automations) ? parsed.automations : [],
          posts: Array.isArray(parsed.posts) ? parsed.posts : [],
          otherBots: Array.isArray(parsed.otherBots) ? parsed.otherBots : [],
          systemLogs: Array.isArray(parsed.systemLogs) ? parsed.systemLogs : [],
          settings: this.sanitizeSettings(parsed.settings || {})
        };
      }
    } catch (err) {
    }
    return {
      users: [],
      automations: [],
      posts: [],
      otherBots: [],
      systemLogs: [],
      settings: this.sanitizeSettings(DEFAULT_SETTINGS)
    };
  }
  saveLocalData(dataToSave) {
    if (this.isMongoConnected) {
      return;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const safeData = {
        users: dataToSave.users.map((u) => ({
          ...u,
          settings: {
            ...u.settings,
            xCredentials: {}
            // Never store X tokens or client secrets in local disk
          }
        })),
        automations: dataToSave.automations,
        posts: dataToSave.posts.slice(-100),
        otherBots: dataToSave.otherBots,
        systemLogs: dataToSave.systemLogs.slice(-100),
        settings: {
          botUsername: dataToSave.settings?.botUsername || ""
        }
      };
      const tmpPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(safeData, null, 2), "utf-8");
      fs.renameSync(tmpPath, DB_FILE);
    } catch (err) {
      console.warn("[DB] Local file write notice (non-fatal):", err instanceof Error ? err.message : err);
    }
  }
  persistLocal() {
    this.saveLocalData(this.data);
  }
  // --- Owner & Personal Bot Settings ---
  getOwner() {
    const ownerTgId = process.env.OWNER_TELEGRAM_ID?.trim();
    if (ownerTgId) {
      const user = this.data.users.find((u) => u.telegramId === ownerTgId);
      if (user) return user;
    }
    return this.data.users[0];
  }
  // --- Users ---
  getUsers() {
    return this.data.users;
  }
  getUser(userIdOrTgId) {
    return this.data.users.find(
      (u) => u.id === userIdOrTgId || u.telegramId === userIdOrTgId || u.telegramUsername.toLowerCase() === userIdOrTgId.toLowerCase()
    );
  }
  getUserByToken(authToken) {
    if (!authToken) return void 0;
    return this.data.users.find((u) => u.authToken === authToken);
  }
  upsertUser(user) {
    if (!user.authToken) {
      user.authToken = `tga_${user.telegramId}_${crypto.randomBytes(8).toString("hex")}`;
    }
    const idx = this.data.users.findIndex((u) => u.id === user.id || u.telegramId === user.telegramId);
    if (idx >= 0) {
      this.data.users[idx] = { ...this.data.users[idx], ...user, lastActiveAt: (/* @__PURE__ */ new Date()).toISOString() };
    } else {
      this.data.users.push(user);
    }
    this.persistLocal();
    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb.collection("users").updateOne({ id: user.id }, { $set: user }, { upsert: true }).catch((err) => console.error("[Mongo] upsertUser error:", err));
    }
    return user;
  }
  // --- Automations ---
  getAutomations(userId) {
    return this.data.automations.filter((a) => a.userId === userId);
  }
  getAllAutomations() {
    return this.data.automations;
  }
  getAutomation(id, userId) {
    return this.data.automations.find((a) => a.id === id && (!userId || a.userId === userId));
  }
  createAutomation(auto) {
    this.data.automations.push(auto);
    this.persistLocal();
    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb.collection("automations").insertOne(auto).catch((err) => console.error("[Mongo] createAutomation error:", err));
    }
    return auto;
  }
  updateAutomation(id, userId, patch) {
    const idx = this.data.automations.findIndex((a) => a.id === id && a.userId === userId);
    if (idx >= 0) {
      this.data.automations[idx] = {
        ...this.data.automations[idx],
        ...patch,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const updated = this.data.automations[idx];
      this.persistLocal();
      if (this.isMongoConnected && this.mongoDb) {
        this.mongoDb.collection("automations").updateOne({ id, userId }, { $set: patch }).catch((err) => console.error("[Mongo] updateAutomation error:", err));
      }
      return updated;
    }
    return void 0;
  }
  deleteAutomation(id, userId) {
    const initLen = this.data.automations.length;
    this.data.automations = this.data.automations.filter((a) => !(a.id === id && a.userId === userId));
    const changed = this.data.automations.length !== initLen;
    if (changed) {
      this.persistLocal();
      if (this.isMongoConnected && this.mongoDb) {
        this.mongoDb.collection("automations").deleteOne({ id, userId }).catch((err) => console.error("[Mongo] deleteAutomation error:", err));
      }
    }
    return changed;
  }
  // --- Post Logs & Strict Deduplication ---
  getPostLogs(userId, limit = 50) {
    const list = userId ? this.data.posts.filter((p) => p.userId === userId) : this.data.posts;
    return list.slice(0, limit);
  }
  addPostLog(log) {
    if (!log.contentHash) {
      const urls = log.sourceContent.match(/https?:\/\/[^\s]+/g) || [];
      log.contentHash = computeContentHash(log.sourceContent, urls);
    }
    this.data.posts.unshift(log);
    if (this.data.posts.length > 500) {
      this.data.posts = this.data.posts.slice(0, 500);
    }
    this.persistLocal();
    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb.collection("posts").insertOne(log).catch((err) => console.error("[Mongo] addPostLog error:", err));
    }
    const user = this.getUser(log.userId);
    if (user) {
      if (log.status === "published") {
        user.postsProcessedCount = (user.postsProcessedCount || 0) + 1;
      } else if (log.status === "filtered_ad") {
        user.postsFilteredAdsCount = (user.postsFilteredAdsCount || 0) + 1;
      } else if (log.status === "failed") {
        user.postsFailedCount = (user.postsFailedCount || 0) + 1;
      }
      this.upsertUser(user);
    }
    return log;
  }
  isPostProcessed(automationId, sourcePostId) {
    return this.data.posts.some(
      (p) => p.automationId === automationId && p.sourcePostId === sourcePostId
    );
  }
  isContentDuplicate(automationId, content) {
    const urls = content.match(/https?:\/\/[^\s]+/g) || [];
    const hash = computeContentHash(content, urls);
    return this.data.posts.some(
      (p) => p.automationId === automationId && p.contentHash === hash && p.status === "published"
    );
  }
  // --- Other Bots (Configured by Admin) ---
  getOtherBots(onlyEnabled = true) {
    const list = onlyEnabled ? this.data.otherBots.filter((b) => b.enabled) : this.data.otherBots;
    return [...list].sort((a, b) => a.order - b.order);
  }
  getOtherBot(id) {
    return this.data.otherBots.find((b) => b.id === id);
  }
  upsertOtherBot(bot) {
    const idx = this.data.otherBots.findIndex((b) => b.id === bot.id);
    if (idx >= 0) {
      this.data.otherBots[idx] = { ...bot, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    } else {
      this.data.otherBots.push(bot);
    }
    this.persistLocal();
    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb.collection("other_bots").updateOne({ id: bot.id }, { $set: bot }, { upsert: true }).catch((err) => console.error("[Mongo] upsertOtherBot error:", err));
    }
    return bot;
  }
  deleteOtherBot(id) {
    const initLen = this.data.otherBots.length;
    this.data.otherBots = this.data.otherBots.filter((b) => b.id !== id);
    const changed = this.data.otherBots.length !== initLen;
    if (changed) {
      this.persistLocal();
      if (this.isMongoConnected && this.mongoDb) {
        this.mongoDb.collection("other_bots").deleteOne({ id }).catch((err) => console.error("[Mongo] deleteOtherBot error:", err));
      }
    }
    return changed;
  }
  recordBotClick(id) {
    const bot = this.data.otherBots.find((b) => b.id === id);
    if (bot) {
      bot.clicksCount = (bot.clicksCount || 0) + 1;
      this.persistLocal();
      if (this.isMongoConnected && this.mongoDb) {
        this.mongoDb.collection("other_bots").updateOne({ id }, { $inc: { clicksCount: 1 } }).catch((err) => console.error("[Mongo] recordBotClick error:", err));
      }
    }
  }
  // --- System Logs ---
  logSystem(level, source, message, userId, metadata) {
    const log = {
      id: `syslog_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      source,
      message,
      userId,
      metadata
    };
    console.log(`[${log.level.toUpperCase()}][${log.source}] ${log.message}${userId ? ` (User: ${userId})` : ""}`);
    this.data.systemLogs.unshift(log);
    if (this.data.systemLogs.length > 300) {
      this.data.systemLogs = this.data.systemLogs.slice(0, 300);
    }
    this.persistLocal();
    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb.collection("system_logs").insertOne(log).catch(() => {
      });
    }
  }
  getSystemLogs(limit = 100) {
    return this.data.systemLogs.slice(0, limit);
  }
  // --- Settings ---
  /**
   * Sanitizes settings to ensure credentials are NEVER persisted to database or local disk.
   * Runtime credentials must come ONLY from process.env.
   */
  sanitizeSettings(input) {
    if (!input || typeof input !== "object") {
      return { botUsername: process.env.TELEGRAM_BOT_USERNAME || "TeleToXBot" };
    }
    const FORBIDDEN_KEYS = /* @__PURE__ */ new Set([
      "botToken",
      "adminSecret",
      "TELEGRAM_BOT_TOKEN",
      "ADMIN_KEY",
      "TWITTER_CLIENT_SECRET",
      "TWITTER_BEARER_TOKEN",
      "TWITTER_CLIENT_ID",
      "GEMINI_API_KEY",
      "MONGODB_URI",
      "MONGO_URI",
      "MONGODB_URL",
      "password",
      "secret",
      "token",
      "key",
      "apiKey",
      "authToken",
      "xCredentials"
    ]);
    const clean = {};
    for (const [k, v] of Object.entries(input)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      const lower = k.toLowerCase();
      if (lower.includes("token") || lower.includes("secret") || lower.includes("password") || lower.includes("apikey") || lower.includes("bearer") || lower.includes("mongodb")) {
        continue;
      }
      clean[k] = v;
    }
    const safeSettings = {
      botUsername: typeof clean.botUsername === "string" && clean.botUsername.trim().length > 0 ? clean.botUsername.trim() : this.data?.settings?.botUsername || process.env.TELEGRAM_BOT_USERNAME || "TeleToXBot"
    };
    if (typeof clean.lastUpdateId === "number") {
      safeSettings.lastUpdateId = clean.lastUpdateId;
    }
    return safeSettings;
  }
  getSettings() {
    return this.sanitizeSettings(this.data.settings);
  }
  updateSettings(patch) {
    const sanitizedPatch = this.sanitizeSettings(patch);
    this.data.settings = this.sanitizeSettings({ ...this.data.settings, ...sanitizedPatch });
    this.persistLocal();
    if (this.isMongoConnected && this.mongoDb) {
      this.mongoDb.collection("settings").updateOne({ _id: "global" }, { $set: { settings: this.data.settings } }, { upsert: true }).catch((err) => console.error("[Mongo] updateSettings error:", err));
    }
    return this.data.settings;
  }
  // --- System Stats (Strictly Real Data) ---
  getSystemStats() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1e3;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1e3;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1e3;
    const users = this.data.users;
    const automations = this.data.automations;
    const posts = this.data.posts;
    const activeUsers = users.filter((u) => {
      const hasActiveAuto = automations.some((a) => a.userId === u.id && a.status === "active");
      const activeRecently = new Date(u.lastActiveAt).getTime() >= thirtyDaysAgo;
      return u.status === "active" && (hasActiveAuto || activeRecently);
    }).length;
    const newUsers24h = users.filter((u) => new Date(u.createdAt).getTime() >= oneDayAgo).length;
    const newUsers7d = users.filter((u) => new Date(u.createdAt).getTime() >= sevenDaysAgo).length;
    const activeAutomations = automations.filter((a) => a.status === "active").length;
    const postsProcessed = posts.filter((p) => p.status === "published").length;
    const failedPosts = posts.filter((p) => p.status === "failed").length;
    const adFilteredPosts = posts.filter((p) => p.status === "filtered_ad").length;
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
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1e3)
    };
  }
};
var db = new Database();

// server/telegramBot.ts
import crypto3 from "node:crypto";

// server/telegramClient.ts
function isXUrl(input) {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  return /^(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[^\s]+/i.test(trimmed);
}
function formatXInput(input) {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  if (isXUrl(trimmed)) {
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed.replace(/^www\./i, "")}`;
  }
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}
function parseTelegramChannelInput(input) {
  if (!input || typeof input !== "string") {
    return { valid: false, canonical: "", error: "Channel identifier cannot be empty" };
  }
  const trimmed = input.trim();
  if (isXUrl(trimmed) || /(?:twitter\.com|x\.com)/i.test(trimmed)) {
    return {
      valid: false,
      canonical: trimmed,
      error: "An X (Twitter) URL cannot be used as a Telegram channel. Telegram channels use @channel_name or https://t.me/channel_name."
    };
  }
  const privateWebMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/c\/(\d+)(?:\/\d+)?\/?$/i);
  if (privateWebMatch) {
    return { valid: true, canonical: `-100${privateWebMatch[1]}` };
  }
  const publicWebMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/([a-zA-Z0-9_]{5,32})\/?$/i);
  if (publicWebMatch) {
    return { valid: true, canonical: `@${publicWebMatch[1]}` };
  }
  if (/^-100\d{7,16}$/.test(trimmed)) {
    return { valid: true, canonical: trimmed };
  }
  if (/^-\d{5,16}$/.test(trimmed)) {
    return { valid: true, canonical: trimmed };
  }
  if (/^\d{5,16}$/.test(trimmed)) {
    return { valid: true, canonical: trimmed };
  }
  if (/^@[a-zA-Z0-9_]{5,32}$/.test(trimmed)) {
    return { valid: true, canonical: trimmed };
  }
  if (/^[a-zA-Z0-9_]{5,32}$/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) {
    return { valid: true, canonical: `@${trimmed}` };
  }
  return {
    valid: false,
    canonical: trimmed,
    error: "Invalid format. Provide a channel username (e.g. @channel_name), a t.me link (https://t.me/channel_name), or a channel ID (-1001234567890)."
  };
}
var TelegramClient = class {
  getActiveToken(overrideToken) {
    const envToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const token = (overrideToken || envToken).trim();
    return token;
  }
  getBotToken(overrideToken) {
    const token = this.getActiveToken(overrideToken);
    if (!token || token.trim() === "" || token.includes("TODO")) {
      throw new Error("Telegram Bot Token is not configured. Please set TELEGRAM_BOT_TOKEN in environment variables.");
    }
    return token.trim();
  }
  hasValidToken(overrideToken) {
    try {
      const token = this.getBotToken(overrideToken);
      return token.length > 20 && token.includes(":");
    } catch {
      return false;
    }
  }
  async answerCallbackQuery(callbackQueryId, text, showAlert = false, overrideToken) {
    try {
      return await this.callApi(
        "answerCallbackQuery",
        {
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert
        },
        overrideToken
      );
    } catch {
      return null;
    }
  }
  async getWebhookInfo(overrideToken) {
    return this.callApi("getWebhookInfo", {}, overrideToken);
  }
  async callApi(endpoint, payload, overrideToken) {
    const token = this.getBotToken(overrideToken);
    const url = `https://api.telegram.org/bot${token}/${endpoint}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json.ok) {
      const desc = json.description || "Unknown Telegram error";
      const code = json.error_code || res.status;
      const error = new Error(`Telegram API [${code}]: ${desc}`);
      error.errorCode = code;
      error.parameters = json.parameters;
      throw error;
    }
    return json.result;
  }
  async getMe(overrideToken) {
    const token = this.getBotToken(overrideToken);
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const json = await res.json();
    if (!json.ok) {
      throw new Error(`Telegram getMe error: ${json.description}`);
    }
    return json.result;
  }
  async getChat(chatId, overrideToken) {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;
    return this.callApi("getChat", { chat_id: targetChatId }, overrideToken);
  }
  async getChatMember(chatId, userId, overrideToken) {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;
    return this.callApi("getChatMember", { chat_id: targetChatId, user_id: userId }, overrideToken);
  }
  /**
   * Strictly verifies whether the bot has been added to the channel
   * and granted administrator permissions to post messages.
   */
  async verifyChannelPermissions(rawChatInput, overrideToken) {
    const parsed = parseTelegramChannelInput(String(rawChatInput));
    if (!parsed.valid) {
      return {
        canPost: false,
        canonicalId: String(rawChatInput),
        chatTitle: String(rawChatInput),
        chatType: "unknown",
        error: parsed.error
      };
    }
    try {
      const me = await this.getMe(overrideToken);
      const chat = await this.getChat(parsed.canonical, overrideToken);
      const member = await this.getChatMember(parsed.canonical, me.id, overrideToken);
      const status = member.status;
      const canPost = status === "creator" || status === "administrator" && member.can_post_messages !== false;
      return {
        canPost,
        canonicalId: parsed.canonical,
        chatTitle: chat.title || chat.username ? `@${chat.username}` : parsed.canonical,
        chatType: chat.type,
        error: canPost ? void 0 : `Bot is in the channel as '${status}', but does not have administrator post permissions (can_post_messages). Please promote the bot to Administrator.`
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        canPost: false,
        canonicalId: parsed.canonical,
        chatTitle: parsed.canonical,
        chatType: "unknown",
        error: `Could not access channel: ${message}. Make sure the channel is public or the bot is added as an administrator.`
      };
    }
  }
  async sendMessage(chatId, text, options, overrideToken) {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;
    const MAX_CHUNK = 4e3;
    if (text.length > MAX_CHUNK) {
      const chunks = this.splitMessage(text, MAX_CHUNK);
      let lastResult = null;
      for (let i = 0; i < chunks.length; i++) {
        lastResult = await this.sendSingleMessage(
          targetChatId,
          chunks[i],
          { ...options, reply_markup: i === chunks.length - 1 ? options?.reply_markup : void 0 },
          overrideToken
        );
      }
      return lastResult;
    }
    return this.sendSingleMessage(targetChatId, text, options, overrideToken);
  }
  async sendSingleMessage(chatId, text, options, overrideToken) {
    const payload = {
      chat_id: chatId,
      text,
      disable_web_page_preview: options?.disable_web_page_preview ?? false
    };
    if (options?.parse_mode) payload.parse_mode = options.parse_mode;
    if (options?.reply_markup) payload.reply_markup = options.reply_markup;
    if (options?.reply_to_message_id) payload.reply_to_message_id = options.reply_to_message_id;
    try {
      return await this.callApi("sendMessage", payload, overrideToken);
    } catch (err) {
      if (err.errorCode === 400 && err.message?.toLowerCase().includes("can't parse entities")) {
        db.logSystem("warn", "telegram_bot", `Telegram parse error on entity tags; retrying as clean plain text`);
        delete payload.parse_mode;
        return await this.callApi("sendMessage", payload, overrideToken);
      }
      throw err;
    }
  }
  async sendPhoto(chatId, photoUrl, caption, options, overrideToken) {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;
    const payload = {
      chat_id: targetChatId,
      photo: photoUrl
    };
    if (caption) {
      payload.caption = caption.slice(0, 1024);
      if (options?.parse_mode) payload.parse_mode = options.parse_mode;
    }
    if (options?.reply_markup) payload.reply_markup = options.reply_markup;
    try {
      return await this.callApi("sendPhoto", payload, overrideToken);
    } catch (err) {
      db.logSystem("warn", "telegram_bot", `Remote photo send failed (${err.message}). Falling back to message with URL`);
      return this.sendMessage(targetChatId, `${caption ? `${caption}

` : ""}\u{1F4F7} ${photoUrl}`, options, overrideToken);
    }
  }
  async sendVideo(chatId, videoUrl, caption, options, overrideToken) {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;
    const payload = {
      chat_id: targetChatId,
      video: videoUrl
    };
    if (caption) {
      payload.caption = caption.slice(0, 1024);
      if (options?.parse_mode) payload.parse_mode = options.parse_mode;
    }
    if (options?.reply_markup) payload.reply_markup = options.reply_markup;
    try {
      return await this.callApi("sendVideo", payload, overrideToken);
    } catch (err) {
      db.logSystem("warn", "telegram_bot", `Remote video send failed (${err.message}). Falling back to message with URL`);
      return this.sendMessage(targetChatId, `${caption ? `${caption}

` : ""}\u{1F3AC} ${videoUrl}`, options, overrideToken);
    }
  }
  async sendAnimation(chatId, gifUrl, caption, options, overrideToken) {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;
    const payload = {
      chat_id: targetChatId,
      animation: gifUrl
    };
    if (caption) {
      payload.caption = caption.slice(0, 1024);
      if (options?.parse_mode) payload.parse_mode = options.parse_mode;
    }
    if (options?.reply_markup) payload.reply_markup = options.reply_markup;
    try {
      return await this.callApi("sendAnimation", payload, overrideToken);
    } catch (err) {
      return this.sendMessage(targetChatId, `${caption ? `${caption}

` : ""}GIF: ${gifUrl}`, options, overrideToken);
    }
  }
  async sendMediaGroup(chatId, media, overrideToken) {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;
    const payload = {
      chat_id: targetChatId,
      media: media.slice(0, 10)
    };
    try {
      return await this.callApi("sendMediaGroup", payload, overrideToken);
    } catch (err) {
      db.logSystem("warn", "telegram_bot", `Media group send failed (${err.message}). Falling back to single photo`);
      if (media.length > 0) {
        return this.sendPhoto(targetChatId, media[0].media, media[0].caption, void 0, overrideToken);
      }
    }
  }
  async setWebhook() {
    throw new Error("Telegram setWebhook is disabled. This personal bot operates exclusively via Long Polling.");
  }
  async deleteWebhook(dropPendingUpdates = false, overrideToken) {
    return this.callApi("deleteWebhook", { drop_pending_updates: dropPendingUpdates }, overrideToken);
  }
  async getUpdates(offset, limit = 100, timeout = 30, overrideToken) {
    return this.callApi(
      "getUpdates",
      {
        offset,
        limit,
        timeout,
        allowed_updates: ["message", "channel_post", "callback_query", "my_chat_member"]
      },
      overrideToken
    );
  }
  splitMessage(str, maxLength) {
    const parts = [];
    let current = "";
    const paragraphs = str.split("\n\n");
    for (const para of paragraphs) {
      if ((current + "\n\n" + para).length <= maxLength) {
        current = current ? current + "\n\n" + para : para;
      } else {
        if (current) parts.push(current);
        if (para.length <= maxLength) {
          current = para;
        } else {
          const lines = para.split("\n");
          current = "";
          for (const line of lines) {
            if ((current + "\n" + line).length <= maxLength) {
              current = current ? current + "\n" + line : line;
            } else {
              if (current) parts.push(current);
              current = line;
            }
          }
        }
      }
    }
    if (current) parts.push(current);
    return parts.length ? parts : [str];
  }
};
var telegramClient = new TelegramClient();

// server/xClient.ts
import crypto2 from "node:crypto";
var XClient = class {
  constructor() {
    this.defaultBearerToken = process.env.TWITTER_BEARER_TOKEN || "";
    this.defaultClientId = process.env.TWITTER_CLIENT_ID || "";
    this.defaultClientSecret = process.env.TWITTER_CLIENT_SECRET || "";
  }
  // --- OAuth 2.0 PKCE Helpers ---
  generatePKCE() {
    const verifier = crypto2.randomBytes(32).toString("base64url");
    const challenge = crypto2.createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
  }
  getOAuth2AuthorizeUrl(options) {
    const clientId = options.clientId || this.defaultClientId || "TWITTER_CLIENT_ID";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: options.redirectUri,
      scope: "tweet.read tweet.write users.read offline.access",
      state: options.state,
      code_challenge: options.codeChallenge,
      code_challenge_method: "S256"
    });
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }
  async exchangeOAuth2Code(options) {
    const clientId = options.clientId || this.defaultClientId;
    const clientSecret = options.clientSecret || this.defaultClientSecret;
    const bodyParams = new URLSearchParams({
      code: options.code,
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: options.redirectUri,
      code_verifier: options.codeVerifier
    });
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded"
    };
    if (clientSecret) {
      headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    }
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers,
      body: bodyParams.toString()
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`X OAuth2 exchange error: ${json.error_description || json.error || res.statusText}`);
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in || 7200,
      scope: json.scope || ""
    };
  }
  async refreshOAuth2Token(options) {
    const clientId = options.clientId || this.defaultClientId;
    const clientSecret = options.clientSecret || this.defaultClientSecret;
    const bodyParams = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: options.refreshToken,
      client_id: clientId
    });
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded"
    };
    if (clientSecret) {
      headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    }
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers,
      body: bodyParams.toString()
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`X OAuth2 refresh error: ${json.error_description || json.error || res.statusText}`);
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in || 7200
    };
  }
  // --- OAuth 1.0a Signature Generator (RFC 5849) ---
  getOAuth1Header(options) {
    const oauthParams = {
      oauth_consumer_key: options.apiKey,
      oauth_nonce: crypto2.randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1e3).toString(),
      oauth_token: options.accessToken,
      oauth_version: "1.0"
    };
    const sortedKeys = Object.keys(oauthParams).sort();
    const paramString = sortedKeys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`).join("&");
    const signatureBase = `${options.method.toUpperCase()}&${encodeURIComponent(options.url)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(options.apiSecret)}&${encodeURIComponent(options.accessSecret)}`;
    const signature = crypto2.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
    oauthParams["oauth_signature"] = signature;
    const headerParts = Object.keys(oauthParams).sort().map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`);
    return `OAuth ${headerParts.join(", ")}`;
  }
  // --- Posting Tweets (Telegram ➔ X) ---
  async postTweet(creds, text, options) {
    const url = "https://api.twitter.com/2/tweets";
    const payload = { text };
    if (options?.mediaIds && options.mediaIds.length > 0) {
      payload.media = { media_ids: options.mediaIds };
    }
    if (options?.inReplyToTweetId) {
      payload.reply = { in_reply_to_tweet_id: options.inReplyToTweetId };
    }
    const headers = {
      "Content-Type": "application/json"
    };
    if (creds.oauth2AccessToken) {
      headers["Authorization"] = `Bearer ${creds.oauth2AccessToken}`;
    } else if (creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessSecret) {
      headers["Authorization"] = this.getOAuth1Header({
        url,
        method: "POST",
        apiKey: creds.apiKey,
        apiSecret: creds.apiSecret,
        accessToken: creds.accessToken,
        accessSecret: creds.accessSecret
      });
    } else if (creds.bearerToken) {
      headers["Authorization"] = `Bearer ${creds.bearerToken}`;
    } else if (this.defaultBearerToken) {
      headers["Authorization"] = `Bearer ${this.defaultBearerToken}`;
    } else {
      throw new Error(
        "No X (Twitter) credentials configured. Please authenticate via OAuth2 or provide API keys in Settings."
      );
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) {
      const errorMsg = json.detail || json.errors?.[0]?.message || res.statusText;
      const error = new Error(`X API [${res.status}]: ${errorMsg}`);
      error.status = res.status;
      error.data = json;
      throw error;
    }
    return {
      id: json.data?.id || `tweet_${Date.now()}`,
      text: json.data?.text || text
    };
  }
  async postThread(creds, threadTexts, mediaIds) {
    const postedIds = [];
    let lastTweetId = void 0;
    for (let i = 0; i < threadTexts.length; i++) {
      const text = threadTexts[i];
      const tweetMedia = i === 0 ? mediaIds : void 0;
      const result = await this.postTweet(creds, text, {
        mediaIds: tweetMedia,
        inReplyToTweetId: lastTweetId
      });
      postedIds.push(result.id);
      lastTweetId = result.id;
      if (i < threadTexts.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    return postedIds;
  }
  // --- Media Upload (X API v1.1) ---
  async uploadMedia(creds, mediaBuffer, mimeType = "image/jpeg") {
    const url = "https://upload.twitter.com/1.1/media/upload.json";
    const formData = new FormData();
    const blob = new Blob([mediaBuffer], { type: mimeType });
    formData.append("media", blob);
    const headers = {};
    if (creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessSecret) {
      headers["Authorization"] = this.getOAuth1Header({
        url,
        method: "POST",
        apiKey: creds.apiKey,
        apiSecret: creds.apiSecret,
        accessToken: creds.accessToken,
        accessSecret: creds.accessSecret
      });
    } else if (creds.oauth2AccessToken) {
      headers["Authorization"] = `Bearer ${creds.oauth2AccessToken}`;
    } else {
      throw new Error("X media upload requires OAuth credentials (API Key + Access Token or OAuth2).");
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: formData
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`X Media Upload error: ${json.error || json.errors?.[0]?.message || res.statusText}`);
    }
    return json.media_id_string || String(json.media_id);
  }
  // --- Source Monitoring (X ➔ Telegram) using Official X API v2 ---
  async fetchRecentTweets(authorHandle, sinceId, overrideBearerOrTokens) {
    let handle = authorHandle.trim();
    const urlMatch = handle.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,25})/i);
    if (urlMatch) {
      handle = urlMatch[1];
    } else {
      handle = handle.replace(/^@+/, "").trim();
    }
    let candidateTokens = [];
    if (typeof overrideBearerOrTokens === "string" && overrideBearerOrTokens.trim()) {
      candidateTokens.push(overrideBearerOrTokens.trim());
    } else if (overrideBearerOrTokens && typeof overrideBearerOrTokens === "object") {
      if (overrideBearerOrTokens.bearerToken?.trim()) {
        candidateTokens.push(overrideBearerOrTokens.bearerToken.trim());
      }
      if (overrideBearerOrTokens.oauth2AccessToken?.trim()) {
        candidateTokens.push(overrideBearerOrTokens.oauth2AccessToken.trim());
      }
    }
    if (this.defaultBearerToken && this.defaultBearerToken.trim() && !this.defaultBearerToken.includes("TODO")) {
      candidateTokens.push(this.defaultBearerToken.trim());
    }
    candidateTokens = candidateTokens.filter((t, idx, arr) => arr.indexOf(t) === idx && t.length > 10);
    if (candidateTokens.length === 0) {
      const err = new Error(
        `Official X API requires a valid TWITTER_BEARER_TOKEN or connected X OAuth 2.0 account to monitor ${authorHandle}.`
      );
      err.isMissingToken = true;
      throw err;
    }
    let lastError = null;
    for (const bearer of candidateTokens) {
      try {
        return await this.fetchViaOfficialApi(handle, sinceId, bearer);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
    }
    throw lastError || new Error(`Failed polling ${authorHandle} via Official X API`);
  }
  async fetchViaOfficialApi(handle, sinceId, bearer) {
    const userRes = await fetch(`https://api.twitter.com/2/users/by/username/${handle}`, {
      headers: { Authorization: `Bearer ${bearer}` }
    });
    const userJson = await userRes.json();
    if (!userRes.ok || !userJson.data?.id) {
      const errDetail = userJson.detail || userJson.errors?.[0]?.message || userRes.statusText;
      if (errDetail?.toLowerCase().includes("credits depleted")) {
        const err = new Error(
          `Official X API read quota depleted for @${handle} (credits depleted). Twitter Developer accounts on Free tier allow write access (Telegram \u2794 X), while timeline read access requires X API credits or an updated TWITTER_BEARER_TOKEN.`
        );
        err.isCreditsDepleted = true;
        throw err;
      }
      throw new Error(`Official X API user lookup for @${handle} failed: ${errDetail}`);
    }
    const xUserId = userJson.data.id;
    let url = `https://api.twitter.com/2/users/${xUserId}/tweets?max_results=10&tweet.fields=created_at,entities,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url,type,variants`;
    if (sinceId) {
      url += `&since_id=${sinceId}`;
    }
    const tweetRes = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}` }
    });
    if (tweetRes.status === 429) {
      const resetHeader = tweetRes.headers.get("x-rate-limit-reset");
      const resetSeconds = resetHeader ? Math.max(1, parseInt(resetHeader) - Math.floor(Date.now() / 1e3)) : 60;
      throw new Error(`X API Rate Limit reached for @${handle}. Rate limit resets in ${resetSeconds}s.`);
    }
    const tweetJson = await tweetRes.json();
    if (!tweetRes.ok) {
      const errDetail = tweetJson.detail || tweetJson.errors?.[0]?.message || tweetRes.statusText;
      throw new Error(`Official X API tweet fetch for @${handle} failed: ${errDetail}`);
    }
    const tweets = tweetJson.data || [];
    const mediaMap = /* @__PURE__ */ new Map();
    if (tweetJson.includes?.media) {
      for (const m of tweetJson.includes.media) {
        mediaMap.set(m.media_key, {
          type: m.type === "video" ? "video" : m.type === "animated_gif" ? "gif" : "image",
          url: m.url || m.preview_image_url || ""
        });
      }
    }
    return tweets.map((t) => {
      const mediaList = [];
      if (t.attachments?.media_keys) {
        for (const k of t.attachments.media_keys) {
          const m = mediaMap.get(k);
          if (m && m.url) mediaList.push(m);
        }
      }
      return {
        id: t.id,
        text: t.text,
        author: `@${handle}`,
        createdAt: t.created_at || (/* @__PURE__ */ new Date()).toISOString(),
        url: `https://x.com/${handle}/status/${t.id}`,
        media: mediaList
      };
    });
  }
};
var xClient = new XClient();

// server/gemini.ts
import { GoogleGenAI, Type } from "@google/genai";
var aiInstance = null;
function getGenAI() {
  if (!aiInstance && process.env.GEMINI_API_KEY) {
    aiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiInstance;
}
async function detectAdOrPromotion(content, links = [], authorContext = "") {
  const lower = content.toLowerCase();
  const blatantPatterns = [
    /#ad\b/i,
    /#sponsored\b/i,
    /#partner\b/i,
    /\bpresale\b/i,
    /\bairdrop\b.*?(claim|register|connect wallet)/i,
    /\buse code\s+['"]?[A-Z0-9]{3,}['"]?\s+for\s+\d+%/i,
    /\bfree\s+(usdt|crypto|bitcoin|eth)\b/i,
    /\btoken sale\b/i,
    /\bguaranteed (10x|100x|returns|profit)\b/i
  ];
  for (const pat of blatantPatterns) {
    if (pat.test(lower)) {
      return {
        isAd: true,
        confidence: 0.95,
        reason: `Matched blatant commercial or token shill pattern: ${pat.source}`,
        category: "sponsored"
      };
    }
  }
  const ai = getGenAI();
  if (!ai) {
    const linkHasRef = links.some((l) => /ref=|aff=|promo=|utm_source=/i.test(l));
    if (linkHasRef) {
      return {
        isAd: true,
        confidence: 0.85,
        reason: "Contains commercial affiliate or referral tracking parameters",
        category: "affiliate_link"
      };
    }
    return {
      isAd: false,
      confidence: 0.1,
      reason: "Rule-based heuristic passed (no promotional patterns detected)",
      category: "organic"
    };
  }
  try {
    const prompt = `Analyze this social media post to determine if it is an advertisement, sponsored promotion, affiliate marketing, token shill, commercial spam, or organic genuine content.

Author/Account Context: "${authorContext || "Unknown"}"
Detected URLs: ${links.length > 0 ? links.join(", ") : "None"}

Post Content:
"""
${content}
"""

Rules:
- Genuine news, tech updates, thought leadership, developer tutorials, and standard announcements are NOT ads, even if they mention a company or product.
- Posts explicitly selling products, demanding signups via referral codes, shilling tokens/presales/giveaways, using sponsored hashtags (#ad, #sponsored), or pushing affiliate links ARE ads.`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isAd: { type: Type.BOOLEAN, description: "True if post is promotional/ad/spam" },
            confidence: { type: Type.NUMBER, description: "Confidence between 0.0 and 1.0" },
            reason: { type: Type.STRING, description: "Brief explanation of classification" },
            category: {
              type: Type.STRING,
              description: "One of: organic, sponsored, affiliate_link, crypto_shill, hard_sale"
            }
          },
          required: ["isAd", "confidence", "reason", "category"]
        }
      }
    });
    const parsed = JSON.parse(response.text?.trim() || "{}");
    return {
      isAd: Boolean(parsed.isAd && (parsed.confidence ?? 0) >= 0.65),
      confidence: parsed.confidence ?? 0.5,
      reason: parsed.reason || "AI classified content",
      category: parsed.category || (parsed.isAd ? "sponsored" : "organic")
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.logSystem("warn", "ad_detector", `Gemini ad check failed, using fallback: ${message}`);
    return {
      isAd: false,
      confidence: 0.2,
      reason: "Fallback classifier due to AI timeout",
      category: "organic"
    };
  }
}
async function rewriteSocialPost({
  content,
  direction,
  preferredFormat = "auto",
  sourceAuthor = "",
  sourceUrl = ""
}) {
  const ai = getGenAI();
  if (!ai) {
    return fallbackRewrite(content, direction, preferredFormat, sourceAuthor, sourceUrl);
  }
  try {
    if (direction === "telegram_to_x") {
      const prompt = `You are a social media formatting assistant. Convert this Telegram message into one or more high-impact X (Twitter) posts.

CRITICAL INVARIANTS:
1. STRICTLY PRESERVE all names, figures, numbers, dates, quotes, statistics, claims, and the exact meaning. NEVER invent or hallucinate facts.
2. NEVER add generic filler phrases or corporate hype ("Supercharge your...", "Game changer!").
3. Each individual tweet MUST be strictly under 270 characters to ensure safe posting within X standard character limits.
4. If format is "concise" OR content fits in 1 tweet: return a single concise post.
5. If format is "thread" OR content is long: split logically into 2-5 connected thread tweets with numbered tags like "(1/3)", "(2/3)".

Desired Format: "${preferredFormat}"
Original Telegram Post:
"""
${content}
"""`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tweets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of 1 to 5 tweets, each under 270 characters"
              },
              summary: { type: Type.STRING, description: "Single most concise version under 270 chars" }
            },
            required: ["tweets", "summary"]
          }
        }
      });
      const parsed = JSON.parse(response.text?.trim() || "{}");
      const tweets = Array.isArray(parsed.tweets) && parsed.tweets.length > 0 ? parsed.tweets : [parsed.summary || content];
      const validatedTweets = tweets.map((t) => t.length > 280 ? `${t.slice(0, 277)}...` : t);
      if (validatedTweets.length > 1 && preferredFormat !== "concise") {
        return {
          text: validatedTweets[0],
          threadParts: validatedTweets,
          characterCount: validatedTweets[0].length,
          isThread: true,
          preservedFactsChecked: true
        };
      } else {
        const singleText = validatedTweets[0] || content.slice(0, 275);
        return {
          text: singleText,
          characterCount: singleText.length,
          isThread: false,
          preservedFactsChecked: true
        };
      }
    } else {
      const prompt = `You are a high-signal Telegram channel editor. Rewrite this X (Twitter) post for publication in a Telegram channel.

CRITICAL INVARIANTS:
1. STRICTLY PRESERVE all names, figures, percentages, dates, quotes, claims, and the exact meaning. NEVER change or exaggerate any fact.
2. Structure for effortless scanning: clean opening hook, formatted bullet points if there are multiple facts, and clean punctuation.
3. Keep it natural and engaging without fluff.
4. Format in clean text (bold headers with *, bullet points with \u2022).

Author: ${sourceAuthor || "Source"}
Original X Post:
"""
${content}
"""`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 0.3
          // Low temperature for factual precision
        }
      });
      let rewritten = response.text?.trim() || content;
      if (sourceUrl) {
        rewritten += `

\u{1F517} Original: ${sourceUrl}`;
      }
      return {
        text: rewritten,
        characterCount: rewritten.length,
        isThread: false,
        preservedFactsChecked: true
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.logSystem("warn", "gemini", `Gemini rewriting error, applying fallback: ${message}`);
    return fallbackRewrite(content, direction, preferredFormat, sourceAuthor, sourceUrl);
  }
}
function fallbackRewrite(content, direction, preferredFormat, sourceAuthor, sourceUrl) {
  if (direction === "telegram_to_x") {
    if (content.length <= 280) {
      return {
        text: content,
        characterCount: content.length,
        isThread: false,
        preservedFactsChecked: true
      };
    }
    if (preferredFormat === "thread" || content.length > 300) {
      const words = content.split(" ");
      const chunks = [];
      let current = "";
      for (const word of words) {
        if ((current + " " + word).length > 250) {
          chunks.push(current.trim());
          current = word;
        } else {
          current = current ? `${current} ${word}` : word;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      const numbered = chunks.map((c, i) => `(${i + 1}/${chunks.length}) ${c}`);
      return {
        text: numbered[0],
        threadParts: numbered,
        characterCount: numbered[0].length,
        isThread: true,
        preservedFactsChecked: true
      };
    }
    const truncated = `${content.slice(0, 275)}...`;
    return {
      text: truncated,
      characterCount: truncated.length,
      isThread: false,
      preservedFactsChecked: true
    };
  } else {
    let formatted = content;
    if (sourceAuthor) {
      formatted = `\u{1F4CC} ${sourceAuthor}:

${formatted}`;
    }
    if (sourceUrl) {
      formatted = `${formatted}

\u{1F517} ${sourceUrl}`;
    }
    return {
      text: formatted,
      characterCount: formatted.length,
      isThread: false,
      preservedFactsChecked: true
    };
  }
}

// server/queue.ts
var AutomationQueue = class {
  // Rate limiting per destination
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.timer = null;
    this.lastDispatchTimes = /* @__PURE__ */ new Map();
    this.startWorker();
  }
  startWorker() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.tick();
    }, 1500);
  }
  enqueuePost(automation, postData) {
    if (db.isPostProcessed(automation.id, postData.sourcePostId)) {
      db.logSystem("warn", "queue", `Deduplication dropped existing post ${postData.sourcePostId}`, automation.userId);
      return { status: "duplicate", reason: "Post was already published previously" };
    }
    if (db.isContentDuplicate(automation.id, postData.sourceContent)) {
      db.logSystem("warn", "queue", `Deduplication dropped duplicate content`, automation.userId);
      return { status: "duplicate", reason: "Duplicate content already published previously" };
    }
    const alreadyQueued = this.queue.some(
      (j) => j.automationId === automation.id && j.sourcePostId === postData.sourcePostId && j.status === "pending"
    );
    if (alreadyQueued) {
      return { status: "duplicate", reason: "Post already in queue" };
    }
    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      automationId: automation.id,
      userId: automation.userId,
      sourcePostId: postData.sourcePostId,
      sourceAuthor: postData.sourceAuthor,
      sourceContent: postData.sourceContent,
      sourceUrl: postData.sourceUrl,
      media: postData.media || [],
      attempts: 0,
      maxAttempts: 3,
      scheduledAt: Date.now(),
      status: "pending"
    };
    this.queue.push(job);
    db.logSystem(
      "info",
      "queue",
      `Enqueued post from ${postData.sourceAuthor} for automation ${automation.name}`,
      automation.userId
    );
    return { status: "queued", jobId: job.id };
  }
  getPendingCount() {
    return this.queue.filter((j) => j.status === "pending").length;
  }
  async tick() {
    if (this.isProcessing) return;
    const now = Date.now();
    const job = this.queue.find((j) => j.status === "pending" && j.scheduledAt <= now);
    if (!job) return;
    this.isProcessing = true;
    job.status = "processing";
    job.attempts++;
    try {
      await this.processJob(job);
      job.status = "completed";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Queue] Job ${job.id} execution failed:`, message);
      if (job.attempts < job.maxAttempts) {
        job.status = "pending";
        const backoffMs = Math.pow(job.attempts, 2) * 5e3;
        job.scheduledAt = Date.now() + backoffMs;
        db.logSystem(
          "warn",
          "queue",
          `Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}). Retrying in ${backoffMs / 1e3}s: ${message}`,
          job.userId
        );
      } else {
        job.status = "failed";
        db.logSystem(
          "error",
          "queue",
          `Job ${job.id} permanently failed after ${job.maxAttempts} attempts: ${message}`,
          job.userId
        );
        db.addPostLog({
          id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          userId: job.userId,
          automationId: job.automationId,
          direction: "x_to_telegram",
          sourcePostId: job.sourcePostId,
          sourceAuthor: job.sourceAuthor,
          sourceContent: job.sourceContent,
          sourceUrl: job.sourceUrl,
          media: job.media || [],
          processedContent: "[Failed delivery]",
          isAd: false,
          status: "failed",
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          errorMessage: message,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    } finally {
      this.queue = this.queue.filter((j) => j.status === "pending");
      this.isProcessing = false;
    }
  }
  async processJob(job) {
    const automation = db.getAutomation(job.automationId, job.userId);
    if (!automation || automation.status !== "active") {
      throw new Error("Automation is paused or deleted");
    }
    const user = db.getUser(job.userId);
    if (!user || user.status !== "active") {
      throw new Error("User account is not active");
    }
    const rateKey = `${automation.direction}:${automation.destination}`;
    const lastTime = this.lastDispatchTimes.get(rateKey) || 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < 1500) {
      await new Promise((r) => setTimeout(r, 1500 - elapsed));
    }
    this.lastDispatchTimes.set(rateKey, Date.now());
    const extractUrls = (text) => {
      const match = text.match(/https?:\/\/[^\s]+/g);
      return match ? Array.from(match) : [];
    };
    const links = extractUrls(job.sourceContent);
    if (job.sourceUrl) links.push(job.sourceUrl);
    let adResult = {
      isAd: false,
      confidence: 0,
      reason: "Ad filtering disabled",
      category: "organic"
    };
    if (automation.settings.filterPromotions) {
      adResult = await detectAdOrPromotion(job.sourceContent, links, job.sourceAuthor);
    }
    if (adResult.isAd) {
      db.logSystem(
        "warn",
        "ad_detector",
        `Blocked promotional post from ${job.sourceAuthor} (${adResult.category}, conf: ${Math.round(adResult.confidence * 100)}%): ${adResult.reason}`,
        job.userId
      );
      db.addPostLog({
        id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: job.userId,
        automationId: job.automationId,
        direction: automation.direction,
        sourcePostId: job.sourcePostId,
        sourceAuthor: job.sourceAuthor,
        sourceContent: job.sourceContent,
        sourceUrl: job.sourceUrl,
        media: job.media || [],
        processedContent: "[Filtered by Ad Detector]",
        isAd: true,
        adConfidence: adResult.confidence,
        adReasoning: adResult.reason,
        adCategory: adResult.category,
        status: "filtered_ad",
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    let processedContent = job.sourceContent;
    let threadParts;
    if (automation.settings.autoRewrite) {
      const rewrite = await rewriteSocialPost({
        content: job.sourceContent,
        direction: automation.direction,
        preferredFormat: automation.settings.format,
        sourceAuthor: job.sourceAuthor,
        sourceUrl: automation.settings.includeOriginalLink ? job.sourceUrl : void 0
      });
      processedContent = rewrite.text;
      threadParts = rewrite.threadParts;
    } else if (automation.settings.includeOriginalLink && job.sourceUrl) {
      processedContent += `

\u{1F517} Source: ${job.sourceUrl}`;
    }
    const publishedPostId = await this.dispatchToDestination(
      automation,
      processedContent,
      job.media || [],
      threadParts
    );
    const publishedLog = {
      id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: job.userId,
      automationId: job.automationId,
      direction: automation.direction,
      sourcePostId: job.sourcePostId,
      sourceAuthor: job.sourceAuthor,
      sourceContent: job.sourceContent,
      sourceUrl: job.sourceUrl,
      media: job.media || [],
      processedContent,
      threadParts,
      isAd: false,
      adConfidence: adResult.confidence,
      adReasoning: adResult.reason,
      adCategory: adResult.category,
      status: "published",
      publishedPostId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      publishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.addPostLog(publishedLog);
    db.logSystem(
      "success",
      "engine",
      `Published post to ${automation.destination} via ${automation.name}`,
      job.userId
    );
  }
  async dispatchToDestination(automation, content, media, threadParts) {
    if (automation.direction === "x_to_telegram") {
      return await this.dispatchToTelegram(automation, content, media);
    } else {
      return await this.dispatchToX(automation, content, media, threadParts);
    }
  }
  async dispatchToTelegram(automation, content, media) {
    const targetChannel = automation.destination;
    let publishedId = `tg_${Date.now()}`;
    if (telegramClient.hasValidToken()) {
      try {
        const CAPTION_LIMIT = 1024;
        let caption = content;
        let followUpText = null;
        if (media.length > 0 && content.length > CAPTION_LIMIT) {
          const lastSpace = content.lastIndexOf(" ", CAPTION_LIMIT - 10);
          const splitIdx = lastSpace > 500 ? lastSpace : CAPTION_LIMIT - 10;
          caption = content.substring(0, splitIdx).trim();
          followUpText = content.substring(splitIdx).trim();
        }
        if (media.length === 1) {
          const m = media[0];
          if (m.type === "video") {
            const res = await telegramClient.sendVideo(targetChannel, m.url, caption);
            publishedId = String(res?.message_id || publishedId);
          } else {
            const res = await telegramClient.sendPhoto(targetChannel, m.url, caption);
            publishedId = String(res?.message_id || publishedId);
          }
        } else if (media.length > 1) {
          const mediaList = media.map((m, idx) => ({
            type: m.type === "video" ? "video" : "photo",
            media: m.url,
            caption: idx === 0 ? caption : void 0
          }));
          const res = await telegramClient.sendMediaGroup(targetChannel, mediaList);
          publishedId = String(Array.isArray(res) ? res[0]?.message_id : res?.message_id || publishedId);
        } else {
          const res = await telegramClient.sendMessage(targetChannel, content, {
            disable_web_page_preview: false
          });
          publishedId = String(res?.message_id || publishedId);
        }
        if (followUpText && media.length > 0) {
          await telegramClient.sendMessage(targetChannel, followUpText, {
            disable_web_page_preview: false
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        db.logSystem("warn", "telegram_bot", `Telegram delivery note to ${targetChannel}: ${msg}`);
        throw err;
      }
    } else {
      db.logSystem("info", "telegram_bot", `Telegram bot token not yet configured; post stored for ${targetChannel}`);
    }
    return publishedId;
  }
  async dispatchToX(automation, content, media, threadParts) {
    const user = db.getUser(automation.userId) || db.getOwner();
    const creds = user?.settings.xCredentials || {};
    let publishedId = `x_${Date.now()}`;
    if (creds.oauth2AccessToken || creds.apiKey && creds.accessToken || creds.bearerToken) {
      try {
        if (threadParts && threadParts.length > 1) {
          const tweetIds = await xClient.postThread(creds, threadParts);
          publishedId = tweetIds.join(",");
        } else {
          const tweet = await xClient.postTweet(creds, content);
          publishedId = tweet.id;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        db.logSystem("warn", "x_client", `X API posting note for ${automation.destination}: ${msg}`);
        throw err;
      }
    } else {
      db.logSystem(
        "info",
        "x_client",
        `No Twitter OAuth configured for personal bot; post logged for destination ${automation.destination}.`
      );
    }
    return publishedId;
  }
};
var automationQueue = new AutomationQueue();

// server/config.ts
var PRODUCTION_APP_URL = "https://tele-to-x-bot.onrender.com";
function getAppUrl() {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl.length > 0) {
    const cleanUrl = envUrl.replace(/\/+$/, "");
    if (process.env.NODE_ENV === "production" && (cleanUrl.includes("localhost") || cleanUrl.includes("127.0.0.1"))) {
      return PRODUCTION_APP_URL;
    }
    return cleanUrl;
  }
  return PRODUCTION_APP_URL;
}
function isAiStudioEnvironment() {
  if (process.env.DISABLE_TELEGRAM_POLLING === "true") return true;
  if (process.env.ENABLE_TELEGRAM_POLLING === "false") return true;
  if (process.env.FORCE_RUN_BOT === "true" || process.env.RUN_BOT_IN_DEV === "true") return false;
  if (process.env.K_SERVICE && (process.env.K_SERVICE.includes("ais-") || process.env.K_SERVICE.includes("ais-dev"))) {
    return true;
  }
  const appUrl = (process.env.APP_URL || "").toLowerCase();
  if (appUrl.includes("ais-dev") || appUrl.includes("ais-pre")) {
    return true;
  }
  if (process.env.RENDER === "true") {
    return false;
  }
  if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
    return true;
  }
  return false;
}
function getTelegramButtonUrl(pathWithQuery = "") {
  const base = getAppUrl();
  const normalizedPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  if (base.includes("localhost") || base.includes("127.0.0.1")) {
    return `${PRODUCTION_APP_URL}${normalizedPath}`;
  }
  return `${base}${normalizedPath}`;
}

// server/monitor.ts
var SourceMonitor = class {
  constructor() {
    this.timer = null;
    this.isChecking = false;
    this.checkIntervalMs = 6e4;
    // Poll every 60 seconds
    // Tracks cooldowns per automation (e.g. rate limit, credits depleted) to prevent rapid error loops
    this.pollCooldowns = /* @__PURE__ */ new Map();
    if (!isAiStudioEnvironment()) {
      this.start();
    }
  }
  resetCooldown(autoId) {
    this.pollCooldowns.delete(autoId);
  }
  start() {
    if (isAiStudioEnvironment()) {
      return;
    }
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.checkSources();
    }, this.checkIntervalMs);
    setTimeout(() => this.checkSources(), 5e3);
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  async checkSources() {
    if (this.isChecking) return;
    this.isChecking = true;
    try {
      const allUsers = db.getUsers();
      const activeXAutomations = [];
      for (const u of allUsers) {
        if (u.status !== "active") continue;
        const autos = db.getAutomations(u.id);
        for (const a of autos) {
          if (a.status === "active" && a.direction === "x_to_telegram") {
            const cooldown = this.pollCooldowns.get(a.id);
            if (cooldown && Date.now() < cooldown.nextCheck) {
              continue;
            }
            activeXAutomations.push({ user: u, auto: a });
          }
        }
      }
      for (const item of activeXAutomations) {
        await this.pollXAccount(item.auto, item.user);
        await new Promise((r) => setTimeout(r, 2e3));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.logSystem("info", "monitor", `Source monitor cycle check: ${msg}`);
    } finally {
      this.isChecking = false;
    }
  }
  async pollXAccount(auto, user) {
    const handle = auto.source.trim();
    if (!handle) return;
    try {
      const creds = user?.settings?.xCredentials;
      const tweets = await xClient.fetchRecentTweets(
        handle,
        auto.lastSeenPostId,
        {
          bearerToken: creds?.bearerToken,
          oauth2AccessToken: creds?.oauth2AccessToken
        }
      );
      this.pollCooldowns.delete(auto.id);
      if (!tweets || tweets.length === 0) {
        db.updateAutomation(auto.id, auto.userId, {
          lastPollAt: (/* @__PURE__ */ new Date()).toISOString(),
          lastError: void 0
        });
        return;
      }
      const sorted = [...tweets].sort((a, b) => a.id.localeCompare(b.id));
      let newestId = auto.lastSeenPostId;
      for (const t of sorted) {
        automationQueue.enqueuePost(auto, {
          sourcePostId: t.id,
          sourceAuthor: t.author,
          sourceContent: t.text,
          sourceUrl: t.url,
          media: t.media
        });
        newestId = t.id;
      }
      db.updateAutomation(auto.id, auto.userId, {
        lastSeenPostId: newestId && newestId !== auto.lastSeenPostId ? newestId : auto.lastSeenPostId,
        lastPollAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastError: void 0
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCreditsDepleted = Boolean(
        err?.isCreditsDepleted || msg.toLowerCase().includes("credits depleted")
      );
      const isRateLimit = msg.toLowerCase().includes("rate limit") || msg.includes("429");
      const cooldownMs = isCreditsDepleted ? 60 * 60 * 1e3 : isRateLimit ? 15 * 60 * 1e3 : 5 * 60 * 1e3;
      const cooldownMinutes = Math.round(cooldownMs / 6e4);
      const prevCooldown = this.pollCooldowns.get(auto.id);
      const isStatusTransition = !prevCooldown || prevCooldown.isDepleted !== isCreditsDepleted;
      this.pollCooldowns.set(auto.id, {
        nextCheck: Date.now() + cooldownMs,
        lastError: msg,
        isDepleted: isCreditsDepleted
      });
      const friendlyNotice = isCreditsDepleted ? `X API read quota depleted for ${handle}. Official X Developer Free Tier supports posting to X (Telegram \u2794 X), but reading timelines requires X API Basic credits. Check back after credits refresh or update TWITTER_BEARER_TOKEN.` : msg;
      db.updateAutomation(auto.id, auto.userId, {
        lastError: friendlyNotice,
        lastPollAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (isStatusTransition) {
        db.logSystem(
          "info",
          "monitor",
          `Polling paused for X source ${handle}: ${friendlyNotice} (Next automatic check in ${cooldownMinutes}m)`,
          auto.userId
        );
      }
    }
  }
  // --- Real-time Telegram ➔ X Channel Listener ---
  handleIncomingTelegramChannelPost(channelPost) {
    if (!channelPost) return;
    const chatId = channelPost.chat?.id;
    const chatUsername = channelPost.chat?.username ? `@${channelPost.chat.username}` : "";
    const text = channelPost.text || channelPost.caption || "";
    const messageId = channelPost.message_id;
    if (!text) return;
    const allUsers = db.getUsers();
    for (const u of allUsers) {
      const autos = db.getAutomations(u.id);
      for (const a of autos) {
        if (a.status !== "active" || a.direction !== "telegram_to_x") continue;
        const cleanSource = a.source.replace(/^Telegram Channel:\s*/i, "").trim();
        const matchesUsername = chatUsername && cleanSource.toLowerCase() === chatUsername.toLowerCase();
        const matchesId = chatId && cleanSource === String(chatId);
        if (matchesUsername || matchesId) {
          db.logSystem(
            "info",
            "telegram_bot",
            `Received channel post #${messageId} from ${cleanSource} for automation ${a.name}`,
            u.id
          );
          automationQueue.enqueuePost(a, {
            sourcePostId: `tg_msg_${chatId}_${messageId}`,
            sourceAuthor: cleanSource,
            sourceContent: text,
            sourceUrl: chatUsername ? `https://t.me/${chatUsername.replace("@", "")}/${messageId}` : void 0,
            media: []
          });
        }
      }
    }
  }
};
var sourceMonitor = new SourceMonitor();

// server/telegramBot.ts
var userWizards = /* @__PURE__ */ new Map();
var GLOBAL_BOT_HANDLER_KEY = Symbol.for("x2telegram.telegramBotSingleton");
var GLOBAL_POLLING_LOCK_KEY = Symbol.for("x2telegram.telegramPollingLock");
var TelegramBotHandler = class {
  constructor() {
    this.isPolling = false;
    this.isStopping = false;
    this.pollingLoopRunning = false;
    this.runningLoopPromise = null;
    this.abortController = null;
    this.currentLoopId = 0;
    this.hasLoggedStart = false;
    this.lastUpdateId = 0;
    this.consecutiveErrors = 0;
    this.consecutiveConflicts = 0;
    this.isTokenUnauthorized = false;
    this.lastUnauthorizedToken = "";
    this.webhookChecked = false;
  }
  /**
   * Main entry point for live Telegram Webhooks, Long Polling, and Web Simulator
   */
  async handleUpdate(update, isLive = false) {
    if (update.channel_post) {
      console.log(
        `[Telegram Bot] Processing channel post update (msg_id=${update.channel_post.message_id}, chat=${update.channel_post.chat?.title || update.channel_post.chat?.id})`
      );
      sourceMonitor.handleIncomingTelegramChannelPost(update.channel_post);
      return { text: "Channel post received" };
    }
    const fromUser = update.message?.from || update.callback_query?.from;
    if (!fromUser) {
      if (update.my_chat_member) {
        console.log(
          `[Telegram Bot] Chat member status updated in chat ${update.my_chat_member.chat?.id}: status=${update.my_chat_member.new_chat_member?.status}`
        );
      }
      return { text: "Update acknowledged" };
    }
    const tgId = String(fromUser.id);
    const tgUsername = fromUser.username ? `@${fromUser.username}` : `@user_${tgId}`;
    const firstName = fromUser.first_name || "User";
    let user = db.getUser(tgId);
    if (!user) {
      const authToken = `tga_${tgId}_${crypto3.randomBytes(8).toString("hex")}`;
      user = db.upsertUser({
        id: `usr_${tgId}`,
        telegramId: tgId,
        telegramUsername: tgUsername,
        firstName,
        authToken,
        plan: "free",
        postsProcessedCount: 0,
        postsFailedCount: 0,
        postsFilteredAdsCount: 0,
        status: "active",
        settings: {
          autoRewrite: true,
          adFilterEnabled: true,
          preserveFactsStrict: true,
          defaultPostFormat: "auto",
          xCredentials: {}
        },
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      console.log(`[Telegram Bot] Registered new user from Telegram: ${tgUsername} (${tgId})`);
      db.logSystem("info", "telegram_bot", `New user registered via /start: ${tgUsername} (${tgId})`, user.id);
    } else {
      user.lastActiveAt = (/* @__PURE__ */ new Date()).toISOString();
      if (!user.authToken) {
        user.authToken = `tga_${tgId}_${crypto3.randomBytes(8).toString("hex")}`;
      }
      db.upsertUser(user);
    }
    let response;
    const text = update.message?.text?.trim() || "";
    const isStart = text.startsWith("/start") || text.toLowerCase() === "start";
    const targetChatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (isStart) {
      console.log(`[Telegram Bot] \u{1F680} Processing /start command from user ${tgUsername} (${tgId}) in chat ${targetChatId}`);
      db.logSystem("info", "telegram_bot", `Processing /start command from ${tgUsername} (${tgId})`);
    }
    if (update.callback_query?.data) {
      console.log(`[Telegram Bot] Handling callback query "${update.callback_query.data}" from user ${tgUsername}`);
      response = await this.handleCallback(user, update.callback_query.data);
      if (isLive && telegramClient.hasValidToken()) {
        await telegramClient.answerCallbackQuery(update.callback_query.id);
      }
    } else {
      response = await this.handleText(user, text);
    }
    if (isLive && telegramClient.hasValidToken() && targetChatId) {
      try {
        const sentResult = await telegramClient.sendMessage(targetChatId, response.text, {
          parse_mode: "Markdown",
          reply_markup: response.replyMarkup
        });
        if (isStart) {
          console.log(
            `[Telegram Bot] \u2705 /start reply successfully sent to user ${tgUsername} (${tgId}) in chat ${targetChatId} (msg_id: ${sentResult?.message_id || "ok"})`
          );
          db.logSystem("info", "telegram_bot", `/start reply successfully sent to ${tgUsername} in chat ${targetChatId}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Telegram Bot] \u274C Live delivery failure for chat ${targetChatId}:`, msg);
        db.logSystem("warn", "telegram_bot", `Live delivery notice for chat ${targetChatId}: ${msg}`);
      }
    }
    return response;
  }
  startPolling() {
    if (isAiStudioEnvironment()) {
      if (!this.hasLoggedStart) {
        this.hasLoggedStart = true;
        console.log(
          "[Telegram Bot] \u23F8\uFE0F Telegram Bot polling is STOPPED in AI Gemini Studio / Dev environment to prevent 409 conflict with Render production."
        );
        db.logSystem(
          "info",
          "telegram_bot",
          "Telegram Bot polling is stopped in AI Gemini Studio to prevent 409 conflict with Render production."
        );
      }
      return;
    }
    const globalAny = globalThis;
    const existingLock = globalAny[GLOBAL_POLLING_LOCK_KEY];
    if (this.isStopping || existingLock?.isStopping) {
      console.warn("[Telegram Bot] Cannot start polling: previous polling loop is currently stopping.");
      return;
    }
    if (this.isPolling || this.pollingLoopRunning || existingLock) {
      return;
    }
    this.isPolling = true;
    this.isStopping = false;
    const loopId = ++this.currentLoopId;
    globalAny[GLOBAL_POLLING_LOCK_KEY] = { loopId, startedAt: Date.now(), isStopping: false };
    if (!this.hasLoggedStart) {
      this.hasLoggedStart = true;
      console.log("[Telegram Bot] Telegram Bot long-polling worker started.");
      db.logSystem("info", "telegram_bot", "Telegram Bot long-polling worker started.");
    }
    this.runPollingLoop(loopId).catch((err) => {
      console.error("[Telegram Bot] Unexpected fatal polling error:", err);
    });
  }
  async stopPolling() {
    const globalAny = globalThis;
    if (!this.isPolling && !this.pollingLoopRunning && !this.isStopping && !globalAny[GLOBAL_POLLING_LOCK_KEY]) {
      return;
    }
    this.isStopping = true;
    this.isPolling = false;
    if (globalAny[GLOBAL_POLLING_LOCK_KEY]) {
      globalAny[GLOBAL_POLLING_LOCK_KEY].isStopping = true;
    }
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
      }
      this.abortController = null;
    }
    if (this.runningLoopPromise) {
      try {
        await this.runningLoopPromise;
      } catch {
      }
      this.runningLoopPromise = null;
    }
    this.pollingLoopRunning = false;
    this.isStopping = false;
    delete globalAny[GLOBAL_POLLING_LOCK_KEY];
    console.log("[Telegram Bot] Polling worker stopped cleanly, global lock released.");
  }
  wakeUpPolling(newToken) {
    if (isAiStudioEnvironment()) {
      return;
    }
    if (newToken) {
      this.isTokenUnauthorized = false;
      this.lastUnauthorizedToken = "";
      this.consecutiveErrors = 0;
      this.consecutiveConflicts = 0;
      this.webhookChecked = false;
    }
    const globalAny = globalThis;
    const existingLock = globalAny[GLOBAL_POLLING_LOCK_KEY];
    if (this.isStopping || existingLock?.isStopping) {
      return;
    }
    if (!this.isPolling && !this.pollingLoopRunning && !existingLock) {
      this.startPolling();
    }
  }
  getBotStatus() {
    const activeToken = telegramClient.getActiveToken();
    const inAiStudio = isAiStudioEnvironment();
    return {
      isPolling: this.isPolling && !inAiStudio,
      isAiStudio: inAiStudio,
      isTokenUnauthorized: this.isTokenUnauthorized,
      hasToken: Boolean(activeToken && activeToken.length > 10),
      lastUpdateId: this.lastUpdateId
    };
  }
  cancellableDelay(ms) {
    if (this.isStopping || !this.isPolling) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      const checkInterval = setInterval(() => {
        if (this.isStopping || !this.isPolling) {
          clearTimeout(timer);
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      timer.unref?.();
    });
  }
  async runPollingLoop(loopId) {
    if (this.pollingLoopRunning) {
      return;
    }
    this.pollingLoopRunning = true;
    this.runningLoopPromise = (async () => {
      while (this.isPolling && !this.isStopping && this.currentLoopId === loopId) {
        const token = telegramClient.getActiveToken();
        if (!token || token.length < 10) {
          await this.cancellableDelay(5e3);
          continue;
        }
        if (this.lastUnauthorizedToken && token !== this.lastUnauthorizedToken) {
          this.isTokenUnauthorized = false;
          this.lastUnauthorizedToken = "";
          this.consecutiveErrors = 0;
          this.consecutiveConflicts = 0;
          this.webhookChecked = false;
        }
        if (this.isTokenUnauthorized && token === this.lastUnauthorizedToken) {
          await this.cancellableDelay(15e3);
          continue;
        }
        if (!this.webhookChecked) {
          try {
            const webhookInfo = await telegramClient.getWebhookInfo(token);
            if (webhookInfo && webhookInfo.url) {
              console.log(
                `[Telegram Bot] Active webhook found (${webhookInfo.url}). Clearing webhook to enable long-polling without losing pending updates...`
              );
              await telegramClient.deleteWebhook(false, token);
              console.log("[Telegram Bot] Webhook deleted successfully.");
            } else {
              console.log(
                `[Telegram Bot] Webhook status verified: clean. Pending updates: ${webhookInfo?.pending_update_count ?? 0}.`
              );
            }
            const me = await telegramClient.getMe(token);
            if (me && me.username) {
              console.log(`[Telegram Bot] \u{1F916} Successfully connected to Telegram Bot API: @${me.username} (ID: ${me.id})`);
              db.updateSettings({ botUsername: me.username });
              db.logSystem("success", "telegram_bot", `Connected to Telegram Bot: @${me.username}`);
            }
            this.webhookChecked = true;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[Telegram Bot] Notice during webhook verification: ${msg}`);
            this.webhookChecked = true;
          }
        }
        if (!this.isPolling || this.isStopping || this.currentLoopId !== loopId) break;
        try {
          const payload = {
            timeout: 25,
            limit: 100,
            allowed_updates: ["message", "channel_post", "callback_query", "my_chat_member"]
          };
          if (this.lastUpdateId > 0) {
            payload.offset = this.lastUpdateId + 1;
          }
          this.abortController = new AbortController();
          const currentController = this.abortController;
          const timeoutId = setTimeout(() => {
            try {
              currentController.abort();
            } catch {
            }
          }, 35e3);
          let res;
          try {
            res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: currentController.signal
            });
          } catch (fetchErr) {
            if (fetchErr?.name === "AbortError" || currentController.signal.aborted) {
              if (this.isStopping || !this.isPolling) {
                break;
              }
              continue;
            }
            throw fetchErr;
          } finally {
            clearTimeout(timeoutId);
            if (this.abortController === currentController) {
              this.abortController = null;
            }
          }
          if (!this.isPolling || this.isStopping || this.currentLoopId !== loopId) break;
          if (!res.ok) {
            const status = res.status;
            const text = await res.text();
            let json = null;
            try {
              json = JSON.parse(text);
            } catch {
            }
            if (status === 401) {
              this.isTokenUnauthorized = true;
              this.lastUnauthorizedToken = token;
              console.warn(
                `[Telegram Bot] \u26A0\uFE0F Configured Bot Token is unauthorized or revoked by @BotFather (HTTP 401). Polling paused. Please set a valid TELEGRAM_BOT_TOKEN environment variable or configure in Admin Settings.`
              );
              db.logSystem(
                "warn",
                "telegram_bot",
                "Configured Telegram Bot Token returned HTTP 401 Unauthorized. Polling paused until a valid token is provided."
              );
              await this.cancellableDelay(15e3);
              continue;
            }
            if (status === 409) {
              this.consecutiveConflicts++;
              const desc = json?.description || text || "";
              const isWebhookConflict = desc.toLowerCase().includes("webhook");
              if (isWebhookConflict) {
                console.warn("[Telegram Bot] \u26A0\uFE0F Conflict (409): Webhook active on Telegram. Removing webhook...");
                try {
                  await telegramClient.deleteWebhook(false, token);
                } catch {
                }
              }
              const backoffSec = Math.min(30, Math.max(5, Math.round(5 * Math.pow(1.5, this.consecutiveConflicts - 1))));
              const jitterMs = Math.floor(Math.random() * 1e3);
              const delayMs = backoffSec * 1e3 + jitterMs;
              console.warn(
                `[Telegram Bot] \u26A0\uFE0F Conflict (409): ${desc || "Webhook active or duplicate getUpdates"}. Waiting ${backoffSec}s before retrying (conflict #${this.consecutiveConflicts})...`
              );
              if (!this.isPolling || this.isStopping || this.currentLoopId !== loopId) break;
              await this.cancellableDelay(delayMs);
              continue;
            }
            if (status === 429) {
              const retryAfter = json?.parameters?.retry_after || 5;
              console.warn(`[Telegram Bot] \u26A0\uFE0F Rate limited (429). Telegram requested waiting ${retryAfter}s.`);
              await this.cancellableDelay(retryAfter * 1e3);
              continue;
            }
            console.warn(`[Telegram Bot] Notice: Telegram getUpdates returned status [${status}]: ${json?.description || text}`);
            this.consecutiveErrors++;
            const backoff = Math.min(15e3, 2e3 * Math.pow(1.5, this.consecutiveErrors));
            await this.cancellableDelay(backoff);
            continue;
          }
          const data = await res.json();
          this.consecutiveErrors = 0;
          this.consecutiveConflicts = 0;
          if (data.ok && Array.isArray(data.result)) {
            const updates = data.result;
            if (updates.length > 0) {
              console.log(`[Telegram Bot] \u{1F4E5} Received ${updates.length} update(s) from Telegram.`);
              for (const update of updates) {
                if (!this.isPolling || this.isStopping || this.currentLoopId !== loopId) break;
                const uId = update.update_id;
                let updateType = "unknown";
                let senderInfo = "";
                if (update.message) {
                  const txt = update.message.text ? `"${update.message.text.substring(0, 35)}"` : "(media/attachment)";
                  updateType = `message: ${txt}`;
                  senderInfo = update.message.from?.username ? `@${update.message.from.username}` : `id=${update.message.from?.id}`;
                } else if (update.channel_post) {
                  updateType = `channel_post: ${update.channel_post.chat?.title || update.channel_post.chat?.id}`;
                  senderInfo = `chat_id=${update.channel_post.chat?.id}`;
                } else if (update.callback_query) {
                  updateType = `callback_query: "${update.callback_query.data}"`;
                  senderInfo = update.callback_query.from?.username ? `@${update.callback_query.from.username}` : `id=${update.callback_query.from?.id}`;
                } else if (update.my_chat_member) {
                  updateType = `my_chat_member`;
                  senderInfo = `chat_id=${update.my_chat_member.chat?.id}`;
                }
                console.log(`[Telegram Bot] \u26A1 Processing update_id=${uId} [type: ${updateType}] from ${senderInfo}`);
                this.lastUpdateId = Math.max(this.lastUpdateId, uId);
                try {
                  await this.handleUpdate(update, true);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  console.error(`[Telegram Bot] \u274C Error executing handleUpdate for update_id=${uId}:`, msg);
                }
              }
            }
          }
          await new Promise((r) => setTimeout(r, 100));
        } catch (err) {
          if (!this.isPolling || this.isStopping || this.currentLoopId !== loopId) break;
          const error = err;
          if (error?.name === "AbortError") {
            if (this.isStopping || !this.isPolling) break;
            continue;
          }
          const msg = err instanceof Error ? err.message : String(err);
          this.consecutiveErrors++;
          const backoff = Math.min(15e3, 1e3 * Math.pow(1.5, this.consecutiveErrors));
          console.warn(`[Telegram Bot] \u26A0\uFE0F Polling network pause (${msg}). Re-polling in ${Math.round(backoff / 1e3)}s...`);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
      this.pollingLoopRunning = false;
      const globalAny = globalThis;
      if (!this.isStopping && globalAny[GLOBAL_POLLING_LOCK_KEY]?.loopId === loopId) {
        delete globalAny[GLOBAL_POLLING_LOCK_KEY];
      }
    })();
    await this.runningLoopPromise;
  }
  async handleText(user, text) {
    const wizard = userWizards.get(user.id);
    if (wizard && !text.startsWith("/")) {
      return this.handleWizardInput(user, wizard, text);
    }
    if (text.startsWith("/start") || text.toLowerCase() === "menu" || text.toLowerCase() === "start") {
      userWizards.delete(user.id);
      return this.getMainMenu(user);
    }
    if (text === "/sync" || text === "\u{1F504} Sync Now") {
      sourceMonitor.checkSources().catch(() => {
      });
      return {
        text: `\u{1F504} **Immediate Sync Triggered!**

Polling configured X sources now for any new posts. If new content is found, it will be automatically filtered, rewritten, and dispatched!`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "\u26A1 View Bridges", callback_data: "view_automations" }],
            [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
          ]
        }
      };
    }
    if (text === "/automations" || text === "\u26A1 My Automations") {
      return this.getAutomationsMenu(user);
    }
    if (text === "/new" || text === "\u2795 New Automation" || text === "\u{1F680} Setup Bridge") {
      return this.startWizard(user);
    }
    if (text === "/connect_x" || text === "\u{1F517} Connect X") {
      return this.getConnectXMenu(user);
    }
    if (text === "/settings" || text === "\u2699\uFE0F Settings") {
      return this.getSettingsMenu(user);
    }
    if (text === "/otherbots" || text === "\u{1F916} Other Bots") {
      return this.getOtherBotsMenu();
    }
    if (text === "/stats" || text === "\u{1F4CA} My Stats") {
      return this.getStatsMenu(user);
    }
    if (text === "/help" || text === "\u2139\uFE0F Help & Guide") {
      return this.getHelpMenu();
    }
    if (isXUrl(text)) {
      const xUrl = formatXInput(text);
      userWizards.set(user.id, {
        step: "destination",
        direction: "x_to_telegram",
        source: xUrl
      });
      return {
        text: `\u{1F517} **X (Twitter) Link Received:**
${xUrl}

\u{1F4E2} **Step 2 of 2: Where should new posts from this X link be published in Telegram?**

1\uFE0F\u20E3 Add this bot as an **Administrator** in your Telegram channel with *Post Messages* permission.
2\uFE0F\u20E3 Send your channel username or link below (for example: \`@my_channel\` or \`https://t.me/my_channel\`):`,
        replyMarkup: {
          inline_keyboard: [[{ text: "\xAB Cancel", callback_data: "main_menu" }]]
        }
      };
    }
    const cleanLower = text.toLowerCase().trim();
    if (cleanLower === "/x" || cleanLower === "/twitter" || cleanLower === "/link" || cleanLower === "x link" || cleanLower === "twitter link" || cleanLower.includes("twitter link") || cleanLower.includes("x link") || cleanLower.includes("twitter url") || cleanLower.includes("x url")) {
      const handle = user.settings.xCredentials?.accountHandle;
      if (handle) {
        const xLink = handle.startsWith("http") ? handle : `https://x.com/${handle.replace(/^@/, "")}`;
        return {
          text: `\u{1F517} **Your Connected X (Twitter) Link:**
${xLink}

This account is authorized for cross-posting with your Telegram channels.`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: "\u{1F310} View on X", url: xLink }],
              [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
            ]
          }
        };
      } else {
        return {
          text: `\u{1F517} **X (Twitter) Link:**

You have not connected an X account yet. Authorize your account below with 1 click:`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: "\u{1F517} Connect X Account", url: getTelegramButtonUrl(`/api/auth/x/login?userId=${user.id}`) }],
              [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
            ]
          }
        };
      }
    }
    return {
      text: `\u{1F44B} Hello ${user.firstName}! Use the buttons below or send /start anytime to manage your cross-posting:`,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: "\u26A1 My Bridges", callback_data: "view_automations" },
            { text: "\u2795 Set Up Bridge", callback_data: "new_automation_start" }
          ],
          [
            { text: "\u2699\uFE0F Settings", callback_data: "settings_view" },
            { text: "\u{1F310} Web Dashboard", url: getTelegramButtonUrl(`/?auth_token=${user.authToken}`) }
          ]
        ]
      }
    };
  }
  async handleCallback(user, data) {
    if (data === "main_menu") {
      userWizards.delete(user.id);
      return this.getMainMenu(user);
    }
    if (data === "view_automations") {
      return this.getAutomationsMenu(user);
    }
    if (data === "new_automation_start") {
      return this.startWizard(user);
    }
    if (data === "connect_x_view") {
      return this.getConnectXMenu(user);
    }
    if (data === "settings_view") {
      return this.getSettingsMenu(user);
    }
    if (data === "other_bots_view") {
      return this.getOtherBotsMenu();
    }
    if (data === "stats_view") {
      return this.getStatsMenu(user);
    }
    if (data === "help_view") {
      return this.getHelpMenu();
    }
    if (data === "toggle_setting_rewrite") {
      user.settings.autoRewrite = !user.settings.autoRewrite;
      db.upsertUser(user);
      return this.getSettingsMenu(user, `AI Rewriter is now ${user.settings.autoRewrite ? "ON" : "OFF"}`);
    }
    if (data === "toggle_setting_adfilter") {
      user.settings.adFilterEnabled = !user.settings.adFilterEnabled;
      db.upsertUser(user);
      return this.getSettingsMenu(user, `Spam & Ad Filter is now ${user.settings.adFilterEnabled ? "ON" : "OFF"}`);
    }
    if (data === "cycle_setting_format") {
      const formats = ["auto", "concise", "thread"];
      const currentIndex = formats.indexOf(user.settings.defaultPostFormat || "auto");
      user.settings.defaultPostFormat = formats[(currentIndex + 1) % formats.length];
      db.upsertUser(user);
      return this.getSettingsMenu(user, `Post Format set to ${user.settings.defaultPostFormat.toUpperCase()}`);
    }
    if (data === "wiz_dir_x2tg") {
      const wizard = { step: "source", direction: "x_to_telegram" };
      userWizards.set(user.id, wizard);
      return {
        text: `\u{1F426} **Step 1 of 2: Which X (Twitter) account do you want to monitor?**

Please send the X profile/post URL or handle in the chat below (for example: \`https://x.com/OpenAI\` or \`@OpenAI\`):

*(No password or API key is required)*`,
        replyMarkup: {
          inline_keyboard: [[{ text: "\xAB Cancel", callback_data: "main_menu" }]]
        }
      };
    }
    if (data === "wiz_dir_tg2x") {
      const isConnected = Boolean(user.settings.xCredentials?.oauth2AccessToken);
      const oauthUrl = getTelegramButtonUrl(`/api/auth/x/login?userId=${user.id}`);
      if (!isConnected) {
        return {
          text: `\u{1F4E2} **Step 1 of 2: Connect Your X (Twitter) Account**

To publish from your Telegram channel to X, please authorize your X account with 1-click using official X OAuth 2.0:

\u{1F512} *We never ask for your password or API keys. Authorize securely via twitter.com.*`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: "\u{1F517} Authorize on X (Twitter)", url: oauthUrl }],
              [{ text: "I have authorized, continue \u2794", callback_data: "wiz_dir_tg2x_authorized" }],
              [{ text: "\xAB Cancel", callback_data: "main_menu" }]
            ]
          }
        };
      }
      return this.proceedToTg2xStep2(user);
    }
    if (data === "wiz_dir_tg2x_authorized") {
      return this.proceedToTg2xStep2(user);
    }
    if (data.startsWith("auto_toggle_")) {
      const autoId = data.replace("auto_toggle_", "");
      const auto = db.getAutomation(autoId, user.id);
      if (auto) {
        const newStatus = auto.status === "active" ? "paused" : "active";
        db.updateAutomation(autoId, user.id, { status: newStatus });
        return this.getAutomationsMenu(user, `Automation is now ${newStatus.toUpperCase()}`);
      }
    }
    if (data.startsWith("auto_del_")) {
      const autoId = data.replace("auto_del_", "");
      db.deleteAutomation(autoId, user.id);
      return this.getAutomationsMenu(user, `Automation deleted successfully.`);
    }
    return this.getMainMenu(user);
  }
  proceedToTg2xStep2(user) {
    const wizard = { step: "source", direction: "telegram_to_x" };
    userWizards.set(user.id, wizard);
    return {
      text: `\u{1F4E2} **Step 2 of 2: Which Telegram channel do you want to cross-post from?**

1\uFE0F\u20E3 Add this bot as an **Administrator** in your Telegram channel.
2\uFE0F\u20E3 Send your channel username or link (for example: \`@my_channel\` or \`https://t.me/my_channel\`):

*(Type it in the chat below)*`,
      replyMarkup: {
        inline_keyboard: [[{ text: "\xAB Cancel", callback_data: "main_menu" }]]
      }
    };
  }
  startWizard(user) {
    userWizards.set(user.id, { step: "direction" });
    return {
      text: `\u2795 **Set Up a Cross-Posting Bridge**

Choose the sync direction for this bridge:`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u{1F426} X (Twitter) \u2794 \u{1F4E2} Telegram Channel", callback_data: "wiz_dir_x2tg" }],
          [{ text: "\u{1F4E2} Telegram Channel \u2794 \u{1F426} X (Twitter)", callback_data: "wiz_dir_tg2x" }],
          [{ text: "\xAB Back to Menu", callback_data: "main_menu" }]
        ]
      }
    };
  }
  async handleWizardInput(user, wizard, text) {
    const cleanInput = text.trim();
    if (wizard.step === "source") {
      if (wizard.direction === "x_to_telegram") {
        if (isXUrl(cleanInput)) {
          const xUrl = formatXInput(cleanInput);
          wizard.source = xUrl;
          wizard.step = "destination";
          return {
            text: `\u2705 Source set to: ${xUrl}

\u{1F4E2} **Step 2 of 2: Where should new posts be published in Telegram?**

1\uFE0F\u20E3 Add this bot as an **Administrator** in your Telegram channel with *Post Messages* permission.
2\uFE0F\u20E3 Send your channel username or link below (for example: \`@my_channel\` or \`https://t.me/my_channel\`):`,
            replyMarkup: { inline_keyboard: [[{ text: "\xAB Cancel", callback_data: "main_menu" }]] }
          };
        }
        const handle = cleanInput.startsWith("@") ? cleanInput : `@${cleanInput}`;
        if (!/^@[a-zA-Z0-9_]{1,25}$/.test(handle)) {
          return {
            text: `\u26A0\uFE0F Please enter a valid X (Twitter) URL (e.g. \`https://x.com/OpenAI\`) or handle (\`@OpenAI\`):`,
            replyMarkup: { inline_keyboard: [[{ text: "\xAB Cancel", callback_data: "main_menu" }]] }
          };
        }
        wizard.source = handle;
        wizard.step = "destination";
        return {
          text: `\u2705 Source set to: **${handle}**

\u{1F4E2} **Step 2 of 2: Where should new posts be published in Telegram?**

1\uFE0F\u20E3 Add this bot as an **Administrator** in your Telegram channel with *Post Messages* permission.
2\uFE0F\u20E3 Send your channel username or link below (for example: \`@my_channel\` or \`https://t.me/my_channel\`):`,
          replyMarkup: { inline_keyboard: [[{ text: "\xAB Cancel", callback_data: "main_menu" }]] }
        };
      } else {
        const parsed = parseTelegramChannelInput(cleanInput);
        if (!parsed.valid) {
          return {
            text: `\u26A0\uFE0F ${parsed.error}

Please enter your channel username (e.g. \`@my_channel\`) or invite link:`,
            replyMarkup: { inline_keyboard: [[{ text: "\xAB Cancel", callback_data: "main_menu" }]] }
          };
        }
        wizard.source = parsed.canonical;
        wizard.step = "destination";
        const userXHandle = user.settings.xCredentials?.accountHandle;
        const destination = userXHandle ? userXHandle.startsWith("http") ? userXHandle : `https://x.com/${userXHandle.replace(/^@/, "")}` : user.telegramUsername ? `https://x.com/${user.telegramUsername.replace(/^@/, "")}` : "https://x.com";
        wizard.destination = destination;
        return this.finishWizard(user, wizard);
      }
    }
    if (wizard.step === "destination") {
      let destination = cleanInput;
      if (wizard.direction === "x_to_telegram") {
        const parsed = parseTelegramChannelInput(cleanInput);
        if (!parsed.valid) {
          return {
            text: `\u26A0\uFE0F ${parsed.error}

Please enter your channel username (e.g. \`@my_channel\`) or invite link:`,
            replyMarkup: { inline_keyboard: [[{ text: "\xAB Cancel", callback_data: "main_menu" }]] }
          };
        }
        destination = parsed.canonical;
      } else {
        destination = formatXInput(cleanInput);
      }
      wizard.destination = destination;
      return this.finishWizard(user, wizard);
    }
    return this.getMainMenu(user);
  }
  finishWizard(user, wizard) {
    userWizards.delete(user.id);
    const newAuto = {
      id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      name: `${wizard.source} \u2794 ${wizard.destination}`,
      direction: wizard.direction || "x_to_telegram",
      source: wizard.source || "",
      destination: wizard.destination || "",
      status: "active",
      settings: {
        filterPromotions: user.settings.adFilterEnabled ?? true,
        autoRewrite: user.settings.autoRewrite ?? true,
        format: user.settings.defaultPostFormat || "auto",
        includeMedia: true,
        includeOriginalLink: true,
        preserveHashtags: true
      },
      stats: {
        processedCount: 0,
        skippedAdsCount: 0,
        failedCount: 0
      },
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.createAutomation(newAuto);
    db.logSystem("info", "telegram_bot", `User activated cross-posting bridge: ${newAuto.name}`, user.id);
    const isXToTg = newAuto.direction === "x_to_telegram";
    return {
      text: `\u{1F389} **Cross-Posting Bridge is Live!**

\u2022 **Bridge**: ${newAuto.name}
\u2022 **Direction**: ${isXToTg ? "X (Twitter) \u2794 Telegram" : "Telegram \u2794 X (Twitter)"}
\u2022 **Status**: \u{1F7E2} **Active**

\u2728 **AI Fact Preservation**: Active (all dates, quotes & numbers preserved)
\u{1F6E1}\uFE0F **Spam & Ad Filter**: Active (promotional ads & shills automatically blocked)
\u{1F4F8} **Media Synchronization**: Active (photos, videos & galleries)`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u26A1 View My Bridges", callback_data: "view_automations" }],
          [{ text: "\u2795 Set Up Another Bridge", callback_data: "new_automation_start" }],
          [{ text: "\u{1F310} Open Web Dashboard", url: getTelegramButtonUrl(`/?auth_token=${user.authToken}`) }],
          [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
        ]
      }
    };
  }
  getMainMenu(user) {
    const automations = db.getAutomations(user.id);
    const activeCount = automations.filter((a) => a.status === "active").length;
    const webLoginUrl = getTelegramButtonUrl(`/?auth_token=${user.authToken}`);
    if (automations.length === 0) {
      return {
        text: `\u{1F44B} **Welcome, ${user.firstName}!**

\u{1F916} **X (Twitter) \u2194 Telegram Sync Bot**
I automatically sync your content between X and Telegram channels with:

\u2728 **AI Fact-Preserving Rewrites**: Adapts tone while keeping 100% of facts, quotes, dates, and metrics.
\u{1F6E1}\uFE0F **Spam & Ad Filter**: Discards token presales, crypto shills, and sponsor ads.
\u{1F512} **Zero API Keys Required**: Authorize with 1 click or set up public channels directly.

\u{1F680} **Let's set up your first bridge in 2 simple steps:**`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "\u{1F426} X (Twitter) \u2794 \u{1F4E2} Telegram Channel", callback_data: "wiz_dir_x2tg" }],
            [{ text: "\u{1F4E2} Telegram Channel \u2794 \u{1F426} X (Twitter)", callback_data: "wiz_dir_tg2x" }],
            [
              { text: "\u{1F310} Web Dashboard", url: webLoginUrl },
              { text: "\u2699\uFE0F Settings", callback_data: "settings_view" }
            ],
            [
              { text: "\u{1F916} Recommended Bots", callback_data: "other_bots_view" },
              { text: "\u2139\uFE0F How It Works", callback_data: "help_view" }
            ]
          ]
        }
      };
    }
    return {
      text: `\u{1F44B} **Welcome back, ${user.firstName}!**

\u{1F4CA} **Your Workspace:**
\u2022 Active Bridges: **${activeCount} / ${automations.length}**
\u2022 Posts Processed: **${user.postsProcessedCount || 0}**
\u2022 Ads Blocked: **${user.postsFilteredAdsCount || 0}**

Select an option below or open your personal Web Dashboard:`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u26A1 My Bridges", callback_data: "view_automations" }],
          [{ text: "\u2795 Set Up New Bridge", callback_data: "new_automation_start" }],
          [
            { text: "\u{1F310} Open Web Dashboard", url: webLoginUrl },
            { text: "\u2699\uFE0F Settings", callback_data: "settings_view" }
          ],
          [
            { text: "\u{1F517} Connect X Account", callback_data: "connect_x_view" },
            { text: "\u{1F916} Recommended Bots", callback_data: "other_bots_view" }
          ],
          [{ text: "\u{1F4CA} Statistics", callback_data: "stats_view" }]
        ]
      }
    };
  }
  getAutomationsMenu(user, notice) {
    const automations = db.getAutomations(user.id);
    let text = `${notice ? `\u2139\uFE0F *${notice}*

` : ""}\u26A1 **Your Active Bridges (${automations.length})**

`;
    if (automations.length === 0) {
      text += `You haven't set up any cross-posting bridges yet.

Click **\u2795 Set Up New Bridge** below to link your first X handle and Telegram channel in 1 minute!`;
      return {
        text,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "\u2795 Set Up New Bridge", callback_data: "new_automation_start" }],
            [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
          ]
        }
      };
    }
    const keyboard = [];
    automations.forEach((auto, i) => {
      const icon = auto.status === "active" ? "\u{1F7E2}" : "\u23F8\uFE0F";
      text += `${i + 1}. ${icon} **${auto.name}**
   Processed: ${auto.stats.processedCount} | Blocked Ads: ${auto.stats.skippedAdsCount}

`;
      keyboard.push([
        { text: `${auto.status === "active" ? "\u23F8\uFE0F Pause" : "\u25B6\uFE0F Resume"} #${i + 1}`, callback_data: `auto_toggle_${auto.id}` },
        { text: `\u{1F5D1}\uFE0F Delete #${i + 1}`, callback_data: `auto_del_${auto.id}` }
      ]);
    });
    keyboard.push([{ text: "\u2795 Set Up Another Bridge", callback_data: "new_automation_start" }]);
    keyboard.push([{ text: "\xAB Main Menu", callback_data: "main_menu" }]);
    return { text, replyMarkup: { inline_keyboard: keyboard } };
  }
  getSettingsMenu(user, notice) {
    const rewriteOn = user.settings.autoRewrite !== false;
    const adFilterOn = user.settings.adFilterEnabled !== false;
    const format = user.settings.defaultPostFormat || "auto";
    let text = `${notice ? `\u2139\uFE0F *${notice}*

` : ""}\u2699\uFE0F **Your Cross-Posting Settings**

Tap the buttons below to toggle your content preferences:

\u2022 **AI Rewriter**: Rewrites posts naturally while strictly preserving quotes, facts, dates, and claims.
\u2022 **Ad & Shill Filter**: Automatically detects and skips sponsored posts, token presales, and affiliate links.
\u2022 **Post Format**: Choose between adaptive auto-sizing, 280-character concise posts, or multi-part threads.`;
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: `\u2728 AI Rewriter: ${rewriteOn ? "\u{1F7E2} ON" : "\u26AA OFF"}`, callback_data: "toggle_setting_rewrite" }],
          [{ text: `\u{1F6E1}\uFE0F Spam & Ad Filter: ${adFilterOn ? "\u{1F7E2} ON" : "\u26AA OFF"}`, callback_data: "toggle_setting_adfilter" }],
          [{ text: `\u{1F4DD} Format: ${format.toUpperCase()}`, callback_data: "cycle_setting_format" }],
          [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
        ]
      }
    };
  }
  getConnectXMenu(user) {
    const isConnected = Boolean(user.settings.xCredentials?.oauth2AccessToken);
    const oauthUrl = getTelegramButtonUrl(`/api/auth/x/login?userId=${user.id}`);
    const handle = user.settings.xCredentials?.accountHandle;
    let text = `\u{1F517} **Connect Your X (Twitter) Account**

`;
    if (isConnected) {
      const xUrl = handle ? handle.startsWith("http") ? handle : `https://x.com/${handle.replace(/^@/, "")}` : "";
      text += `\u2705 Your X account is **Connected via OAuth 2.0 PKCE**${xUrl ? `:
\u{1F517} ${xUrl}` : ""}.

You are authorized to post from Telegram to X. No passwords or API keys are stored on our servers.`;
      return {
        text,
        replyMarkup: {
          inline_keyboard: [
            ...xUrl ? [[{ text: "\u{1F310} Open X Profile", url: xUrl }]] : [],
            [{ text: "\u26A1 View My Bridges", callback_data: "view_automations" }],
            [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
          ]
        }
      };
    }
    text += `To publish posts from Telegram to X, authorize your X account with 1-click using official X OAuth 2.0:

1\uFE0F\u20E3 Tap **Authorize on X (Twitter)** below.
2\uFE0F\u20E3 Authorize the official sync application.
3\uFE0F\u20E3 Return here to start publishing!`;
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u{1F517} Authorize on X (Twitter)", url: oauthUrl }],
          [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
        ]
      }
    };
  }
  getOtherBotsMenu() {
    const bots = db.getOtherBots(true);
    if (bots.length === 0) {
      return {
        text: `\u{1F916} **Recommended Partner Bots**

There are currently no other partner bots listed.

Featured tools configured by the administrator will appear here.`,
        replyMarkup: { inline_keyboard: [[{ text: "\xAB Main Menu", callback_data: "main_menu" }]] }
      };
    }
    let text = `\u{1F916} **Recommended Partner Bots (${bots.length})**

Explore tools verified by our team:

`;
    const keyboard = [];
    bots.forEach((bot) => {
      text += `${bot.icon || "\u{1F916}"} **${bot.name}**
${bot.description}

`;
      keyboard.push([
        { text: `${bot.icon || "\u{1F916}"} Open ${bot.name}`, url: bot.url || `https://t.me/${bot.username.replace("@", "")}` }
      ]);
    });
    keyboard.push([{ text: "\xAB Main Menu", callback_data: "main_menu" }]);
    return { text, replyMarkup: { inline_keyboard: keyboard } };
  }
  getStatsMenu(user) {
    const automations = db.getAutomations(user.id);
    const totalProcessed = automations.reduce((acc, a) => acc + a.stats.processedCount, 0);
    const totalSkippedAds = automations.reduce((acc, a) => acc + a.stats.skippedAdsCount, 0);
    const totalFailed = automations.reduce((acc, a) => acc + a.stats.failedCount, 0);
    return {
      text: `\u{1F4CA} **Your Processing Statistics**

\u{1F464} Account: **${user.telegramUsername}**
\u{1F4C5} Member Since: **${new Date(user.createdAt).toLocaleDateString()}**

\u{1F4C8} **Deliveries:**
\u2022 Active Bridges: **${automations.filter((a) => a.status === "active").length}**
\u2022 Posts Processed & Published: **${totalProcessed}**
\u2022 Commercial Ads & Spam Filtered: **${totalSkippedAds}**
\u2022 Failed Deliveries: **${totalFailed}**

\u{1F4A1} *AI preserves 100% of facts, names, dates, and numbers while removing promotional clutter.*`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u26A1 View My Bridges", callback_data: "view_automations" }],
          [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
        ]
      }
    };
  }
  getHelpMenu() {
    return {
      text: `\u2139\uFE0F **Simple Setup Guide**

**1. For X (Twitter) \u2794 Telegram:**
\u2022 Add this bot as an **Administrator** in your Telegram channel with *Post Messages* permission.
\u2022 Send /new or tap **\u2795 Set Up Bridge**.
\u2022 Select *X \u2794 Telegram* and provide the X handle and your channel link.

**2. For Telegram \u2794 X (Twitter):**
\u2022 Tap **\u{1F517} Connect X Account** to authorize via official X OAuth 2.0.
\u2022 Add the bot to your Telegram channel.
\u2022 Posts in your channel will be published to X automatically!

**Commands:**
/start - Open main menu
/new - Set up a new cross-posting bridge
/automations - Manage active bridges
/settings - Toggle AI rewrite & ad filter
/otherbots - View recommended partner bots
/help - Show this guide`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u2795 Set Up Bridge Now", callback_data: "new_automation_start" }],
          [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
        ]
      }
    };
  }
  async broadcast(text, buttonText, buttonUrl) {
    const users = db.getUsers();
    let sent = 0;
    let failed = 0;
    const replyMarkup = buttonText && buttonUrl ? { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] } : void 0;
    for (const u of users) {
      if (!u.telegramId) continue;
      try {
        if (telegramClient.hasValidToken()) {
          await telegramClient.sendMessage(u.telegramId, text, {
            parse_mode: "Markdown",
            reply_markup: replyMarkup
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
    db.logSystem("info", "telegram_bot", `Broadcast completed: delivered to ${sent}/${users.length} users`);
    return { sent, failed, total: users.length };
  }
};
var getGlobalTelegramBot = () => {
  const globalAny = globalThis;
  if (!globalAny[GLOBAL_BOT_HANDLER_KEY]) {
    globalAny[GLOBAL_BOT_HANDLER_KEY] = new TelegramBotHandler();
  }
  return globalAny[GLOBAL_BOT_HANDLER_KEY];
};
var telegramBot = getGlobalTelegramBot();

// server.ts
var PORT = Number(process.env.PORT) || 3e3;
var oauthSessions = /* @__PURE__ */ new Map();
var requireAdmin = (req, res, next) => {
  const adminKey = req.headers["x-admin-key"] || req.query.adminKey;
  const configuredKey = (process.env.ADMIN_KEY || "").trim();
  if (!configuredKey) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY is not configured on the server. Please set ADMIN_KEY in your environment variables."
    });
  }
  if (!adminKey || adminKey.trim() !== configuredKey) {
    return res.status(401).json({ ok: false, error: "Unauthorized: Invalid or missing ADMIN_KEY" });
  }
  next();
};
var isServerStarted = false;
async function startServer() {
  if (isServerStarted) {
    return;
  }
  isServerStarted = true;
  const app = express();
  app.enable("trust proxy");
  app.use(express.json());
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      time: (/* @__PURE__ */ new Date()).toISOString(),
      appUrl: getAppUrl(),
      env: process.env.NODE_ENV || "development"
    });
  });
  app.all("/api/telegram/webhook", (_req, res) => {
    res.status(410).json({
      ok: false,
      error: "Telegram webhook is disabled. This personal bot operates exclusively via Telegram Long Polling."
    });
  });
  app.post("/api/telegram/verify-channel", async (req, res) => {
    try {
      const { channelId, botToken } = req.body;
      if (!channelId) {
        return res.status(400).json({ ok: false, error: "Channel identifier is required" });
      }
      const result = await telegramClient.verifyChannelPermissions(channelId, botToken);
      res.json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.get("/api/auth/x/login", (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).json({ ok: false, error: "Missing userId parameter" });
      }
      const user = db.getUser(userId);
      if (!user) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }
      const appUrl = getAppUrl();
      const redirectUri = `${appUrl}/api/auth/x/callback`;
      const { verifier, challenge } = xClient.generatePKCE();
      const state = `xstate_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      oauthSessions.set(state, {
        userId,
        codeVerifier: verifier,
        redirectUri,
        createdAt: Date.now()
      });
      const authUrl = xClient.getOAuth2AuthorizeUrl({
        redirectUri,
        state,
        codeChallenge: challenge
      });
      if (req.accepts("html") && !req.xhr && !req.headers.accept?.includes("application/json")) {
        return res.redirect(authUrl);
      }
      res.json({ ok: true, url: authUrl, state });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.get("/api/auth/x/callback", async (req, res) => {
    try {
      const { code, state, error, error_description } = req.query;
      if (error) {
        return res.send(`<html><body style="font-family: sans-serif; padding: 40px; background: #0f172a; color: white;"><h2>X Authorization Failed</h2><p>${error_description || error}</p><a href="/" style="color: #38bdf8;">Return to App</a></body></html>`);
      }
      if (!code || !state) {
        return res.status(400).send("Missing code or state parameter.");
      }
      const session = oauthSessions.get(state);
      if (!session) {
        return res.status(400).send("Expired or invalid OAuth session. Please try again from Dashboard.");
      }
      oauthSessions.delete(state);
      const tokenResult = await xClient.exchangeOAuth2Code({
        code,
        codeVerifier: session.codeVerifier,
        redirectUri: session.redirectUri
      });
      const user = db.getUser(session.userId);
      if (user) {
        user.settings.xCredentials = {
          ...user.settings.xCredentials,
          oauth2AccessToken: tokenResult.accessToken,
          oauth2RefreshToken: tokenResult.refreshToken,
          oauth2ExpiresAt: Date.now() + tokenResult.expiresIn * 1e3,
          oauth2Scope: tokenResult.scope
        };
        db.upsertUser(user);
        db.logSystem("success", "api", `User ${user.telegramUsername} authorized X account via OAuth2 PKCE`, user.id);
      }
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>X Authorization Successful</title></head>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
            <div style="text-align: center; max-width: 450px; padding: 32px; background: #1e293b; border-radius: 12px; border: 1px solid #334155;">
              <div style="font-size: 48px; margin-bottom: 16px;">\u{1F389}</div>
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).send(`<html><body style="font-family: sans-serif; padding: 40px; background: #0f172a; color: white;"><h2>OAuth Exchange Failed</h2><p>${message}</p><a href="/" style="color: #38bdf8;">Return</a></body></html>`);
    }
  });
  app.post("/api/auth/x/disconnect", (req, res) => {
    const { userId } = req.body;
    const user = db.getUser(userId);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    user.settings.xCredentials.oauth2AccessToken = void 0;
    user.settings.xCredentials.oauth2RefreshToken = void 0;
    user.settings.xCredentials.oauth2ExpiresAt = void 0;
    db.upsertUser(user);
    db.logSystem("info", "api", `User ${user.telegramUsername} disconnected X authorization`, user.id);
    res.json({ ok: true });
  });
  app.get("/api/telegram/info", (_req, res) => {
    const settings = db.getSettings();
    const botUsername = (settings.botUsername || process.env.TELEGRAM_BOT_USERNAME || "").replace("@", "");
    res.json({ ok: true, botUsername });
  });
  app.post("/api/user/auth-by-token", (req, res) => {
    const { token, telegramId, username } = req.body;
    let user = null;
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
      return res.status(404).json({ ok: false, error: "User not found for provided credentials" });
    }
    user.lastActiveAt = (/* @__PURE__ */ new Date()).toISOString();
    db.upsertUser(user);
    res.json({ ok: true, user });
  });
  app.post("/api/user/register-or-login", (req, res) => {
    const { telegramHandle } = req.body;
    if (!telegramHandle) {
      return res.status(400).json({ ok: false, error: "Telegram handle or ID is required" });
    }
    const cleanHandle = telegramHandle.trim().startsWith("@") ? telegramHandle.trim() : `@${telegramHandle.trim()}`;
    const user = db.getUser(cleanHandle);
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "Account not found. Please message your Telegram bot and send /start to activate your dashboard."
      });
    }
    user.lastActiveAt = (/* @__PURE__ */ new Date()).toISOString();
    db.upsertUser(user);
    res.json({ ok: true, user });
  });
  app.get("/api/user/profile", (req, res) => {
    const userId = req.query.userId;
    const token = req.query.token;
    let user = null;
    if (token) user = db.getUserByToken(token);
    if (!user && userId) user = db.getUser(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    res.json({ ok: true, user });
  });
  app.get("/api/user/automations", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId is required" });
    }
    const automations = db.getAutomations(userId);
    res.json({ ok: true, automations });
  });
  app.post("/api/user/automations", (req, res) => {
    try {
      const { userId, name, direction, source, destination, settings } = req.body;
      if (!userId || !source || !destination) {
        return res.status(400).json({ ok: false, error: "Missing required parameters" });
      }
      const user = db.getUser(userId);
      if (!user) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }
      let cleanSource = source.trim();
      let cleanDestination = destination.trim();
      if (direction === "x_to_telegram") {
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
        name: name || `${cleanSource} \u2794 ${cleanDestination}`,
        direction: direction || "x_to_telegram",
        source: cleanSource,
        destination: cleanDestination,
        status: "active",
        settings: {
          filterPromotions: true,
          autoRewrite: true,
          format: "auto",
          includeMedia: true,
          includeOriginalLink: true,
          preserveHashtags: true,
          ...settings || {}
        },
        stats: {
          processedCount: 0,
          skippedAdsCount: 0,
          failedCount: 0
        },
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      db.logSystem("info", "api", `Created automation ${created.name}`, userId);
      res.json({ ok: true, automation: created });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.post("/api/user/automations/:id/toggle", (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    const auto = db.getAutomation(id, userId);
    if (!auto) return res.status(404).json({ ok: false, error: "Automation not found" });
    const newStatus = auto.status === "active" ? "paused" : "active";
    const updated = db.updateAutomation(id, userId, { status: newStatus });
    res.json({ ok: true, automation: updated });
  });
  app.post("/api/user/automations/:id/sync", async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      const auto = db.getAutomation(id, userId);
      if (!auto) return res.status(404).json({ ok: false, error: "Automation not found" });
      sourceMonitor.resetCooldown(id);
      if (auto.direction === "x_to_telegram") {
        const user = db.getUser(userId);
        const creds = user?.settings?.xCredentials;
        let tweets;
        try {
          tweets = await xClient.fetchRecentTweets(
            auto.source,
            auto.lastSeenPostId,
            {
              bearerToken: creds?.bearerToken,
              oauth2AccessToken: creds?.oauth2AccessToken
            }
          );
        } catch (pollErr) {
          const pollMsg = pollErr instanceof Error ? pollErr.message : String(pollErr);
          const isCreditsDepleted = pollMsg.toLowerCase().includes("credits depleted");
          const notice = isCreditsDepleted ? `Official X API read quota is currently depleted for ${auto.source}. Free tier permits posting to X (Telegram \u2794 X), but reading requires X API Basic credits. You can still test your bridge using the 'Test Run' button.` : pollMsg;
          db.updateAutomation(auto.id, userId, {
            lastError: notice,
            lastPollAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          return res.json({
            ok: false,
            isCreditsDepleted,
            error: notice,
            message: notice
          });
        }
        if (tweets && tweets.length > 0) {
          for (const t of tweets) {
            automationQueue.enqueuePost(auto, {
              sourcePostId: t.id,
              sourceAuthor: t.author,
              sourceContent: t.text,
              sourceUrl: t.url,
              media: t.media
            });
          }
          db.updateAutomation(auto.id, userId, {
            lastSeenPostId: tweets[0].id,
            lastPollAt: (/* @__PURE__ */ new Date()).toISOString(),
            lastError: void 0
          });
          return res.json({ ok: true, syncedCount: tweets.length, message: `Queued ${tweets.length} new tweets for processing!` });
        }
        db.updateAutomation(auto.id, userId, {
          lastPollAt: (/* @__PURE__ */ new Date()).toISOString(),
          lastError: void 0
        });
        return res.json({ ok: true, syncedCount: 0, message: "Source checked. No new posts since last poll." });
      } else {
        return res.json({ ok: true, syncedCount: 0, message: "Channel automations continuously listen for new posts." });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.delete("/api/user/automations/:id", (req, res) => {
    const { id } = req.params;
    const userId = req.query.userId || req.body.userId;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId is required" });
    }
    const success = db.deleteAutomation(id, userId);
    res.json({ ok: success });
  });
  app.post("/api/user/settings", (req, res) => {
    const { userId, settings } = req.body;
    const user = db.getUser(userId);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    user.settings = { ...user.settings, ...settings };
    db.upsertUser(user);
    res.json({ ok: true, settings: user.settings });
  });
  app.get("/api/user/logs", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId is required" });
    }
    const limit = parseInt(req.query.limit) || 50;
    const logs = db.getPostLogs(userId, limit);
    res.json({ ok: true, logs });
  });
  app.get("/api/other-bots", (req, res) => {
    const bots = db.getOtherBots(true);
    res.json({ ok: true, bots });
  });
  app.post("/api/other-bots/:id/click", (req, res) => {
    db.recordBotClick(req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/pipeline/test", async (req, res) => {
    try {
      const { content, direction, format, author } = req.body;
      if (!content) {
        return res.status(400).json({ ok: false, error: "Content is required" });
      }
      const urls = content.match(/https?:\/\/[^\s]+/g) || [];
      const [adResult, rewriteResult] = await Promise.all([
        detectAdOrPromotion(content, urls, author || "@SourceAccount"),
        rewriteSocialPost({
          content,
          direction: direction || "x_to_telegram",
          preferredFormat: format || "auto",
          sourceAuthor: author || "@SourceAccount"
        })
      ]);
      res.json({
        ok: true,
        adResult,
        rewriteResult
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.post("/api/admin/verify-key", (req, res) => {
    const { adminKey } = req.body;
    const configuredKey = (process.env.ADMIN_KEY || "").trim();
    if (!configuredKey) {
      return res.status(500).json({
        ok: false,
        error: "ADMIN_KEY is not configured on the server. Please set ADMIN_KEY in your environment variables."
      });
    }
    if (!adminKey || adminKey.trim() !== configuredKey) {
      return res.status(401).json({ ok: false, error: "Invalid ADMIN_KEY" });
    }
    res.json({ ok: true });
  });
  app.get("/api/admin/stats", requireAdmin, (req, res) => {
    const stats = db.getSystemStats();
    stats.queuePendingCount = automationQueue.getPendingCount();
    res.json({ ok: true, stats });
  });
  app.get("/api/admin/logs", requireAdmin, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const logs = db.getSystemLogs(limit);
    res.json({ ok: true, logs });
  });
  app.post("/api/admin/broadcast", requireAdmin, async (req, res) => {
    try {
      const { text, buttonText, buttonUrl } = req.body;
      if (!text) return res.status(400).json({ ok: false, error: "Broadcast text required" });
      const result = await telegramBot.broadcast(text, buttonText, buttonUrl);
      res.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.get("/api/admin/other-bots", requireAdmin, (req, res) => {
    const bots = db.getOtherBots(false);
    res.json({ ok: true, bots });
  });
  app.post("/api/admin/other-bots", requireAdmin, (req, res) => {
    try {
      const { name, username, description, category, url, icon, badge, enabled, order } = req.body;
      if (!name || !username) {
        return res.status(400).json({ ok: false, error: "Name and Username are required" });
      }
      const cleanUsername = username.startsWith("@") ? username : `@${username}`;
      const bot = db.upsertOtherBot({
        id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        name,
        username: cleanUsername,
        description: description || "",
        category: category || "Utilities",
        url: url || `https://t.me/${cleanUsername.replace("@", "")}`,
        icon: icon || "\u{1F916}",
        badge: badge || "",
        enabled: enabled !== false,
        clicksCount: 0,
        order: Number(order) || 1,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      db.logSystem("info", "api", `Admin added new bot: ${bot.name} (${bot.username})`);
      res.json({ ok: true, bot });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.put("/api/admin/other-bots/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const existing = db.getOtherBots(false).find((b) => b.id === id);
    if (!existing) return res.status(404).json({ ok: false, error: "Bot not found" });
    const updated = db.upsertOtherBot({
      ...existing,
      ...req.body,
      id
    });
    db.logSystem("info", "api", `Admin updated bot: ${updated.name}`);
    res.json({ ok: true, bot: updated });
  });
  app.delete("/api/admin/other-bots/:id", requireAdmin, (req, res) => {
    const { id } = req.params;
    const success = db.deleteOtherBot(id);
    db.logSystem("info", "api", `Admin deleted bot ID: ${id}`);
    res.json({ ok: success });
  });
  app.get("/api/admin/settings", requireAdmin, (req, res) => {
    const settings = db.getSettings();
    const botStatus = telegramBot.getBotStatus();
    const safeSettings = {
      botUsername: settings.botUsername || process.env.TELEGRAM_BOT_USERNAME || "",
      hasTelegramToken: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim().length > 10),
      hasAdminKey: Boolean(process.env.ADMIN_KEY && process.env.ADMIN_KEY.trim().length > 0),
      hasMongoUri: Boolean(process.env.MONGODB_URI || process.env.MONGO_URI),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasTwitterCreds: Boolean(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET),
      isTokenUnauthorized: botStatus.isTokenUnauthorized,
      isPolling: botStatus.isPolling,
      isAiStudio: botStatus.isAiStudio,
      lastUpdateId: botStatus.lastUpdateId
    };
    res.json({ ok: true, settings: safeSettings });
  });
  app.post("/api/admin/settings", requireAdmin, (req, res) => {
    const forbiddenFields = [
      "botToken",
      "adminSecret",
      "TELEGRAM_BOT_TOKEN",
      "ADMIN_KEY",
      "TWITTER_CLIENT_SECRET",
      "TWITTER_BEARER_TOKEN",
      "TWITTER_CLIENT_ID",
      "GEMINI_API_KEY",
      "MONGODB_URI",
      "MONGO_URI"
    ];
    for (const field of forbiddenFields) {
      if (req.body && req.body[field] !== void 0) {
        delete req.body[field];
      }
    }
    const { botUsername } = req.body;
    const updated = db.updateSettings({
      ...botUsername !== void 0 && { botUsername }
    });
    res.json({ ok: true, settings: updated });
  });
  app.post("/api/admin/telegram-test", requireAdmin, async (req, res) => {
    try {
      const token = telegramClient.getActiveToken();
      if (!token) {
        return res.status(400).json({
          ok: false,
          error: "TELEGRAM_BOT_TOKEN environment variable is not configured on the server."
        });
      }
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const meJson = await meRes.json();
      if (!meJson.ok) {
        const desc = meJson.description || "Unknown error";
        if (meJson.error_code === 401 || meRes.status === 401) {
          return res.status(400).json({
            ok: false,
            error: "Telegram API 401: Unauthorized. The TELEGRAM_BOT_TOKEN in your environment variables is invalid or was revoked by @BotFather."
          });
        }
        return res.status(400).json({ ok: false, error: `Telegram Error [${meJson.error_code || meRes.status}]: ${desc}` });
      }
      try {
        await telegramClient.deleteWebhook(false, token);
      } catch {
      }
      if (meJson.result?.username) {
        db.updateSettings({ botUsername: meJson.result.username });
      }
      if (!isAiStudioEnvironment()) {
        telegramBot.wakeUpPolling();
      }
      res.json({
        ok: true,
        botInfo: meJson.result,
        message: `Verified and connected as @${meJson.result?.username}`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  const distPath = path2.join(process.cwd(), "dist");
  const hasDist = fs2.existsSync(path2.join(distPath, "index.html"));
  const isProd = process.env.NODE_ENV === "production" || hasDist;
  if (isProd && hasDist) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[X2Telegram Server] Running on http://0.0.0.0:${PORT}`);
    if (!isAiStudioEnvironment()) {
      sourceMonitor.start();
      telegramBot.startPolling();
    } else {
      console.log(
        "[X2Telegram Server] \u23F8\uFE0F Running in AI Gemini Studio mode: Web UI & Admin Panel active. Telegram Bot polling is STOPPED to prevent 409 conflict with Render production."
      );
    }
  });
  const gracefulShutdown = async (signal) => {
    console.log(`[X2Telegram Server] Received ${signal}. Stopping background workers...`);
    try {
      sourceMonitor.stop();
    } catch {
    }
    try {
      await telegramBot.stopPolling();
    } catch {
    }
    server.close(() => {
      console.log("[X2Telegram Server] HTTP server closed.");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5e3).unref();
  };
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
}
startServer();
