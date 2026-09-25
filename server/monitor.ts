import { db } from './db.ts';
import { xClient } from './xClient.ts';
import { automationQueue } from './queue.ts';
import { Automation } from '../src/types.ts';
import { isAiStudioEnvironment } from './config.ts';

export class SourceMonitor {
  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;
  private checkIntervalMs = 60000; // Poll every 60 seconds
  // Tracks cooldowns per automation (e.g. rate limit reset) to prevent rapid error loops
  private pollCooldowns: Map<string, { nextCheck: number; lastError: string; isDepleted: boolean }> = new Map();
  // Tracks last logged error to prevent duplicate system log spam
  private lastLoggedErrors: Map<string, string> = new Map();

  constructor() {
    // Only auto-start if not in AI Studio
    if (!isAiStudioEnvironment()) {
      this.start();
    }
  }

  public resetCooldown(autoId: string) {
    this.pollCooldowns.delete(autoId);
    this.lastLoggedErrors.delete(autoId);
  }

  public start() {
    if (isAiStudioEnvironment()) {
      return;
    }
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.checkSources();
    }, this.checkIntervalMs);
    // Initial check shortly after startup
    setTimeout(() => this.checkSources(), 5000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async checkSources() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      // Find all active X ➔ Telegram automations
      const allUsers = db.getUsers();
      const activeXAutomations: { user: any; auto: Automation }[] = [];

      for (const u of allUsers) {
        if (u.status !== 'active') continue;
        const autos = db.getAutomations(u.id);
        for (const a of autos) {
          if (a.status === 'active' && a.direction === 'x_to_telegram') {
            // Check if automation is currently in backoff cooldown
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
        // Pacing delay between source accounts to avoid burst requests
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      db.logSystem('info', 'monitor', `Source monitor cycle check: ${msg}`);
    } finally {
      this.isChecking = false;
    }
  }

  private async pollXAccount(auto: Automation, user: any) {
    const handle = auto.source.trim();
    if (!handle) return;

    try {
      const creds = user?.settings?.xCredentials;
      const tweets = await xClient.fetchRecentTweets(
        handle,
        auto.lastSeenPostId,
        {
          bearerToken: creds?.bearerToken,
          oauth2AccessToken: creds?.oauth2AccessToken,
        }
      );

      // On successful query, clear any prior cooldown, error state, and logged warnings
      this.pollCooldowns.delete(auto.id);
      this.lastLoggedErrors.delete(auto.id);

      if (!tweets || tweets.length === 0) {
        // Record last poll time
        db.updateAutomation(auto.id, auto.userId, {
          lastPollAt: new Date().toISOString(),
          lastError: undefined,
        });
        return;
      }

      // Process oldest to newest
      const sorted = [...tweets].sort((a, b) => {
        try {
          return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
        } catch {
          return a.id.localeCompare(b.id);
        }
      });
      let newestId = auto.lastSeenPostId;

      for (const t of sorted) {
        // Enqueue post into pipeline
        automationQueue.enqueuePost(auto, {
          sourcePostId: t.id,
          sourceAuthor: t.author,
          sourceContent: t.text,
          sourceUrl: t.url,
          media: t.media,
        });
        newestId = t.id;
      }

      // Update last seen ID in database
      db.updateAutomation(auto.id, auto.userId, {
        lastSeenPostId: newestId && newestId !== auto.lastSeenPostId ? newestId : auto.lastSeenPostId,
        lastPollAt: new Date().toISOString(),
        lastError: undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCreditsDepleted = Boolean(
        (err as any)?.isCreditsDepleted ||
        msg.toLowerCase().includes('credits depleted') ||
        msg.toLowerCase().includes('read quota depleted') ||
        msg.toLowerCase().includes('quota') ||
        msg.toLowerCase().includes('usage cap')
      );
      const isRateLimit = Boolean((err as any)?.isRateLimit || msg.toLowerCase().includes('rate limit') || msg.includes('429'));

      // If rate limited, hold off for 60 seconds. For depleted credits or transient errors, do not block the next cycle
      if (isRateLimit) {
        this.pollCooldowns.set(auto.id, {
          nextCheck: Date.now() + 60 * 1000,
          lastError: msg,
          isDepleted: false,
        });
      } else {
        this.pollCooldowns.delete(auto.id);
      }

      // Provide clear user-facing guidance
      const friendlyNotice = isCreditsDepleted
        ? `Official X API read quota is currently depleted for ${handle}. Official X Developer Free Tier supports posting to X (Telegram ➔ X), but reading timelines requires X API Basic credits. Check back after credits refresh or update TWITTER_BEARER_TOKEN.`
        : msg;

      // Store clear lastError on the automation. Do not advance lastSeenPostId.
      db.updateAutomation(auto.id, auto.userId, {
        lastError: friendlyNotice,
        lastPollAt: new Date().toISOString(),
      });

      // Log once per unique error state to avoid repeating log spam on Render
      const prevLogged = this.lastLoggedErrors.get(auto.id);
      if (prevLogged !== friendlyNotice) {
        this.lastLoggedErrors.set(auto.id, friendlyNotice);
        db.logSystem(
          'warn',
          'monitor',
          `Polling X source ${handle}: ${friendlyNotice}`,
          auto.userId
        );
      }
    }
  }

  // --- Real-time Telegram ➔ X Channel Listener ---
  public handleIncomingTelegramChannelPost(channelPost: any) {
    if (!channelPost) return;

    const chatId = channelPost.chat?.id;
    const chatUsername = channelPost.chat?.username ? `@${channelPost.chat.username}` : '';
    const text = channelPost.text || channelPost.caption || '';
    const messageId = channelPost.message_id;

    if (!text) return;

    // Find automations listening to this Telegram channel
    const allUsers = db.getUsers();
    for (const u of allUsers) {
      const autos = db.getAutomations(u.id);
      for (const a of autos) {
        if (a.status !== 'active' || a.direction !== 'telegram_to_x') continue;

        const cleanSource = a.source.replace(/^Telegram Channel:\s*/i, '').trim();
        const matchesUsername = chatUsername && cleanSource.toLowerCase() === chatUsername.toLowerCase();
        const matchesId = chatId && cleanSource === String(chatId);

        if (matchesUsername || matchesId) {
          db.logSystem(
            'info',
            'telegram_bot',
            `Received channel post #${messageId} from ${cleanSource} for automation ${a.name}`,
            u.id
          );

          automationQueue.enqueuePost(a, {
            sourcePostId: `tg_msg_${chatId}_${messageId}`,
            sourceAuthor: cleanSource,
            sourceContent: text,
            sourceUrl: chatUsername ? `https://t.me/${chatUsername.replace('@', '')}/${messageId}` : undefined,
            media: [],
          });
        }
      }
    }
  }
}

export const sourceMonitor = new SourceMonitor();
