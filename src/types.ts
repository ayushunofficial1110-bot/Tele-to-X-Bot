export type AutomationDirection = 'x_to_telegram' | 'telegram_to_x';

export type PlanType = 'free' | 'pro' | 'enterprise';

export interface UserXCredentials {
  bearerToken?: string;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessSecret?: string;
  accountHandle?: string;
}

export interface UserSettings {
  autoRewrite: boolean;
  adFilterEnabled: boolean;
  preserveFactsStrict: boolean;
  defaultPostFormat: 'auto' | 'concise' | 'thread';
  xCredentials: UserXCredentials;
  telegramChannelId?: string;
}

export interface UserPlan {
  name: PlanType;
  monthlyLimit: number;
  checkIntervalMinutes: number;
  threadPostingSupported: boolean;
  priorityQueue: boolean;
}

export interface BotUser {
  id: string; // e.g. "user_1001" or "tg_12345678"
  telegramId: string;
  telegramUsername: string;
  firstName: string;
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
  source: string; // e.g. "@techradar" or "Telegram Channel: @my_news"
  destination: string; // e.g. "Telegram Channel: @tech_feed" or "@x_company_account"
  status: 'active' | 'paused' | 'error';
  settings: AutomationSettings;
  stats: AutomationStats;
  lastSeenPostId?: string;
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
  publishedAt?: string;
  createdAt: string;
}

export interface OtherBot {
  id: string;
  name: string;
  username: string; // e.g. "@CryptoAlertsHQBot"
  description: string;
  category: string; // e.g. "Crypto", "AI Tools", "Marketing", "News"
  url: string;
  icon: string;
  badge?: string;
  enabled: boolean;
  clicksCount: number;
  order: number;
  createdAt: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  source: 'engine' | 'telegram_bot' | 'gemini' | 'ad_detector' | 'queue' | 'api';
  message: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  newUsers24h: number;
  activeAutomations: number;
  totalAutomations: number;
  postsProcessed: number;
  failedPosts: number;
  adFilteredPosts: number;
  queuePendingCount: number;
  uptimeSeconds: number;
}

export interface SystemSettings {
  botToken: string;
  botUsername: string;
  webhookUrl: string;
  isWebhookActive: boolean;
  adminSecret: string;
  autoProcessSampleQueue: boolean;
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
