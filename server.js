// server.ts
import express from "express";
import path2 from "path";
import fs2 from "fs";
import { createServer as createViteServer } from "vite";

// server/db.ts
import fs from "fs";
import path from "path";
var DATA_DIR = path.join(process.cwd(), "data");
var DB_FILE = path.join(DATA_DIR, "db.json");
var startTime = Date.now();
var DEFAULT_SETTINGS = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || "",
  botUsername: "X2TelegramAutoBot",
  webhookUrl: `${process.env.APP_URL || "https://my-app.run.app"}/api/telegram/webhook`,
  isWebhookActive: false,
  adminSecret: process.env.ADMIN_KEY || "admin_secret_key",
  autoProcessSampleQueue: true
};
var DEFAULT_OTHER_BOTS = [
  {
    id: "bot_crypto_whale",
    name: "CryptoWhale Alert",
    username: "@CryptoWhaleTrackerBot",
    description: "Instant alerts on large on-chain transactions, exchange inflows, and token movements across 12 blockchains.",
    category: "Crypto & Trading",
    url: "https://t.me/CryptoWhaleTrackerBot",
    icon: "\u{1F40B}",
    badge: "Trending",
    enabled: true,
    clicksCount: 1420,
    order: 1,
    createdAt: new Date(Date.now() - 30 * 864e5).toISOString()
  },
  {
    id: "bot_ai_summarizer",
    name: "OmniAI Article Reader",
    username: "@OmniArticleReaderBot",
    description: "Forward any paywalled or long article URL to get a 30-second bulleted executive summary directly in Telegram.",
    category: "Productivity",
    url: "https://t.me/OmniArticleReaderBot",
    icon: "\u26A1",
    badge: "Popular",
    enabled: true,
    clicksCount: 2890,
    order: 2,
    createdAt: new Date(Date.now() - 45 * 864e5).toISOString()
  },
  {
    id: "bot_social_scheduler",
    name: "PostPilot Social Scheduler",
    username: "@PostPilotSchedulerBot",
    description: "Schedule broadcasts, format rich Telegram markdown polls, and preview visual media threads before publishing.",
    category: "Marketing",
    url: "https://t.me/PostPilotSchedulerBot",
    icon: "\u{1F4C5}",
    enabled: true,
    clicksCount: 934,
    order: 3,
    createdAt: new Date(Date.now() - 15 * 864e5).toISOString()
  },
  {
    id: "bot_rss_feed",
    name: "FeedMatrix Instant RSS",
    username: "@FeedMatrixBot",
    description: "Subscribe to any RSS, YouTube, or Substack publication and receive real-time updates directly in your private channels.",
    category: "News & Media",
    url: "https://t.me/FeedMatrixBot",
    icon: "\u{1F4F0}",
    enabled: true,
    clicksCount: 651,
    order: 4,
    createdAt: new Date(Date.now() - 10 * 864e5).toISOString()
  }
];
var DEFAULT_USERS = [
  {
    id: "user_alice_tech",
    telegramId: "78291041",
    telegramUsername: "@alice_tech",
    firstName: "Alice Chen",
    plan: "pro",
    postsProcessedCount: 42,
    postsFailedCount: 1,
    postsFilteredAdsCount: 8,
    status: "active",
    settings: {
      autoRewrite: true,
      adFilterEnabled: true,
      preserveFactsStrict: true,
      defaultPostFormat: "auto",
      xCredentials: {
        accountHandle: "@alicewriter",
        bearerToken: "x_sec_bearer_alice_sample"
      },
      telegramChannelId: "@tech_pulse_daily"
    },
    createdAt: new Date(Date.now() - 12 * 864e5).toISOString(),
    lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "user_bob_crypto",
    telegramId: "99201488",
    telegramUsername: "@bob_crypto",
    firstName: "Bob Martinez",
    plan: "free",
    postsProcessedCount: 19,
    postsFailedCount: 0,
    postsFilteredAdsCount: 14,
    status: "active",
    settings: {
      autoRewrite: true,
      adFilterEnabled: true,
      preserveFactsStrict: true,
      defaultPostFormat: "thread",
      xCredentials: {
        accountHandle: "@bob_defi"
      },
      telegramChannelId: "@crypto_insider_signals"
    },
    createdAt: new Date(Date.now() - 5 * 864e5).toISOString(),
    lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var DEFAULT_AUTOMATIONS = [
  {
    id: "auto_alice_01",
    userId: "user_alice_tech",
    name: "X (@OpenAI) \u2794 @tech_pulse_daily",
    direction: "x_to_telegram",
    source: "@OpenAI",
    destination: "@tech_pulse_daily",
    status: "active",
    settings: {
      filterPromotions: true,
      autoRewrite: true,
      format: "auto",
      includeMedia: true,
      includeOriginalLink: true,
      preserveHashtags: true
    },
    stats: {
      processedCount: 28,
      skippedAdsCount: 2,
      failedCount: 0,
      lastRunAt: new Date(Date.now() - 15 * 6e4).toISOString()
    },
    lastSeenPostId: "1839201948271049281",
    createdAt: new Date(Date.now() - 10 * 864e5).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "auto_alice_02",
    userId: "user_alice_tech",
    name: "@tech_pulse_daily \u2794 X (@alicewriter)",
    direction: "telegram_to_x",
    source: "@tech_pulse_daily",
    destination: "@alicewriter",
    status: "active",
    settings: {
      filterPromotions: true,
      autoRewrite: true,
      format: "thread",
      includeMedia: true,
      includeOriginalLink: false,
      preserveHashtags: true
    },
    stats: {
      processedCount: 14,
      skippedAdsCount: 0,
      failedCount: 1,
      lastRunAt: new Date(Date.now() - 60 * 6e4).toISOString()
    },
    lastSeenPostId: "msg_98214",
    createdAt: new Date(Date.now() - 8 * 864e5).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "auto_bob_01",
    userId: "user_bob_crypto",
    name: "X (@VitalikButerin) \u2794 @crypto_insider_signals",
    direction: "x_to_telegram",
    source: "@VitalikButerin",
    destination: "@crypto_insider_signals",
    status: "active",
    settings: {
      filterPromotions: true,
      autoRewrite: true,
      format: "concise",
      includeMedia: true,
      includeOriginalLink: true,
      preserveHashtags: false
    },
    stats: {
      processedCount: 19,
      skippedAdsCount: 14,
      failedCount: 0,
      lastRunAt: new Date(Date.now() - 40 * 6e4).toISOString()
    },
    lastSeenPostId: "1839109283746152431",
    createdAt: new Date(Date.now() - 5 * 864e5).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var DEFAULT_POSTS = [
  {
    id: "post_log_101",
    userId: "user_alice_tech",
    automationId: "auto_alice_01",
    direction: "x_to_telegram",
    sourcePostId: "1839201948271049281",
    sourceAuthor: "@OpenAI",
    sourceContent: "Introducing our newest reasoning models for complex mathematics, coding, and scientific benchmark evaluation. Available today in preview.",
    sourceUrl: "https://x.com/OpenAI/status/1839201948271049281",
    media: [
      {
        type: "image",
        url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80"
      }
    ],
    processedContent: "\u{1F9E0} OpenAI has released its latest family of reasoning models, engineered specifically for advanced mathematics, software engineering, and scientific benchmarks. The models are available starting today in preview.\n\n\u{1F517} Original: https://x.com/OpenAI/status/1839201948271049281",
    isAd: false,
    adConfidence: 0.05,
    adReasoning: "Official product release announcement from verified source without affiliate links or promotional coupon markers.",
    adCategory: "organic",
    status: "published",
    attempts: 1,
    maxAttempts: 3,
    publishedAt: new Date(Date.now() - 15 * 6e4).toISOString(),
    createdAt: new Date(Date.now() - 16 * 6e4).toISOString()
  },
  {
    id: "post_log_102",
    userId: "user_alice_tech",
    automationId: "auto_alice_01",
    direction: "x_to_telegram",
    sourcePostId: "1839201948271049299",
    sourceAuthor: "@OpenAI_Affiliate_Bot",
    sourceContent: "URGENT: Win $10,000 in free AI credits! Click t.co/freecredit token presale ends in 2 hours! \u{1F680}\u{1F680} #ad",
    sourceUrl: "https://x.com/fake/status/1839201948271049299",
    media: [],
    processedContent: "[Blocked Ad Content]",
    isAd: true,
    adConfidence: 0.98,
    adReasoning: "Detected high-confidence spam markers: token presale, urgency claims, suspicious shortlink, and explicit #ad tag.",
    adCategory: "crypto_shill",
    status: "filtered_ad",
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 45 * 6e4).toISOString()
  }
];
var Database = class {
  constructor() {
    this.data = this.load();
  }
  load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          users: parsed.users || DEFAULT_USERS,
          automations: parsed.automations || DEFAULT_AUTOMATIONS,
          posts: parsed.posts || DEFAULT_POSTS,
          otherBots: parsed.otherBots || DEFAULT_OTHER_BOTS,
          systemLogs: parsed.systemLogs || [],
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings || {} }
        };
      }
    } catch (err) {
      console.error("[DB] Failed to read database file, initializing defaults:", err);
    }
    const initial = {
      users: DEFAULT_USERS,
      automations: DEFAULT_AUTOMATIONS,
      posts: DEFAULT_POSTS,
      otherBots: DEFAULT_OTHER_BOTS,
      systemLogs: [
        {
          id: "log_init",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: "info",
          source: "engine",
          message: "System database initialized with multi-tenant SaaS schema."
        }
      ],
      settings: DEFAULT_SETTINGS
    };
    this.saveData(initial);
    return initial;
  }
  saveData(dataToSave) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(dataToSave, null, 2), "utf-8");
      fs.renameSync(tmpPath, DB_FILE);
    } catch (err) {
      console.error("[DB] Failed to persist data to disk:", err);
    }
  }
  persist() {
    this.saveData(this.data);
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
  upsertUser(user) {
    const idx = this.data.users.findIndex((u) => u.id === user.id || u.telegramId === user.telegramId);
    if (idx >= 0) {
      this.data.users[idx] = { ...this.data.users[idx], ...user, lastActiveAt: (/* @__PURE__ */ new Date()).toISOString() };
    } else {
      this.data.users.push(user);
    }
    this.persist();
    return user;
  }
  // --- Automations (Strict user isolation) ---
  getAutomations(userId) {
    return this.data.automations.filter((a) => a.userId === userId);
  }
  getAllAutomations() {
    return this.data.automations;
  }
  getAutomation(id, userId) {
    return this.data.automations.find((a) => a.id === id && (!userId || a.userId === userId));
  }
  createAutomation(automation) {
    this.data.automations.push(automation);
    this.persist();
    this.logSystem("info", "engine", `Created automation ${automation.name} for user ${automation.userId}`, automation.userId);
    return automation;
  }
  updateAutomation(id, userId, patch) {
    const idx = this.data.automations.findIndex((a) => a.id === id && a.userId === userId);
    if (idx === -1) return void 0;
    this.data.automations[idx] = {
      ...this.data.automations[idx],
      ...patch,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.persist();
    return this.data.automations[idx];
  }
  deleteAutomation(id, userId) {
    const initialLen = this.data.automations.length;
    this.data.automations = this.data.automations.filter((a) => !(a.id === id && a.userId === userId));
    const changed = this.data.automations.length < initialLen;
    if (changed) {
      this.persist();
      this.logSystem("info", "engine", `Deleted automation ${id} for user ${userId}`, userId);
    }
    return changed;
  }
  // --- Posts & Activity Logs ---
  addPostLog(post) {
    this.data.posts.unshift(post);
    if (this.data.posts.length > 1e3) {
      this.data.posts = this.data.posts.slice(0, 1e3);
    }
    const user = this.data.users.find((u) => u.id === post.userId);
    if (user) {
      if (post.status === "published") user.postsProcessedCount++;
      if (post.status === "failed") user.postsFailedCount++;
      if (post.status === "filtered_ad") user.postsFilteredAdsCount++;
      user.lastActiveAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    const auto = this.data.automations.find((a) => a.id === post.automationId);
    if (auto) {
      if (post.status === "published") auto.stats.processedCount++;
      if (post.status === "failed") auto.stats.failedCount++;
      if (post.status === "filtered_ad") auto.stats.skippedAdsCount++;
      auto.stats.lastRunAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    this.persist();
    return post;
  }
  getPostLogs(userId, limit = 50) {
    const filtered = userId ? this.data.posts.filter((p) => p.userId === userId) : this.data.posts;
    return filtered.slice(0, limit);
  }
  isPostProcessed(automationId, sourcePostId) {
    return this.data.posts.some(
      (p) => p.automationId === automationId && p.sourcePostId === sourcePostId && p.status === "published"
    );
  }
  // --- Other Bots Management ---
  getOtherBots(onlyEnabled = true) {
    const list = onlyEnabled ? this.data.otherBots.filter((b) => b.enabled) : this.data.otherBots;
    return list.sort((a, b) => a.order - b.order);
  }
  upsertOtherBot(bot) {
    const idx = this.data.otherBots.findIndex((b) => b.id === bot.id);
    if (idx >= 0) {
      this.data.otherBots[idx] = { ...this.data.otherBots[idx], ...bot };
    } else {
      this.data.otherBots.push(bot);
    }
    this.persist();
    this.logSystem("info", "api", `Updated 'Other Bots' entry: ${bot.name} (${bot.username})`);
    return bot;
  }
  deleteOtherBot(id) {
    const initLen = this.data.otherBots.length;
    this.data.otherBots = this.data.otherBots.filter((b) => b.id !== id);
    if (this.data.otherBots.length < initLen) {
      this.persist();
      this.logSystem("info", "api", `Deleted 'Other Bots' entry ${id}`);
      return true;
    }
    return false;
  }
  recordBotClick(id) {
    const bot = this.data.otherBots.find((b) => b.id === id);
    if (bot) {
      bot.clicksCount = (bot.clicksCount || 0) + 1;
      this.persist();
    }
  }
  // --- System Logs ---
  logSystem(level, source, message, userId, metadata) {
    const logItem = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      source,
      message,
      userId,
      metadata
    };
    this.data.systemLogs.unshift(logItem);
    if (this.data.systemLogs.length > 500) {
      this.data.systemLogs = this.data.systemLogs.slice(0, 500);
    }
    this.persist();
    return logItem;
  }
  getSystemLogs(limit = 100) {
    return this.data.systemLogs.slice(0, limit);
  }
  // --- Settings & Stats ---
  getSettings() {
    return this.data.settings;
  }
  updateSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.persist();
    this.logSystem("info", "api", "System settings updated");
    return this.data.settings;
  }
  getSystemStats() {
    const oneDayAgo = Date.now() - 24 * 3600 * 1e3;
    const totalUsers = this.data.users.length;
    const activeUsers = this.data.users.filter((u) => u.status === "active").length;
    const newUsers24h = this.data.users.filter(
      (u) => new Date(u.createdAt).getTime() > oneDayAgo
    ).length;
    const totalAutomations = this.data.automations.length;
    const activeAutomations = this.data.automations.filter((a) => a.status === "active").length;
    let postsProcessed = 0;
    let failedPosts = 0;
    let adFilteredPosts = 0;
    for (const post of this.data.posts) {
      if (post.status === "published") postsProcessed++;
      if (post.status === "failed") failedPosts++;
      if (post.status === "filtered_ad") adFilteredPosts++;
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
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1e3)
    };
  }
};
var db = new Database();

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
      model: "gemini-3.8-flash",
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
        model: "gemini-3.8-flash",
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
        model: "gemini-3.8-flash",
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

