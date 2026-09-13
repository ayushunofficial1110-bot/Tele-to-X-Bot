import { db } from './db.ts';

export interface TelegramSendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  reply_markup?: any;
  reply_to_message_id?: number;
}

/**
 * Validates and parses any Telegram channel input (URL, handle, numeric ID)
 * into a canonical Telegram identifier without guessing.
 */
export function parseTelegramChannelInput(input: string): {
  valid: boolean;
  canonical: string;
  error?: string;
} {
  if (!input || typeof input !== 'string') {
    return { valid: false, canonical: '', error: 'Channel identifier cannot be empty' };
  }

  const trimmed = input.trim();

  // 1. Private channel web link format: t.me/c/1234567890/1
  const privateWebMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/c\/(\d+)(?:\/\d+)?\/?$/i);
  if (privateWebMatch) {
    return { valid: true, canonical: `-100${privateWebMatch[1]}` };
  }

  // 2. Public channel link format: https://t.me/my_channel or t.me/my_channel
  const publicWebMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/([a-zA-Z0-9_]{5,32})\/?$/i);
  if (publicWebMatch) {
    return { valid: true, canonical: `@${publicWebMatch[1]}` };
  }

  // 3. Numeric ID (e.g. -1001234567890 or -12345678 or direct user ID 123456789)
  if (/^-100\d{7,16}$/.test(trimmed)) {
    return { valid: true, canonical: trimmed };
  }
  if (/^-\d{5,16}$/.test(trimmed)) {
    return { valid: true, canonical: trimmed };
  }
  // Pure numeric user / private chat ID (e.g. 123456789)
  if (/^\d{5,16}$/.test(trimmed)) {
    return { valid: true, canonical: trimmed };
  }

  // 4. Standard username with @ (e.g. @tech_news_hub)
  if (/^@[a-zA-Z0-9_]{5,32}$/.test(trimmed)) {
    return { valid: true, canonical: trimmed };
  }

  // 5. Standard username without @ (e.g. tech_news_hub) - must contain at least one letter
  if (/^[a-zA-Z0-9_]{5,32}$/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) {
    return { valid: true, canonical: `@${trimmed}` };
  }

  return {
    valid: false,
    canonical: trimmed,
    error:
      'Invalid format. Provide a channel username (e.g. @channel_name), a t.me link (https://t.me/channel_name), or a channel ID (-1001234567890).',
  };
}

export class TelegramClient {
  public getActiveToken(overrideToken?: string): string {
    const adminToken = db.getSettings().botToken?.trim();
    const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const token = overrideToken?.trim() || adminToken || envToken || '';
    return token.trim();
  }

  private getBotToken(overrideToken?: string): string {
    const token = this.getActiveToken(overrideToken);
    if (!token || token.trim() === '' || token.includes('TODO')) {
      throw new Error('Telegram Bot Token is not configured. Set TELEGRAM_BOT_TOKEN in environment or configure in Admin Panel.');
    }
    return token.trim();
  }

  public hasValidToken(overrideToken?: string): boolean {
    try {
      const token = this.getBotToken(overrideToken);
      return token.length > 20 && token.includes(':');
    } catch {
      return false;
    }
  }

