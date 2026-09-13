import { db } from './db.ts';
import { xClient } from './xClient.ts';
import { automationQueue } from './queue.ts';
import { Automation } from '../src/types.ts';

export class SourceMonitor {
  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;
  private checkIntervalMs = 60000; // Poll every 60 seconds

  constructor() {
    this.start();
  }

  public start() {
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
      db.logSystem('warn', 'monitor', `Source monitor cycle notice: ${msg}`);
    } finally {
      this.isChecking = false;
    }
  }

  private async pollXAccount(auto: Automation, user: any) {
    const handle = auto.source.trim();
    if (!handle) return;

    try {
      const tweets = await xClient.fetchRecentTweets(
        handle,
        auto.lastSeenPostId,
        user.settings?.xCredentials?.bearerToken
      );

      if (!tweets || tweets.length === 0) {
        // Record last poll time
        db.updateAutomation(auto.id, auto.userId, {
          lastPollAt: new Date().toISOString(),
        });
        return;
      }

      // Process oldest to newest
      const sorted = [...tweets].sort((a, b) => a.id.localeCompare(b.id));
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
      if (newestId && newestId !== auto.lastSeenPostId) {
        db.updateAutomation(auto.id, auto.userId, {
          lastSeenPostId: newestId,
          lastPollAt: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      db.logSystem('warn', 'monitor', `Failed polling X handle ${handle}: ${msg}`, auto.userId);
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