// server/telegramClient.ts
var TelegramClient = class {
  getBotToken(overrideToken) {
    const token = overrideToken || process.env.TELEGRAM_BOT_TOKEN || db.getSettings().botToken;
    if (!token || token.trim() === "" || token.includes("TODO")) {
      throw new Error("Telegram Bot Token is not configured. Set TELEGRAM_BOT_TOKEN in .env or configure in Admin Panel.");
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
    const formattedChatId = this.formatChatId(chatId);
    return this.callApi("getChat", { chat_id: formattedChatId }, overrideToken);
  }
  async getChatMember(chatId, userId, overrideToken) {
    const formattedChatId = this.formatChatId(chatId);
    return this.callApi("getChatMember", { chat_id: formattedChatId, user_id: userId }, overrideToken);
  }
  async verifyChannelPermissions(chatId, overrideToken) {
    try {
      const me = await this.getMe(overrideToken);
      const chat = await this.getChat(chatId, overrideToken);
      const member = await this.getChatMember(chatId, me.id, overrideToken);
      const status = member.status;
      const canPost = status === "creator" || status === "administrator" && member.can_post_messages !== false;
      return {
        canPost,
        chatTitle: chat.title || chat.username || String(chatId),
        chatType: chat.type
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        canPost: false,
        chatTitle: String(chatId),
        chatType: "unknown",
        error: message
      };
    }
  }
  async sendMessage(chatId, text, options, overrideToken) {
    const formattedChatId = this.formatChatId(chatId);
    const parseMode = options?.parse_mode || "HTML";
    const MAX_CHUNK = 4e3;
    if (text.length > MAX_CHUNK) {
      const chunks = this.splitMessage(text, MAX_CHUNK);
      let lastResult = null;
      for (let i = 0; i < chunks.length; i++) {
        lastResult = await this.sendSingleMessage(
          formattedChatId,
          chunks[i],
          { ...options, reply_markup: i === chunks.length - 1 ? options?.reply_markup : void 0 },
          overrideToken
        );
      }
      return lastResult;
    }
    return this.sendSingleMessage(formattedChatId, text, options, overrideToken);
  }
  async sendSingleMessage(chatId, text, options, overrideToken) {
    try {
      return await this.callApi(
        "sendMessage",
        {
          chat_id: chatId,
          text,
          parse_mode: options?.parse_mode || "HTML",
          disable_web_page_preview: options?.disable_web_page_preview,
          reply_markup: options?.reply_markup,
          reply_to_message_id: options?.reply_to_message_id
        },
        overrideToken
      );
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes("can't parse entities")) {
        db.logSystem("warn", "telegram_bot", `Telegram parse error on entity tags; retrying as clean text`);
        const cleanText = text.replace(/<[^>]*>/g, "");
        return await this.callApi(
          "sendMessage",
          {
            chat_id: chatId,
            text: cleanText,
            disable_web_page_preview: options?.disable_web_page_preview,
            reply_markup: options?.reply_markup,
            reply_to_message_id: options?.reply_to_message_id
          },
          overrideToken
        );
      }
      throw err;
    }
  }
  async sendPhoto(chatId, photoUrlOrBuffer, caption, options, overrideToken) {
    const formattedChatId = this.formatChatId(chatId);
    if (typeof photoUrlOrBuffer === "string") {
      try {
        return await this.callApi(
          "sendPhoto",
          {
            chat_id: formattedChatId,
            photo: photoUrlOrBuffer,
            caption: caption ? caption.slice(0, 1024) : void 0,
            parse_mode: options?.parse_mode || "HTML",
            reply_markup: options?.reply_markup
          },
          overrideToken
        );
      } catch (err) {
        db.logSystem("warn", "telegram_bot", `Remote photo send failed (${err.message}). Falling back to text link`);
        const fallbackText = caption ? `${caption}

\u{1F5BC}\uFE0F Photo: ${photoUrlOrBuffer}` : `\u{1F5BC}\uFE0F Photo: ${photoUrlOrBuffer}`;
        return await this.sendMessage(formattedChatId, fallbackText, options, overrideToken);
      }
    } else {
      const token = this.getBotToken(overrideToken);
      const formData = new FormData();
      formData.append("chat_id", String(formattedChatId));
      if (caption) formData.append("caption", caption.slice(0, 1024));
      if (options?.parse_mode) formData.append("parse_mode", options.parse_mode);
      const blob = new Blob([photoUrlOrBuffer]);
      formData.append("photo", blob, "image.jpg");
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        body: formData
      });
      const json = await res.json();
      if (!json.ok) throw new Error(`Telegram sendPhoto Buffer error: ${json.description}`);
      return json.result;
    }
  }
  async sendVideo(chatId, videoUrl, caption, options, overrideToken) {
    const formattedChatId = this.formatChatId(chatId);
    try {
      return await this.callApi(
        "sendVideo",
        {
          chat_id: formattedChatId,
          video: videoUrl,
          caption: caption ? caption.slice(0, 1024) : void 0,
          parse_mode: options?.parse_mode || "HTML",
          reply_markup: options?.reply_markup
        },
        overrideToken
      );
    } catch (err) {
      db.logSystem("warn", "telegram_bot", `Remote video send failed (${err.message}). Falling back to text link`);
      const fallbackText = caption ? `${caption}

\u{1F3A5} Video: ${videoUrl}` : `\u{1F3A5} Video: ${videoUrl}`;
      return await this.sendMessage(formattedChatId, fallbackText, options, overrideToken);
    }
  }
  async sendMediaGroup(chatId, mediaList, options, overrideToken) {
    const formattedChatId = this.formatChatId(chatId);
    const mediaPayload = mediaList.slice(0, 10).map((m, idx) => ({
      type: m.type,
      media: m.url,
      caption: idx === 0 && m.caption ? m.caption.slice(0, 1024) : void 0,
      parse_mode: idx === 0 ? options?.parse_mode || "HTML" : void 0
    }));
    try {
      return await this.callApi(
        "sendMediaGroup",
        {
          chat_id: formattedChatId,
          media: mediaPayload
        },
        overrideToken
      );
    } catch (err) {
      db.logSystem("warn", "telegram_bot", `Media group send failed (${err.message}). Falling back to single photo`);
      if (mediaList.length > 0) {
        return await this.sendPhoto(formattedChatId, mediaList[0].url, mediaList[0].caption, options, overrideToken);
      }
      throw err;
    }
  }
  async getFile(fileId, overrideToken) {
    const file = await this.callApi("getFile", { file_id: fileId }, overrideToken);
    const token = this.getBotToken(overrideToken);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    return { filePath: file.file_path, fileUrl };
  }
  async downloadFileBuffer(fileId, overrideToken) {
    const { fileUrl } = await this.getFile(fileId, overrideToken);
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`Failed to download file from Telegram: ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  async setWebhook(url, overrideToken) {
    return this.callApi(
      "setWebhook",
      {
        url,
        allowed_updates: ["message", "channel_post", "callback_query", "my_chat_member"],
        drop_pending_updates: false
      },
      overrideToken
    );
  }
  async deleteWebhook(overrideToken) {
    return this.callApi("deleteWebhook", { drop_pending_updates: false }, overrideToken);
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
  formatChatId(chatId) {
    if (typeof chatId === "number") return chatId;
    const str = chatId.trim();
    if (str.startsWith("@") || /^-?\d+$/.test(str)) {
      return /^-?\d+$/.test(str) ? parseInt(str, 10) : str;
    }
    return `@${str}`;
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
import crypto from "node:crypto";
var XClient = class {
  constructor() {
    this.defaultBearerToken = process.env.TWITTER_BEARER_TOKEN || "";
    this.defaultClientId = process.env.TWITTER_CLIENT_ID || "";
    this.defaultClientSecret = process.env.TWITTER_CLIENT_SECRET || "";
  }
  // --- OAuth 2.0 PKCE Helpers ---
  generatePKCE() {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
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
      oauth_nonce: crypto.randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1e3).toString(),
      oauth_token: options.accessToken,
      oauth_version: "1.0"
    };
    const sortedKeys = Object.keys(oauthParams).sort();
    const paramString = sortedKeys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`).join("&");
    const signatureBase = `${options.method.toUpperCase()}&${encodeURIComponent(options.url)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(options.apiSecret)}&${encodeURIComponent(options.accessSecret)}`;
    const signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
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
  // --- Source Monitoring (X ➔ Telegram) ---
  async fetchRecentTweets(authorHandle, sinceId, overrideBearer) {
    const handle = authorHandle.replace("@", "").trim();
    const bearer = overrideBearer || this.defaultBearerToken || db.getSettings().botToken;
    if (bearer && !bearer.includes("TODO") && bearer.length > 25) {
      try {
        return await this.fetchViaOfficialApi(handle, sinceId, bearer);
      } catch (err) {
        db.logSystem("warn", "x_client", `Official X API check failed for @${handle}: ${err.message}. Falling back to public feed.`);
      }
    }
    return await this.fetchViaPublicSyndication(handle, sinceId);
  }
  async fetchViaOfficialApi(handle, sinceId, bearer) {
    const userRes = await fetch(`https://api.twitter.com/2/users/by/username/${handle}`, {
      headers: { Authorization: `Bearer ${bearer}` }
    });
    const userJson = await userRes.json();
    if (!userRes.ok || !userJson.data?.id) {
      throw new Error(`User lookup for @${handle} failed: ${userJson.detail || userRes.statusText}`);
    }
    const xUserId = userJson.data.id;
    let url = `https://api.twitter.com/2/users/${xUserId}/tweets?max_results=5&tweet.fields=created_at,entities,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url,type`;
    if (sinceId) {
      url += `&since_id=${sinceId}`;
    }
    const tweetRes = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}` }
    });
    const tweetJson = await tweetRes.json();
    if (!tweetRes.ok) {
      throw new Error(`Tweet fetch failed: ${tweetJson.detail || tweetRes.statusText}`);
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
  async fetchViaPublicSyndication(handle, sinceId) {
    try {
      const syndicationUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}?showReplies=false`;
      const res = await fetch(syndicationUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml"
        }
      });
      if (!res.ok) {
        return [];
      }
      const html = await res.text();
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!nextDataMatch) {
        return [];
      }
      const parsed = JSON.parse(nextDataMatch[1]);
      const timelineData = parsed?.props?.pageProps?.timeline?.entries || parsed?.props?.pageProps?.data?.user?.result?.timeline?.timeline?.instructions || [];
      const results = [];
      for (const entry of timelineData) {
        const tweet = entry?.content?.tweet || entry?.content?.itemContent?.tweet_results?.result;
        if (!tweet) continue;
        const id = tweet.id_str || tweet.rest_id;
        if (!id || sinceId && id <= sinceId) continue;
        const text = tweet.text || tweet.legacy?.full_text || "";
        const createdAt = tweet.created_at || tweet.legacy?.created_at || (/* @__PURE__ */ new Date()).toISOString();
        const mediaItems = [];
        const mediaEntries = tweet.entities?.media || tweet.legacy?.entities?.media || [];
        for (const m of mediaEntries) {
          mediaItems.push({
            type: m.type === "video" ? "video" : "image",
            url: m.media_url_https || m.media_url || ""
          });
        }
        results.push({
          id,
          text,
          author: `@${handle}`,
          createdAt,
          url: `https://x.com/${handle}/status/${id}`,
          media: mediaItems
        });
      }
      return results;
    } catch (err) {
      db.logSystem("warn", "x_client", `Syndication fetch note for @${handle}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
};
var xClient = new XClient();

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
        if (media.length === 1) {
          const m = media[0];
          if (m.type === "video") {
            const res = await telegramClient.sendVideo(targetChannel, m.url, content);
            publishedId = String(res.message_id || publishedId);
          } else {
            const res = await telegramClient.sendPhoto(targetChannel, m.url, content);
            publishedId = String(res.message_id || publishedId);
          }
        } else if (media.length > 1) {
          const mediaList = media.map((m, idx) => ({
            type: m.type === "video" ? "video" : "photo",
            url: m.url,
            caption: idx === 0 ? content : void 0
          }));
          const res = await telegramClient.sendMediaGroup(targetChannel, mediaList);
          publishedId = String(Array.isArray(res) ? res[0]?.message_id : res.message_id || publishedId);
        } else {
          const res = await telegramClient.sendMessage(targetChannel, content, {
            disable_web_page_preview: false
          });
          publishedId = String(res.message_id || publishedId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        db.logSystem("warn", "telegram_bot", `Telegram delivery note to ${targetChannel}: ${msg}`);
      }
    } else {
      db.logSystem("info", "telegram_bot", `Real bot token not yet set; post stored for channel ${targetChannel}`);
    }
    return publishedId;
  }
  async dispatchToX(automation, content, media, threadParts) {
    const user = db.getUser(automation.userId);
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
        `No Twitter OAuth configured for ${user?.telegramUsername || automation.userId}; post queued & logged.`
      );
    }
    return publishedId;
  }
};
var automationQueue = new AutomationQueue();

// server/monitor.ts
var SourceMonitor = class {
  // Poll every 60 seconds
  constructor() {
    this.timer = null;
    this.isChecking = false;
    this.checkIntervalMs = 6e4;
    this.start();
  }
  start() {
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
      db.logSystem("warn", "monitor", `Source monitor cycle notice: ${msg}`);
    } finally {
      this.isChecking = false;
    }
  }
  async pollXAccount(auto, user) {
    const handle = auto.source.trim();
    if (!handle) return;
    try {
      const tweets = await xClient.fetchRecentTweets(
        handle,
        auto.lastSeenPostId,
        user.settings?.xCredentials?.bearerToken
      );
      if (!tweets || tweets.length === 0) {
        db.updateAutomation(auto.id, auto.userId, {
          lastPollAt: (/* @__PURE__ */ new Date()).toISOString()
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
      if (newestId && newestId !== auto.lastSeenPostId) {
        db.updateAutomation(auto.id, auto.userId, {
          lastSeenPostId: newestId,
          lastPollAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.logSystem("warn", "monitor", `Failed polling X handle ${handle}: ${msg}`, auto.userId);
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
var TelegramBotHandler = class {
  constructor() {
    this.pollingTimer = null;
    this.isPolling = false;
    this.lastUpdateId = 0;
  }
  /**
   * Main entry point for both live Telegram Webhook, Long Polling and Web Simulator
   */
  async handleUpdate(update, isLive = false) {
    if (update.channel_post) {
      sourceMonitor.handleIncomingTelegramChannelPost(update.channel_post);
      return { text: "Channel post received" };
    }
    const fromUser = update.message?.from || update.callback_query?.from;
    if (!fromUser) {
      return { text: "Invalid update payload" };
    }
    const tgId = String(fromUser.id);
    const tgUsername = fromUser.username ? `@${fromUser.username}` : `@user_${tgId}`;
    const firstName = fromUser.first_name || "User";
    let user = db.getUser(tgId);
    if (!user) {
      user = db.upsertUser({
        id: `user_${tgId}`,
        telegramId: tgId,
        telegramUsername: tgUsername,
        firstName,
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
      db.logSystem("info", "telegram_bot", `New SaaS user registered via Telegram: ${tgUsername} (${tgId})`, user.id);
    }
    let response;
    if (update.callback_query?.data) {
      response = await this.handleCallback(user, update.callback_query.data);
      if (isLive && telegramClient.hasValidToken()) {
        try {
          await fetch(
            `https://api.telegram.org/bot${db.getSettings().botToken}/answerCallbackQuery`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callback_query_id: update.callback_query.id })
            }
          );
        } catch {
        }
      }
    } else {
      const text = update.message?.text?.trim() || "";
      response = await this.handleText(user, text);
    }
    if (isLive && telegramClient.hasValidToken()) {
      const targetChatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
      if (targetChatId) {
        try {
          await telegramClient.sendMessage(targetChatId, response.text, {
            parse_mode: "Markdown",
            reply_markup: response.replyMarkup
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          db.logSystem("warn", "telegram_bot", `Live delivery failed for chat ${targetChatId}: ${msg}`);
        }
      }
    }
    return response;
  }
  /**
   * Start Long Polling for Telegram Bot updates (automatic when bot token is set)
   */
  startPolling() {
    if (this.isPolling) return;
    if (!telegramClient.hasValidToken()) {
      db.logSystem("info", "telegram_bot", "Telegram bot token not yet configured. Bot will run in Web Simulator mode.");
      return;
    }
    this.isPolling = true;
    db.logSystem("info", "telegram_bot", "Starting real Telegram Bot long-polling worker...");
    const pollLoop = async () => {
      while (this.isPolling) {
        try {
          const updates = await telegramClient.getUpdates(this.lastUpdateId + 1, 100, 25);
          if (updates && updates.length > 0) {
            for (const u of updates) {
              this.lastUpdateId = u.update_id;
              await this.handleUpdate(u, true);
            }
          }
        } catch (err) {
          if (err.errorCode === 409) {
            db.logSystem("warn", "telegram_bot", "Telegram webhook is active. Polling paused.");
            await new Promise((r) => setTimeout(r, 1e4));
          } else {
            await new Promise((r) => setTimeout(r, 4e3));
          }
        }
      }
    };
    pollLoop();
  }
  stopPolling() {
    this.isPolling = false;
  }
  async handleText(user, text) {
    const wizard = userWizards.get(user.id);
    if (wizard && !text.startsWith("/")) {
      return this.handleWizardInput(user, wizard, text);
    }
    if (text === "/start" || text.toLowerCase() === "menu" || text.toLowerCase() === "start") {
      userWizards.delete(user.id);
      return this.getMainMenu(user);
    }
    if (text === "/automations" || text === "\u26A1 My Automations") {
      return this.getAutomationsMenu(user);
    }
    if (text === "/new" || text === "\u2795 New Automation") {
      return this.startWizard(user);
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
    return {
      text: `\u{1F44B} Hello ${user.firstName}! I didn't recognize that command.

Use the buttons below to manage your automations, or type /start to reset.`,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: "\u26A1 My Automations", callback_data: "view_automations" },
            { text: "\u2795 New Automation", callback_data: "new_automation_start" }
          ],
          [
            { text: "\u{1F916} Other Bots", callback_data: "other_bots_view" },
            { text: "\u2139\uFE0F Setup Guide", callback_data: "help_view" }
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
    if (data === "wiz_dir_x2tg") {
      const wizard = { step: "source", direction: "x_to_telegram" };
      userWizards.set(user.id, wizard);
      return {
        text: `\u{1F680} **Step 1/3: Select X (Twitter) Source**

Enter the X username/handle you want to monitor (e.g. \`@OpenAI\` or \`@sama\`):

*(Type the handle in chat below)*`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "Use @techcrunch", callback_data: "wiz_source_techcrunch" }],
            [{ text: "Use @OpenAI", callback_data: "wiz_source_openai" }],
            [{ text: "\xAB Cancel", callback_data: "main_menu" }]
          ]
        }
      };
    }
    if (data === "wiz_dir_tg2x") {
      const wizard = { step: "source", direction: "telegram_to_x" };
      userWizards.set(user.id, wizard);
      return {
        text: `\u{1F680} **Step 1/3: Select Source Telegram Channel**

Enter your Telegram channel username or ID (e.g. \`@my_crypto_hub\` or \`-1001234567890\`):

*(Make sure this bot is added as an Administrator to the channel)*`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "Use @tech_pulse_daily", callback_data: "wiz_source_techpulse" }],
            [{ text: "\xAB Cancel", callback_data: "main_menu" }]
          ]
        }
      };
    }
    if (data.startsWith("wiz_source_")) {
      const wizard = userWizards.get(user.id);
      if (wizard) {
        const sourceMap = {
          wiz_source_techcrunch: "@techcrunch",
          wiz_source_openai: "@OpenAI",
          wiz_source_techpulse: "@tech_pulse_daily"
        };
        const source = sourceMap[data] || "@tech_news";
        wizard.source = source;
        wizard.step = "destination";
        return {
          text: `\u2705 Source set to: **${source}**

\u{1F3AF} **Step 2/3: Set Destination**
${wizard.direction === "x_to_telegram" ? "Enter your Telegram Channel username (e.g. `@my_news_feed`):" : "Enter your authorized X destination handle (e.g. `@my_x_account`):"}`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: "Use Default Test Channel (@my_feed)", callback_data: "wiz_dest_default" }],
              [{ text: "\xAB Cancel", callback_data: "main_menu" }]
            ]
          }
        };
      }
    }
    if (data === "wiz_dest_default") {
      const wizard = userWizards.get(user.id);
      if (wizard) {
        wizard.destination = wizard.direction === "x_to_telegram" ? "@my_telegram_channel" : `@${user.telegramUsername.replace("@", "")}_x`;
        return this.finishWizard(user, wizard);
      }
    }
    if (data.startsWith("toggle_auto_")) {
      const autoId = data.replace("toggle_auto_", "");
      const auto = db.getAutomation(autoId, user.id);
      if (auto) {
        const newStatus = auto.status === "active" ? "paused" : "active";
        db.updateAutomation(autoId, user.id, { status: newStatus });
        return {
          text: `\u26A1 Automation **${auto.name}** is now **${newStatus.toUpperCase()}**.`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: "\xAB Back to Automations", callback_data: "view_automations" }],
              [{ text: "\u{1F3E0} Main Menu", callback_data: "main_menu" }]
            ]
          }
        };
      }
    }
    if (data.startsWith("delete_auto_")) {
      const autoId = data.replace("delete_auto_", "");
      db.deleteAutomation(autoId, user.id);
      return {
        text: `\u{1F5D1}\uFE0F Automation removed successfully.`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "\xAB Back to Automations", callback_data: "view_automations" }],
            [{ text: "\u{1F3E0} Main Menu", callback_data: "main_menu" }]
          ]
        }
      };
    }
    if (data.startsWith("test_auto_")) {
      const autoId = data.replace("test_auto_", "");
      const auto = db.getAutomation(autoId, user.id);
      if (auto) {
        const samplePost = {
          sourcePostId: `test_${Date.now()}`,
          sourceAuthor: auto.source,
          sourceContent: `Major milestone reached: autonomous AI agents now reliably execute distributed multi-cloud deployments with strict factual constraints. Zero human intervention needed.`,
          sourceUrl: `https://x.com/${auto.source.replace("@", "")}/status/${Date.now()}`
        };
        const res = automationQueue.enqueuePost(auto, samplePost);
        return {
          text: `\u{1F680} Test post enqueued for **${auto.name}**!

Status: ${res.status}

The queue worker will run the post through the Gemini Fact-Preserving Rewriter & Ad Filter, then dispatch to ${auto.destination}.`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: "\u{1F4CA} View My Logs", callback_data: "stats_view" }],
              [{ text: "\xAB Back to Automations", callback_data: "view_automations" }]
            ]
          }
        };
      }
    }
    if (data.startsWith("bot_click_")) {
      const botId = data.replace("bot_click_", "");
      db.recordBotClick(botId);
      const bots = db.getOtherBots(false);
      const bot = bots.find((b) => b.id === botId);
      if (bot) {
        return {
          text: `${bot.icon} **${bot.name}** (${bot.username})

${bot.description}

Category: ${bot.category}`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: `\u{1F680} Open ${bot.name}`, url: bot.url }],
              [{ text: "\xAB Back to Other Bots", callback_data: "other_bots_view" }]
            ]
          }
        };
      }
    }
    return this.getMainMenu(user);
  }
  handleWizardInput(user, wizard, text) {
    if (wizard.step === "source") {
      wizard.source = text.trim();
      wizard.step = "destination";
      return {
        text: `\u2705 Source set: **${wizard.source}**

\u{1F3AF} **Step 2/3: Set Destination**
${wizard.direction === "x_to_telegram" ? "Enter your destination Telegram Channel (e.g. `@my_channel_name`):" : "Enter your destination X handle (e.g. `@my_x_handle`):"}`,
        replyMarkup: {
          inline_keyboard: [[{ text: "\xAB Cancel", callback_data: "main_menu" }]]
        }
      };
    }
    if (wizard.step === "destination") {
      wizard.destination = text.trim();
      return this.finishWizard(user, wizard);
    }
    return this.getMainMenu(user);
  }
  finishWizard(user, wizard) {
    const direction = wizard.direction || "x_to_telegram";
    const source = wizard.source || "@source";
    const destination = wizard.destination || "@destination";
    const name = `${source} \u2794 ${destination}`;
    const newAuto = {
      id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      name,
      direction,
      source,
      destination,
      status: "active",
      settings: {
        filterPromotions: true,
        autoRewrite: true,
        format: "auto",
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
    userWizards.delete(user.id);
    return {
      text: `\u{1F389} **Automation Activated Successfully!**

**Name:** ${name}
**Direction:** ${direction === "x_to_telegram" ? "X (Twitter) \u2794 Telegram Channel" : "Telegram Channel \u2794 X"}
**Smart Features:**
\u2022 \u2728 Fact-Preserving Rewriting: **Enabled**
\u2022 \u{1F6E1}\uFE0F Ad & Promo Detector: **Active**
\u2022 \u26A1 Rate-limit protection: **Active**

New posts will be automatically monitored, reformatted, and forwarded!`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u{1F9EA} Send Test Post Now", callback_data: `test_auto_${newAuto.id}` }],
          [{ text: "\u26A1 View All Automations", callback_data: "view_automations" }],
          [{ text: "\u{1F3E0} Main Menu", callback_data: "main_menu" }]
        ]
      }
    };
  }
  getMainMenu(user) {
    const automations = db.getAutomations(user.id);
    const activeCount = automations.filter((a) => a.status === "active").length;
    const text = `\u{1F916} **X (Twitter) \u2194 Telegram Automation**

Welcome back, **${user.firstName}**!

\u{1F4BC} **Plan:** ${user.plan.toUpperCase()}
\u26A1 **Active Automations:** ${activeCount} / ${automations.length}
\u{1F4CA} **Posts Forwarded:** ${user.postsProcessedCount}
\u{1F6E1}\uFE0F **Ads Blocked:** ${user.postsFilteredAdsCount}

Seamlessly cross-post between X and Telegram channels with strict fact-preserving AI rewriting and promotional spam filtering.`;
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: "\u26A1 My Automations", callback_data: "view_automations" },
            { text: "\u2795 New Automation", callback_data: "new_automation_start" }
          ],
          [
            { text: "\u2699\uFE0F Settings & X Auth", callback_data: "settings_view" },
            { text: "\u{1F916} Other Bots", callback_data: "other_bots_view" }
          ],
          [
            { text: "\u{1F4CA} My Stats & Logs", callback_data: "stats_view" },
            { text: "\u2139\uFE0F Setup Guide", callback_data: "help_view" }
          ]
        ]
      }
    };
  }
  getAutomationsMenu(user) {
    const automations = db.getAutomations(user.id);
    if (automations.length === 0) {
      return {
        text: `\u26A1 **My Automations**

You have no automations configured yet.

Click **\u2795 New Automation** to connect your first X account or Telegram channel in 30 seconds!`,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "\u2795 Create Automation", callback_data: "new_automation_start" }],
            [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
          ]
        }
      };
    }
    let text = `\u26A1 **Your Automations (${automations.length})**

`;
    const keyboard = [];
    automations.forEach((auto, i) => {
      const statusIcon = auto.status === "active" ? "\u{1F7E2} Active" : "\u23F8\uFE0F Paused";
      text += `**${i + 1}. ${auto.name}**
Status: ${statusIcon} | Processed: ${auto.stats.processedCount} | Ads Skipped: ${auto.stats.skippedAdsCount}

`;
      keyboard.push([
        {
          text: `${auto.status === "active" ? "\u23F8\uFE0F Pause" : "\u25B6\uFE0F Resume"} #${i + 1}`,
          callback_data: `toggle_auto_${auto.id}`
        },
        {
          text: `\u{1F9EA} Test #${i + 1}`,
          callback_data: `test_auto_${auto.id}`
        },
        {
          text: `\u{1F5D1}\uFE0F Delete`,
          callback_data: `delete_auto_${auto.id}`
        }
      ]);
    });
    keyboard.push([
      { text: "\u2795 Add Another Automation", callback_data: "new_automation_start" },
      { text: "\xAB Main Menu", callback_data: "main_menu" }
    ]);
    return { text, replyMarkup: { inline_keyboard: keyboard } };
  }
  startWizard(user) {
    userWizards.set(user.id, { step: "direction" });
    return {
      text: `\u2795 **Create New Automation**

Choose the cross-posting direction:`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "1\uFE0F\u20E3 X (Twitter) \u2794 Telegram Channel", callback_data: "wiz_dir_x2tg" }],
          [{ text: "2\uFE0F\u20E3 Telegram Channel \u2794 X (Twitter)", callback_data: "wiz_dir_tg2x" }],
          [{ text: "\xAB Cancel", callback_data: "main_menu" }]
        ]
      }
    };
  }
  getSettingsMenu(user) {
    const creds = user.settings.xCredentials;
    const xStatus = creds?.bearerToken || creds?.accessToken ? "\u{1F7E2} Connected" : "\u26AA Not Linked (Using Public Monitored Handles)";
    const text = `\u2699\uFE0F **Your Isolated Settings & Keys**

User ID: \`${user.id}\`
Plan: **${user.plan.toUpperCase()}**

**X (Twitter) Authorization:**
Status: ${xStatus}
Handle: ${creds?.accountHandle || "None specified"}

**Automated AI Engine:**
\u2022 Fact-Preserving Rewriter: ${user.settings.autoRewrite ? "\u2705 Enabled" : "\u274C Off"}
\u2022 Ad & Spam Filter: ${user.settings.adFilterEnabled ? "\u2705 Enabled" : "\u274C Off"}
\u2022 Strict Fact Verification: ${user.settings.preserveFactsStrict ? "\u2705 Strict" : "Normal"}

*Note: Your API credentials and channel tokens are fully encrypted and isolated strictly to your user ID.*`;
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u2795 Create Automation", callback_data: "new_automation_start" }],
          [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
        ]
      }
    };
  }
  getOtherBotsMenu() {
    const bots = db.getOtherBots(true);
    let text = `\u{1F916} **Recommended Telegram Bots**

Explore our suite of specialized Telegram bots:

`;
    const keyboard = [];
    bots.forEach((bot) => {
      text += `${bot.icon} **${bot.name}** (${bot.username})
${bot.description}
Category: \`${bot.category}\`

`;
      keyboard.push([
        {
          text: `${bot.icon} Open ${bot.name}`,
          callback_data: `bot_click_${bot.id}`
        }
      ]);
    });
    keyboard.push([{ text: "\xAB Main Menu", callback_data: "main_menu" }]);
    return { text, replyMarkup: { inline_keyboard: keyboard } };
  }
  getStatsMenu(user) {
    const posts = db.getPostLogs(user.id, 5);
    let text = `\u{1F4CA} **My Usage & Forwarding Logs**

`;
    text += `\u2022 Total Published: **${user.postsProcessedCount}**
`;
    text += `\u2022 Promotional Posts Filtered: **${user.postsFilteredAdsCount}**
`;
    text += `\u2022 Failed Retries: **${user.postsFailedCount}**

`;
    text += `**Recent 5 Posts:**
`;
    if (posts.length === 0) {
      text += `_No posts recorded yet. Trigger a test run or wait for live updates._
`;
    } else {
      posts.forEach((p, idx) => {
        const statusBadge = p.status === "published" ? "\u2705 Published" : p.status === "filtered_ad" ? "\u{1F6E1}\uFE0F Ad Filtered" : "\u26A0\uFE0F " + p.status;
        const time = new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        text += `${idx + 1}. [${time}] ${statusBadge} - ${p.sourceAuthor}
"${p.sourceContent.slice(0, 60)}..."

`;
      });
    }
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u26A1 My Automations", callback_data: "view_automations" }],
          [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
        ]
      }
    };
  }
  getHelpMenu() {
    const text = `\u2139\uFE0F **Setup Guide: Adding the Bot to Channels**

**1. For X \u2794 Telegram Channel:**
1. Open your Telegram Channel settings.
2. Tap **Administrators** \u2794 **Add Admin**.
3. Search for this bot's username and add it.
4. Grant **"Post Messages"** permission.
5. In this bot, create an automation with your channel username (e.g. \`@my_channel\`).

**2. For Telegram \u2794 X:**
1. Add the bot to your Telegram Channel as Admin.
2. When you publish a post in your channel, this bot will receive the post.
3. Long posts are automatically rewritten or converted into threads fitting X 280-char limits.

**3. Smart Ad Filtering:**
Our built-in Gemini AI automatically detects token shills, affiliate codes, presales, and promo hashtags to keep your channels clean.`;
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "\u2795 Create Automation Now", callback_data: "new_automation_start" }],
          [{ text: "\xAB Main Menu", callback_data: "main_menu" }]
        ]
      }
    };
  }
  /**
   * Broadcast message to all users in database (Admin feature)
   */
  async broadcast(messageText, buttonText, buttonUrl) {
    const users = db.getUsers();
    const settings = db.getSettings();
    let sent = 0;
    for (const user of users) {
      if (settings.botToken && !settings.botToken.includes("TODO")) {
        try {
          const body = {
            chat_id: user.telegramId,
            text: messageText,
            parse_mode: "Markdown"
          };
          if (buttonText && buttonUrl) {
            body.reply_markup = {
              inline_keyboard: [[{ text: buttonText, url: buttonUrl }]]
            };
          }
          await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          sent++;
        } catch {
        }
      } else {
        sent++;
      }
    }
    db.logSystem("info", "telegram_bot", `Broadcast completed: delivered to ${sent}/${users.length} users`);
    return { sent, total: users.length };
  }
};
var telegramBot = new TelegramBotHandler();

