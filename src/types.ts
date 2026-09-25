export type AutomationDirection = 'x_to_telegram' | 'telegram_to_x';

export type PlanType = 'free' | 'pro' | 'enterprise';

export interface UserXCredentials {
  bearerToken?: string;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessSecret?: string;
  accountHandle?: string;
  oauth2AccessToken?: string;
  oauth2RefreshToken?: string;
  oauth2ExpiresAt?: number;
  oauth2Scope?: string;
}

export interface UserSettings {
  autoRewrite: boolean;
  adFilterEnabled: boolean;
  preserveFactsStrict: boolean;
  defaultPostFormat: 'auto' | 'concise' | 'thread';
  xCredentials: UserXCredentials;
  telegramChannelId?: string;
  telegramChannelTitle?: string;
}

export interface BotUser {
  id: string; // Unique user ID (e.g. "usr_12345678")
  telegramId: string; // Telegram user ID (numeric string)
  telegramUsername: string; // e.g. "@username"
  firstName: string;
  authToken: string; // Secret login token for web dashboard access
  plan: PlanType;
  postsProcessedCount: number;
  postsFailedCount: number;
  postsFilteredAdsCount: number;
  status: 'active' | 'paused' | 'banned';
  settings: UserSettings;
  createdAt: string;
  lastActiveAt: string;
}

export interface AutomationSettings {
  filterPromotions: boolean;
  autoRewrite: boolean;
  format: 'auto' | 'concise' | 'thread';
  includeMedia: boolean;
  includeOriginalLink: boolean;
  preserveHashtags: boolean;
  customPrefix?: string;
  customSuffix?: string;
}

export interface AutomationStats {
  processedCount: number;
  skippedAdsCount: number;
  failedCount: number;
  lastRunAt?: string;
}

export interface Automation {
  id: string;
  userId: string;
  name: string;
  direction: AutomationDirection;
  source: string; // e.g. "@OpenAI" or "@my_telegram_channel"
  destination: string; // e.g. "@my_telegram_channel" or "@my_x_handle"
  status: 'active' | 'paused' | 'error';
  settings: AutomationSettings;
  stats: AutomationStats;
  lastSeenPostId?: string;
  lastPollAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaItem {
  type: 'image' | 'video' | 'gif';
  url: string;
  thumbnailUrl?: string;
}

export interface PostLog {
  id: string;
  userId: string;
  automationId: string;
  direction: AutomationDirection;
  sourcePostId: string;
  sourceAuthor: string;
  sourceContent: string;
  contentHash?: string; // Normalized SHA-256 for strict content deduplication
  sourceUrl?: string;
  media: MediaItem[];
  processedContent: string;
  threadParts?: string[];
  isAd: boolean;
  adConfidence?: number;
  adReasoning?: string;
  adCategory?: string;
  status: 'published' | 'filtered_ad' | 'queued' | 'retrying' | 'failed' | 'duplicate';
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  publishedPostId?: string;
  publishedAt?: string;
  createdAt: string;
}

export interface OtherBot {
  id: string;
  name: string;
  username: string; // e.g. "@CryptoWhaleTrackerBot"
  description: string;
  category: string; // e.g. "News", "Crypto", "Productivity"
  url: string;
  icon: string;
  badge?: string;
  enabled: boolean;
  clicksCount: number;
  order: number;
  createdAt: string;
  updatedAt?: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  source: 'engine' | 'telegram_bot' | 'gemini' | 'ad_detector' | 'queue' | 'api' | 'monitor' | 'x_client' | 'mongodb';
  message: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  activeAutomations: number;
  totalAutomations: number;
  postsProcessed: number;
  failedPosts: number;
  adFilteredPosts: number;
  queuePendingCount: number;
  uptimeSeconds: number;
}

export interface SystemSettings {
  botUsername: string;
  hasTelegramToken?: boolean;
  hasAdminKey?: boolean;
  hasMongoUri?: boolean;
  hasGeminiKey?: boolean;
  hasTwitterCreds?: boolean;
  isTokenUnauthorized?: boolean;
  isPolling?: boolean;
  isAiStudio?: boolean;
  lastUpdateId?: number;
}

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramSimulatedMessage {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
  timestamp: string;
  replyMarkup?: {
    inline_keyboard?: TelegramInlineButton[][];
  };
  channelDeliveries?: {
    channelTitle: string;
    text: string;
    mediaUrl?: string;
    time: string;
  }[];
}
