import { db } from './db.ts';
import { detectAdOrPromotion, rewriteSocialPost, AdDetectionResult } from './gemini.ts';
import { telegramClient } from './telegramClient.ts';
import { xClient } from './xClient.ts';
import { Automation, PostLog, MediaItem } from '../src/types.ts';

export interface QueueJob {
  id: string;
  automationId: string;
  userId: string;
  sourcePostId: string;
  sourceAuthor: string;
  sourceContent: string;
  sourceUrl?: string;
  media?: MediaItem[];
  attempts: number;
  maxAttempts: number;
  scheduledAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
}

class AutomationQueue {
  private queue: QueueJob[] = [];
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;
  private lastDispatchTimes: Map<string, number> = new Map(); // Rate limiting per destination

  constructor() {
    this.startWorker();
  }

  private startWorker() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.tick();
    }, 1500); // Check queue every 1.5s
  }

  public enqueuePost(
    automation: Automation,
    postData: {
      sourcePostId: string;
      sourceAuthor: string;
      sourceContent: string;
      sourceUrl?: string;
      media?: MediaItem[];
    }
  ): { status: string; reason?: string; jobId?: string } {
    // 1. Deduplication check
    if (db.isPostProcessed(automation.id, postData.sourcePostId)) {
      db.logSystem('warn', 'queue', `Deduplication dropped existing post ${postData.sourcePostId}`, automation.userId);
      return { status: 'duplicate', reason: 'Post was already published previously' };
    }

    if (db.isContentDuplicate(automation.id, postData.sourceContent)) {
      db.logSystem('warn', 'queue', `Deduplication dropped duplicate content`, automation.userId);
      return { status: 'duplicate', reason: 'Duplicate content already published previously' };
    }

    // Check if currently queued
    const alreadyQueued = this.queue.some(
      (j) => j.automationId === automation.id && j.sourcePostId === postData.sourcePostId && j.status === 'pending'
    );
    if (alreadyQueued) {
      return { status: 'duplicate', reason: 'Post already in queue' };
    }

    const job: QueueJob = {
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
      status: 'pending',
    };

    this.queue.push(job);
    db.logSystem(
      'info',
      'queue',
      `Enqueued post from ${postData.sourceAuthor} for automation ${automation.name}`,
      automation.userId
    );
    return { status: 'queued', jobId: job.id };
  }

  public getPendingCount(): number {
    return this.queue.filter((j) => j.status === 'pending').length;
  }

  private async tick() {
    if (this.isProcessing) return;
    const now = Date.now();

    // Find next eligible job
    const job = this.queue.find((j) => j.status === 'pending' && j.scheduledAt <= now);
    if (!job) return;

    this.isProcessing = true;
    job.status = 'processing';
    job.attempts++;

    try {
      await this.processJob(job);
      job.status = 'completed';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Queue] Job ${job.id} execution failed:`, message);

      if (job.attempts < job.maxAttempts) {
        job.status = 'pending';
        // Exponential backoff: 5s, 20s, 60s
        const backoffMs = Math.pow(job.attempts, 2) * 5000;
        job.scheduledAt = Date.now() + backoffMs;
        db.logSystem(
          'warn',
          'queue',
          `Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}). Retrying in ${backoffMs / 1000}s: ${message}`,
          job.userId
        );
      } else {
        job.status = 'failed';
        db.logSystem(
          'error',
          'queue',
          `Job ${job.id} permanently failed after ${job.maxAttempts} attempts: ${message}`,
          job.userId
        );

        // Record failed post in DB
        db.addPostLog({
          id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          userId: job.userId,
          automationId: job.automationId,
          direction: 'x_to_telegram',
          sourcePostId: job.sourcePostId,
          sourceAuthor: job.sourceAuthor,
          sourceContent: job.sourceContent,
          sourceUrl: job.sourceUrl,
          media: job.media || [],
          processedContent: '[Failed delivery]',
          isAd: false,
          status: 'failed',
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          errorMessage: message,
          createdAt: new Date().toISOString(),
        });
      }
    } finally {
      // Clean up completed or failed jobs from in-memory queue
      this.queue = this.queue.filter((j) => j.status === 'pending');
      this.isProcessing = false;
    }
  }

  private async processJob(job: QueueJob) {
    const automation = db.getAutomation(job.automationId, job.userId);
    if (!automation || automation.status !== 'active') {
      throw new Error('Automation is paused or deleted');
    }

    const user = db.getUser(job.userId);
    if (!user || user.status !== 'active') {
      throw new Error('User account is not active');
    }

    // Rate-limit per destination (enforce minimum 1.5s delay between messages to same target)
    const rateKey = `${automation.direction}:${automation.destination}`;
    const lastTime = this.lastDispatchTimes.get(rateKey) || 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < 1500) {
      await new Promise((r) => setTimeout(r, 1500 - elapsed));
    }
    this.lastDispatchTimes.set(rateKey, Date.now());

    // 1. Ad / Promo detection
    const extractUrls = (text: string) => {
      const match = text.match(/https?:\/\/[^\s]+/g);
      return match ? Array.from(match) : [];
    };
    const links = extractUrls(job.sourceContent);
    if (job.sourceUrl) links.push(job.sourceUrl);

    let adResult: AdDetectionResult = {
      isAd: false,
      confidence: 0,
      reason: 'Ad filtering disabled',
      category: 'organic',
    };

    if (automation.settings.filterPromotions) {
      adResult = await detectAdOrPromotion(job.sourceContent, links, job.sourceAuthor);
    }

    if (adResult.isAd) {
      db.logSystem(
        'warn',
        'ad_detector',
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
        processedContent: '[Filtered by Ad Detector]',
        isAd: true,
        adConfidence: adResult.confidence,
        adReasoning: adResult.reason,
        adCategory: adResult.category,
        status: 'filtered_ad',
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        createdAt: new Date().toISOString(),
      });
      return; // Do not forward
    }

    // 2. Fact-Preserving Rewriting
    let processedContent = job.sourceContent;
    let threadParts: string[] | undefined;

    if (automation.settings.autoRewrite) {
      const rewrite = await rewriteSocialPost({
        content: job.sourceContent,
        direction: automation.direction,
        preferredFormat: automation.settings.format,
        sourceAuthor: job.sourceAuthor,
        sourceUrl: automation.settings.includeOriginalLink ? job.sourceUrl : undefined,
      });
      processedContent = rewrite.text;
      threadParts = rewrite.threadParts;
    } else if (automation.settings.includeOriginalLink && job.sourceUrl) {
      processedContent += `\n\n🔗 Source: ${job.sourceUrl}`;
    }

    // 3. Dispatch to destination platform with real API calls
    const publishedPostId = await this.dispatchToDestination(
      automation,
      processedContent,
      job.media || [],
      threadParts
    );

    // 4. Record successful publication
    const publishedLog: PostLog = {
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
      status: 'published',
      publishedPostId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    db.addPostLog(publishedLog);
    db.logSystem(
      'success',
      'engine',
      `Published post to ${automation.destination} via ${automation.name}`,
      job.userId
    );
  }

  private async dispatchToDestination(
    automation: Automation,
    content: string,
    media: MediaItem[],
    threadParts?: string[]
  ): Promise<string> {
    if (automation.direction === 'x_to_telegram') {
      return await this.dispatchToTelegram(automation, content, media);
    } else {
      return await this.dispatchToX(automation, content, media, threadParts);
    }
  }

  private async dispatchToTelegram(
    automation: Automation,
    content: string,
    media: MediaItem[]
  ): Promise<string> {
    const targetChannel = automation.destination;
    let publishedId = `tg_${Date.now()}`;

    // If real bot token is available, deliver to Telegram API
    if (telegramClient.hasValidToken()) {
      try {
        const CAPTION_LIMIT = 1024;
        let caption = content;
        let followUpText: string | null = null;

        if (media.length > 0 && content.length > CAPTION_LIMIT) {
          // Break caption safely at word boundary
          const lastSpace = content.lastIndexOf(' ', CAPTION_LIMIT - 10);
          const splitIdx = lastSpace > 500 ? lastSpace : CAPTION_LIMIT - 10;
          caption = content.substring(0, splitIdx).trim();
          followUpText = content.substring(splitIdx).trim();
        }

        if (media.length === 1) {
          const m = media[0];
          if (m.type === 'video') {
            const res = await telegramClient.sendVideo(targetChannel, m.url, caption);
            publishedId = String(res?.message_id || publishedId);
          } else {
            const res = await telegramClient.sendPhoto(targetChannel, m.url, caption);
            publishedId = String(res?.message_id || publishedId);
          }
        } else if (media.length > 1) {
          const mediaList = media.map((m, idx) => ({
            type: (m.type === 'video' ? 'video' : 'photo') as 'photo' | 'video',
            media: m.url,
            caption: idx === 0 ? caption : undefined,
          }));
          const res = await telegramClient.sendMediaGroup(targetChannel, mediaList);
          publishedId = String(Array.isArray(res) ? res[0]?.message_id : res?.message_id || publishedId);
        } else {
          const res = await telegramClient.sendMessage(targetChannel, content, {
            disable_web_page_preview: false,
          });
          publishedId = String(res?.message_id || publishedId);
        }

        // If caption had overflow, send remainder as clean follow-up text
        if (followUpText && media.length > 0) {
          await telegramClient.sendMessage(targetChannel, followUpText, {
            disable_web_page_preview: false,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        db.logSystem('warn', 'telegram_bot', `Telegram delivery note to ${targetChannel}: ${msg}`);
        throw err;
      }
    } else {
      db.logSystem('info', 'telegram_bot', `Telegram bot token not yet configured; post stored for ${targetChannel}`);
    }

    return publishedId;
  }

  private async dispatchToX(
    automation: Automation,
    content: string,
    media: MediaItem[],
    threadParts?: string[]
  ): Promise<string> {
    const user = db.getUser(automation.userId) || db.getOwner();
    const creds = user?.settings.xCredentials || {};
    let publishedId = `x_${Date.now()}`;

    // If user has provided X credentials, post to real Twitter API
    if (creds.oauth2AccessToken || (creds.apiKey && creds.accessToken) || creds.bearerToken) {
      try {
        if (threadParts && threadParts.length > 1) {
          const tweetIds = await xClient.postThread(creds, threadParts);
          publishedId = tweetIds.join(',');
        } else {
          const tweet = await xClient.postTweet(creds, content);
          publishedId = tweet.id;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        db.logSystem('warn', 'x_client', `X API posting note for ${automation.destination}: ${msg}`);
        throw err;
      }
    } else {
      db.logSystem(
        'info',
        'x_client',
        `No Twitter OAuth configured for personal bot; post logged for destination ${automation.destination}.`
      );
    }

    return publishedId;
  }
}

export const automationQueue = new AutomationQueue();