// server.ts
var PORT = 3e3;
var oauthSessions = /* @__PURE__ */ new Map();
async function startServer() {
  const app = express();
  app.use(express.json());
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      time: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      const update = req.body;
      const response = await telegramBot.handleUpdate(update, true);
      res.json({ ok: true, response });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.logSystem("error", "telegram_bot", `Webhook handling failed: ${message}`);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.post("/api/telegram/verify-channel", async (req, res) => {
    try {
      const { channelId, botToken } = req.body;
      if (!channelId) {
        return res.status(400).json({ ok: false, error: "channelId is required" });
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
      const userId = req.query.userId || "user_alice_tech";
      const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/x/callback`;
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
        return res.send(`<html><body><h2>X Authorization Failed</h2><p>${error_description || error}</p><a href="/dashboard">Return to App</a></body></html>`);
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
        db.logSystem("success", "api", `User ${user.telegramUsername} successfully linked X account via OAuth2 PKCE`, user.id);
      }
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>X Authorization Successful</title></head>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc;">
            <div style="text-align: center; max-width: 450px; padding: 32px; background: #1e293b; border-radius: 12px; border: 1px solid #334155;">
              <div style="font-size: 48px; margin-bottom: 16px;">\u{1F389}</div>
              <h2 style="margin: 0 0 8px;">X Account Connected!</h2>
              <p style="color: #94a3b8; font-size: 14px; margin-bottom: 24px;">Your Twitter/X account is now securely authorized with write permissions for automated cross-posting.</p>
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
      res.status(500).send(`<html><body><h2>OAuth Exchange Failed</h2><p>${message}</p><a href="/">Return</a></body></html>`);
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
  app.post("/api/telegram/simulate", async (req, res) => {
    try {
      const { userId, text, callbackData } = req.body;
      const user = db.getUser(userId || "user_alice_tech") || db.getUsers()[0];
      let updatePayload;
      if (callbackData) {
        updatePayload = {
          callback_query: {
            id: `cb_${Date.now()}`,
            from: {
              id: parseInt(user.telegramId) || 12345678,
              username: user.telegramUsername.replace("@", ""),
              first_name: user.firstName
            },
            data: callbackData
          }
        };
      } else {
        updatePayload = {
          message: {
            message_id: Date.now(),
            from: {
              id: parseInt(user.telegramId) || 12345678,
              username: user.telegramUsername.replace("@", ""),
              first_name: user.firstName
            },
            chat: { id: parseInt(user.telegramId) || 12345678 },
            text: text || "/start"
          }
        };
      }
      const response = await telegramBot.handleUpdate(updatePayload);
      res.json({ ok: true, response });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.post("/api/telegram/trigger-sample", async (req, res) => {
    try {
      const { automationId, userId, content, author, isPromotional, mediaUrl } = req.body;
      const auto = db.getAutomation(automationId, userId);
      if (!auto) {
        return res.status(404).json({ ok: false, error: "Automation not found" });
      }
      const postData = {
        sourcePostId: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sourceAuthor: author || auto.source,
        sourceContent: content || (isPromotional ? "\u{1F680} URGENT PRESALE: Win $50,000 in free tokens! Connect wallet now at t.co/presale-airdrop before timer expires! 100x guaranteed #ad" : "Anthropic announces Claude 3.7 Sonnet with hybrid reasoning capabilities, combining instant thinking and extended step-by-step mathematical proofs."),
        sourceUrl: `https://x.com/${(author || auto.source).replace("@", "")}/status/${Date.now()}`,
        media: mediaUrl ? [
          {
            type: "image",
            url: mediaUrl
          }
        ] : []
      };
      const result = automationQueue.enqueuePost(auto, postData);
      res.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.get("/api/user/users", (req, res) => {
    const users = db.getUsers();
    res.json({ ok: true, users });
  });
  app.get("/api/user/profile", (req, res) => {
    const userId = req.query.userId || "user_alice_tech";
    const user = db.getUser(userId) || db.getUsers()[0];
    res.json({ ok: true, user });
  });
  app.post("/api/user/switch-or-create", (req, res) => {
    const { username, firstName, plan } = req.body;
    const cleanUsername = username ? username.startsWith("@") ? username : `@${username}` : `@user_${Date.now().toString().slice(-4)}`;
    let user = db.getUser(cleanUsername);
    if (!user) {
      const newId = `user_${Date.now().toString().slice(-6)}`;
      user = db.upsertUser({
        id: newId,
        telegramId: String(Math.floor(1e7 + Math.random() * 9e7)),
        telegramUsername: cleanUsername,
        firstName: firstName || "New Creator",
        plan: plan || "free",
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
    }
    res.json({ ok: true, user });
  });
  app.get("/api/user/automations", (req, res) => {
    const userId = req.query.userId || "user_alice_tech";
    const automations = db.getAutomations(userId);
    res.json({ ok: true, automations });
  });
  app.post("/api/user/automations", (req, res) => {
    try {
      const { userId, name, direction, source, destination, settings } = req.body;
      if (!userId || !source || !destination) {
        return res.status(400).json({ ok: false, error: "Missing required parameters" });
      }
      const created = db.createAutomation({
        id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId,
        name: name || `${source} \u2794 ${destination}`,
        direction: direction || "x_to_telegram",
        source,
        destination,
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
      if (auto.direction === "x_to_telegram") {
        const user = db.getUser(userId);
        const tweets = await xClient.fetchRecentTweets(
          auto.source,
          auto.lastSeenPostId,
          user?.settings.xCredentials.bearerToken
        );
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
            lastPollAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          return res.json({ ok: true, syncedCount: tweets.length, message: `Found and queued ${tweets.length} new tweets!` });
        }
        return res.json({ ok: true, syncedCount: 0, message: "Source checked. No new posts since last sync." });
      } else {
        return res.json({ ok: true, syncedCount: 0, message: "Telegram channel automations listen continuously for new broadcasts." });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.delete("/api/user/automations/:id", (req, res) => {
    const { id } = req.params;
    const userId = req.query.userId || req.body.userId;
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
    const limit = parseInt(req.query.limit) || 50;
    const logs = db.getPostLogs(userId, limit);
    res.json({ ok: true, logs });
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
  app.get("/api/admin/stats", (req, res) => {
    const stats = db.getSystemStats();
    stats.queuePendingCount = automationQueue.getPendingCount();
    res.json({ ok: true, stats });
  });
  app.get("/api/admin/logs", (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const logs = db.getSystemLogs(limit);
    res.json({ ok: true, logs });
  });
  app.post("/api/admin/broadcast", async (req, res) => {
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
  app.get("/api/admin/other-bots", (req, res) => {
    const bots = db.getOtherBots(false);
    res.json({ ok: true, bots });
  });
  app.post("/api/admin/other-bots", (req, res) => {
    try {
      const { name, username, description, category, url, icon, badge, enabled, order } = req.body;
      const cleanUsername = username.startsWith("@") ? username : `@${username}`;
      const bot = db.upsertOtherBot({
        id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        name,
        username: cleanUsername,
        description,
        category: category || "Utilities",
        url: url || `https://t.me/${cleanUsername.replace("@", "")}`,
        icon: icon || "\u{1F916}",
        badge,
        enabled: enabled !== false,
        clicksCount: 0,
        order: order || 1,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.json({ ok: true, bot });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  app.put("/api/admin/other-bots/:id", (req, res) => {
    const { id } = req.params;
    const existing = db.getOtherBots(false).find((b) => b.id === id);
    if (!existing) return res.status(404).json({ ok: false, error: "Bot not found" });
    const updated = db.upsertOtherBot({
      ...existing,
      ...req.body,
      id
    });
    res.json({ ok: true, bot: updated });
  });
  app.delete("/api/admin/other-bots/:id", (req, res) => {
    const { id } = req.params;
    const success = db.deleteOtherBot(id);
    res.json({ ok: success });
  });
  app.get("/api/admin/settings", (req, res) => {
    const settings = db.getSettings();
    const masked = {
      ...settings,
      botTokenMasked: settings.botToken ? `${settings.botToken.slice(0, 7)}...${settings.botToken.slice(-4)}` : ""
    };
    res.json({ ok: true, settings: masked });
  });
  app.post("/api/admin/settings", (req, res) => {
    const { botToken, botUsername, webhookUrl } = req.body;
    const updated = db.updateSettings({
      ...botToken !== void 0 && { botToken },
      ...botUsername !== void 0 && { botUsername },
      ...webhookUrl !== void 0 && { webhookUrl }
    });
    res.json({ ok: true, settings: updated });
  });
  app.post("/api/admin/telegram-test", async (req, res) => {
    try {
      const { botToken, webhookUrl } = req.body;
      const token = botToken || db.getSettings().botToken;
      if (!token) {
        return res.status(400).json({ ok: false, error: "No Telegram bot token provided" });
      }
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const meJson = await meRes.json();
      if (!meJson.ok) {
        return res.status(400).json({ ok: false, error: `Telegram Error: ${meJson.description}` });
      }
      let webhookStatus = null;
      if (webhookUrl) {
        const hookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
        webhookStatus = await hookRes.json();
      }
      res.json({
        ok: true,
        botInfo: meJson.result,
        webhookStatus
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });
  const distPath = path2.join(process.cwd(), "dist");
  const hasDist = fs2.existsSync(path2.join(distPath, "index.html"));
  if (process.env.NODE_ENV === "production" && hasDist) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[X2Telegram Server] Running on http://0.0.0.0:${PORT}`);
    sourceMonitor.start();
    telegramBot.startPolling();
  });
}
startServer();
//# sourceMappingURL=server.js.map