  public async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert = false,
    overrideToken?: string
  ): Promise<any> {
    try {
      return await this.callApi(
        'answerCallbackQuery',
        {
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert,
        },
        overrideToken
      );
    } catch {
      return null;
    }
  }

  public async getWebhookInfo(overrideToken?: string): Promise<any> {
    return this.callApi('getWebhookInfo', {}, overrideToken);
  }

  private async callApi(endpoint: string, payload: any, overrideToken?: string): Promise<any> {
    const token = this.getBotToken(overrideToken);
    const url = `https://api.telegram.org/bot${token}/${endpoint}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json: any = await res.json();
    if (!json.ok) {
      const desc = json.description || 'Unknown Telegram error';
      const code = json.error_code || res.status;
      const error = new Error(`Telegram API [${code}]: ${desc}`);
      (error as any).errorCode = code;
      (error as any).parameters = json.parameters;
      throw error;
    }
    return json.result;
  }

  public async getMe(overrideToken?: string): Promise<any> {
    const token = this.getBotToken(overrideToken);
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const json: any = await res.json();
    if (!json.ok) {
      throw new Error(`Telegram getMe error: ${json.description}`);
    }
    return json.result;
  }

  public async getChat(chatId: string | number, overrideToken?: string): Promise<any> {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;
    return this.callApi('getChat', { chat_id: targetChatId }, overrideToken);
  }

  public async getChatMember(chatId: string | number, userId: string | number, overrideToken?: string): Promise<any> {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;
    return this.callApi('getChatMember', { chat_id: targetChatId, user_id: userId }, overrideToken);
  }

  /**
   * Strictly verifies whether the bot has been added to the channel
   * and granted administrator permissions to post messages.
   */
  public async verifyChannelPermissions(
    rawChatInput: string | number,
    overrideToken?: string
  ): Promise<{
    canPost: boolean;
    canonicalId: string;
    chatTitle: string;
    chatType: string;
    error?: string;
  }> {
    const parsed = parseTelegramChannelInput(String(rawChatInput));
    if (!parsed.valid) {
      return {
        canPost: false,
        canonicalId: String(rawChatInput),
        chatTitle: String(rawChatInput),
        chatType: 'unknown',
        error: parsed.error,
      };
    }

    try {
      const me = await this.getMe(overrideToken);
      const chat = await this.getChat(parsed.canonical, overrideToken);
      const member = await this.getChatMember(parsed.canonical, me.id, overrideToken);

      const status = member.status; // 'creator', 'administrator', 'member', 'left', 'kicked'
      const canPost =
        status === 'creator' ||
        (status === 'administrator' && member.can_post_messages !== false);

      return {
        canPost,
        canonicalId: parsed.canonical,
        chatTitle: chat.title || chat.username ? `@${chat.username}` : parsed.canonical,
        chatType: chat.type,
        error: canPost
          ? undefined
          : `Bot is in the channel as '${status}', but does not have administrator post permissions (can_post_messages). Please promote the bot to Administrator.`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        canPost: false,
        canonicalId: parsed.canonical,
        chatTitle: parsed.canonical,
        chatType: 'unknown',
        error: `Could not access channel: ${message}. Make sure the channel is public or the bot is added as an administrator.`,
      };
    }
  }

  public async sendMessage(
    chatId: string | number,
    text: string,
    options?: TelegramSendMessageOptions,
    overrideToken?: string
  ): Promise<any> {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;
    const MAX_CHUNK = 4000;

    if (text.length > MAX_CHUNK) {
      const chunks = this.splitMessage(text, MAX_CHUNK);
      let lastResult: any = null;
      for (let i = 0; i < chunks.length; i++) {
        lastResult = await this.sendSingleMessage(
          targetChatId,
          chunks[i],
          { ...options, reply_markup: i === chunks.length - 1 ? options?.reply_markup : undefined },
          overrideToken
        );
      }
      return lastResult;
    }

    return this.sendSingleMessage(targetChatId, text, options, overrideToken);
  }

  private async sendSingleMessage(
    chatId: string | number,
    text: string,
    options?: TelegramSendMessageOptions,
    overrideToken?: string
  ): Promise<any> {
    const payload: any = {
      chat_id: chatId,
      text,
      disable_web_page_preview: options?.disable_web_page_preview ?? false,
    };

    if (options?.parse_mode) payload.parse_mode = options.parse_mode;
    if (options?.reply_markup) payload.reply_markup = options.reply_markup;
    if (options?.reply_to_message_id) payload.reply_to_message_id = options.reply_to_message_id;

    try {
      return await this.callApi('sendMessage', payload, overrideToken);
    } catch (err: any) {
      // If parse mode formatting fails (e.g. malformed markdown entity), retry with plain text
      if (err.errorCode === 400 && err.message?.toLowerCase().includes('can\'t parse entities')) {
        db.logSystem('warn', 'telegram_bot', `Telegram parse error on entity tags; retrying as clean plain text`);
        delete payload.parse_mode;
        return await this.callApi('sendMessage', payload, overrideToken);
      }
      throw err;
    }
  }

  public async sendPhoto(
    chatId: string | number,
    photoUrl: string,
    caption?: string,
    options?: TelegramSendMessageOptions,
    overrideToken?: string
  ): Promise<any> {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;

    const payload: any = {
      chat_id: targetChatId,
      photo: photoUrl,
    };
    if (caption) {
      payload.caption = caption.slice(0, 1024); // Telegram caption limit
      if (options?.parse_mode) payload.parse_mode = options.parse_mode;
    }
    if (options?.reply_markup) payload.reply_markup = options.reply_markup;

    try {
      return await this.callApi('sendPhoto', payload, overrideToken);
    } catch (err: any) {
      db.logSystem('warn', 'telegram_bot', `Remote photo send failed (${err.message}). Falling back to message with URL`);
      return this.sendMessage(targetChatId, `${caption ? `${caption}\n\n` : ''}📷 ${photoUrl}`, options, overrideToken);
    }
  }

  public async sendVideo(
    chatId: string | number,
    videoUrl: string,
    caption?: string,
    options?: TelegramSendMessageOptions,
    overrideToken?: string
  ): Promise<any> {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;

    const payload: any = {
      chat_id: targetChatId,
      video: videoUrl,
    };
    if (caption) {
      payload.caption = caption.slice(0, 1024);
      if (options?.parse_mode) payload.parse_mode = options.parse_mode;
    }
    if (options?.reply_markup) payload.reply_markup = options.reply_markup;

    try {
      return await this.callApi('sendVideo', payload, overrideToken);
    } catch (err: any) {
      db.logSystem('warn', 'telegram_bot', `Remote video send failed (${err.message}). Falling back to message with URL`);
      return this.sendMessage(targetChatId, `${caption ? `${caption}\n\n` : ''}🎬 ${videoUrl}`, options, overrideToken);
    }
  }

  public async sendAnimation(
    chatId: string | number,
    gifUrl: string,
    caption?: string,
    options?: TelegramSendMessageOptions,
    overrideToken?: string
  ): Promise<any> {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;

    const payload: any = {
      chat_id: targetChatId,
      animation: gifUrl,
    };
    if (caption) {
      payload.caption = caption.slice(0, 1024);
      if (options?.parse_mode) payload.parse_mode = options.parse_mode;
    }
    if (options?.reply_markup) payload.reply_markup = options.reply_markup;

    try {
      return await this.callApi('sendAnimation', payload, overrideToken);
    } catch (err: any) {
      return this.sendMessage(targetChatId, `${caption ? `${caption}\n\n` : ''}GIF: ${gifUrl}`, options, overrideToken);
    }
  }

  public async sendMediaGroup(
    chatId: string | number,
    media: Array<{ type: 'photo' | 'video'; media: string; caption?: string }>,
    overrideToken?: string
  ): Promise<any> {
    const parsed = parseTelegramChannelInput(String(chatId));
    const targetChatId = parsed.valid ? parsed.canonical : chatId;

    const payload = {
      chat_id: targetChatId,
      media: media.slice(0, 10),
    };

    try {
      return await this.callApi('sendMediaGroup', payload, overrideToken);
    } catch (err: any) {
      db.logSystem('warn', 'telegram_bot', `Media group send failed (${err.message}). Falling back to single photo`);
      if (media.length > 0) {
        return this.sendPhoto(targetChatId, media[0].media, media[0].caption, undefined, overrideToken);
      }
    }
  }

  public async setWebhook(url: string, secretToken?: string, overrideToken?: string): Promise<any> {
    return this.callApi(
      'setWebhook',
      {
        url,
        secret_token: secretToken,
        allowed_updates: ['message', 'channel_post', 'callback_query', 'my_chat_member'],
      },
      overrideToken
    );
  }

  public async deleteWebhook(dropPendingUpdates = false, overrideToken?: string): Promise<any> {
    return this.callApi('deleteWebhook', { drop_pending_updates: dropPendingUpdates }, overrideToken);
  }

  public async getUpdates(offset?: number, limit = 100, timeout = 30, overrideToken?: string): Promise<any[]> {
    return this.callApi(
      'getUpdates',
      {
        offset,
        limit,
        timeout,
        allowed_updates: ['message', 'channel_post', 'callback_query', 'my_chat_member'],
      },
      overrideToken
    );
  }

  private splitMessage(str: string, maxLength: number): string[] {
    const parts: string[] = [];
    let current = '';
    const paragraphs = str.split('\n\n');

    for (const para of paragraphs) {
      if ((current + '\n\n' + para).length <= maxLength) {
        current = current ? current + '\n\n' + para : para;
      } else {
        if (current) parts.push(current);
        if (para.length <= maxLength) {
          current = para;
        } else {
          const lines = para.split('\n');
          current = '';
          for (const line of lines) {
            if ((current + '\n' + line).length <= maxLength) {
              current = current ? current + '\n' + line : line;
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
}

export const telegramClient = new TelegramClient();
