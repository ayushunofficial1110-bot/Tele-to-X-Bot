import crypto from 'node:crypto';
import { UserXCredentials, MediaItem } from '../src/types.ts';
import { db } from './db.ts';

export interface XTweet {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  url: string;
  media: MediaItem[];
}

export class XClient {
  private defaultBearerToken = process.env.TWITTER_BEARER_TOKEN || '';
  private defaultClientId = process.env.TWITTER_CLIENT_ID || '';
  private defaultClientSecret = process.env.TWITTER_CLIENT_SECRET || '';

  // --- OAuth 2.0 PKCE Helpers ---

  public generatePKCE(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  public getOAuth2AuthorizeUrl(options: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
    clientId?: string;
  }): string {
    const clientId = options.clientId || this.defaultClientId || 'TWITTER_CLIENT_ID';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: options.redirectUri,
      scope: 'tweet.read tweet.write users.read offline.access',
      state: options.state,
      code_challenge: options.codeChallenge,
      code_challenge_method: 'S256',
    });
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  public async exchangeOAuth2Code(options: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    clientId?: string;
    clientSecret?: string;
  }): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    scope: string;
  }> {
    const clientId = options.clientId || this.defaultClientId;
    const clientSecret = options.clientSecret || this.defaultClientSecret;

    const bodyParams = new URLSearchParams({
      code: options.code,
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: options.redirectUri,
      code_verifier: options.codeVerifier,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (clientSecret) {
      headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers,
      body: bodyParams.toString(),
    });

    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(`X OAuth2 exchange error: ${json.error_description || json.error || res.statusText}`);
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in || 7200,
      scope: json.scope || '',
    };
  }

  public async refreshOAuth2Token(options: {
    refreshToken: string;
    clientId?: string;
    clientSecret?: string;
  }): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    const clientId = options.clientId || this.defaultClientId;
    const clientSecret = options.clientSecret || this.defaultClientSecret;

    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: options.refreshToken,
      client_id: clientId,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (clientSecret) {
      headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers,
      body: bodyParams.toString(),
    });

    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(`X OAuth2 refresh error: ${json.error_description || json.error || res.statusText}`);
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in || 7200,
    };
  }

  // --- OAuth 1.0a Signature Generator (RFC 5849) ---

  private getOAuth1Header(options: {
    url: string;
    method: string;
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
  }): string {
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: options.apiKey,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: options.accessToken,
      oauth_version: '1.0',
    };

    // Construct signature base
    const sortedKeys = Object.keys(oauthParams).sort();
    const paramString = sortedKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
      .join('&');

    const signatureBase = `${options.method.toUpperCase()}&${encodeURIComponent(options.url)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(options.apiSecret)}&${encodeURIComponent(options.accessSecret)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

    oauthParams['oauth_signature'] = signature;

    const headerParts = Object.keys(oauthParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`);

    return `OAuth ${headerParts.join(', ')}`;
  }

  // --- Posting Tweets (Telegram ➔ X) ---

  public async postTweet(
    creds: UserXCredentials,
    text: string,
    options?: {
      mediaIds?: string[];
      inReplyToTweetId?: string;
    }
  ): Promise<{ id: string; text: string }> {
    const url = 'https://api.twitter.com/2/tweets';
    const payload: any = { text };

    if (options?.mediaIds && options.mediaIds.length > 0) {
      payload.media = { media_ids: options.mediaIds };
    }

    if (options?.inReplyToTweetId) {
      payload.reply = { in_reply_to_tweet_id: options.inReplyToTweetId };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Determine authentication header: OAuth2 User Token takes priority, then OAuth 1.0a, then Bearer Token
    if (creds.oauth2AccessToken) {
      headers['Authorization'] = `Bearer ${creds.oauth2AccessToken}`;
    } else if (creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessSecret) {
      headers['Authorization'] = this.getOAuth1Header({
        url,
        method: 'POST',
        apiKey: creds.apiKey,
        apiSecret: creds.apiSecret,
        accessToken: creds.accessToken,
        accessSecret: creds.accessSecret,
      });
    } else if (creds.bearerToken) {
      headers['Authorization'] = `Bearer ${creds.bearerToken}`;
    } else if (this.defaultBearerToken) {
      headers['Authorization'] = `Bearer ${this.defaultBearerToken}`;
    } else {
      throw new Error(
        'No X (Twitter) credentials configured. Please authenticate via OAuth2 or provide API keys in Settings.'
      );
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as any;
    if (!res.ok) {
      const errorMsg = json.detail || json.errors?.[0]?.message || res.statusText;
      const error = new Error(`X API [${res.status}]: ${errorMsg}`);
      (error as any).status = res.status;
      (error as any).data = json;
      throw error;
    }

    return {
      id: json.data?.id || `tweet_${Date.now()}`,
      text: json.data?.text || text,
    };
  }

  public async postThread(
    creds: UserXCredentials,
    threadTexts: string[],
    mediaIds?: string[]
  ): Promise<string[]> {
    const postedIds: string[] = [];
    let lastTweetId: string | undefined = undefined;

    for (let i = 0; i < threadTexts.length; i++) {
      const text = threadTexts[i];
      // Attach media to the first tweet only
      const tweetMedia = i === 0 ? mediaIds : undefined;

      const result = await this.postTweet(creds, text, {
        mediaIds: tweetMedia,
        inReplyToTweetId: lastTweetId,
      });

      postedIds.push(result.id);
      lastTweetId = result.id;

      // Small pacing delay between tweets in a thread
      if (i < threadTexts.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    return postedIds;
  }

  // --- Media Upload (X API v1.1) ---

  public async uploadMedia(
    creds: UserXCredentials,
    mediaBuffer: Buffer,
    mimeType = 'image/jpeg'
  ): Promise<string> {
    const url = 'https://upload.twitter.com/1.1/media/upload.json';

    // X media upload requires OAuth 1.0a or OAuth2 with media write scope
    const formData = new FormData();
    const blob = new Blob([mediaBuffer], { type: mimeType });
    formData.append('media', blob);

    const headers: Record<string, string> = {};

    if (creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessSecret) {
      headers['Authorization'] = this.getOAuth1Header({
        url,
        method: 'POST',
        apiKey: creds.apiKey,
        apiSecret: creds.apiSecret,
        accessToken: creds.accessToken,
        accessSecret: creds.accessSecret,
      });
    } else if (creds.oauth2AccessToken) {
      headers['Authorization'] = `Bearer ${creds.oauth2AccessToken}`;
    } else {
      throw new Error('X media upload requires OAuth credentials (API Key + Access Token or OAuth2).');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(`X Media Upload error: ${json.error || json.errors?.[0]?.message || res.statusText}`);
    }

    return json.media_id_string || String(json.media_id);
  }

  // --- Source Monitoring (X ➔ Telegram) using Official X API v2 ---

  public async fetchRecentTweets(
    authorHandle: string,
    sinceId?: string,
    overrideBearer?: string
  ): Promise<XTweet[]> {
    const handle = authorHandle.replace('@', '').trim();
    const bearer = overrideBearer || this.defaultBearerToken;

    if (!bearer || bearer.trim() === '' || bearer.includes('TODO')) {
      throw new Error(
        `Official X API requires a valid TWITTER_BEARER_TOKEN or OAuth 2.0 Access Token to monitor @${handle}. Set TWITTER_BEARER_TOKEN in environment variables.`
      );
    }

    return await this.fetchViaOfficialApi(handle, sinceId, bearer.trim());
  }

  private async fetchViaOfficialApi(handle: string, sinceId: string | undefined, bearer: string): Promise<XTweet[]> {
    // 1. Look up user ID by username
    const userRes = await fetch(`https://api.twitter.com/2/users/by/username/${handle}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });

    const userJson = (await userRes.json()) as any;
    if (!userRes.ok || !userJson.data?.id) {
      const errDetail = userJson.detail || userJson.errors?.[0]?.message || userRes.statusText;
      throw new Error(`Official X API user lookup for @${handle} failed: ${errDetail}`);
    }
    const xUserId = userJson.data.id;

    // 2. Fetch recent tweets with full expansions
    let url = `https://api.twitter.com/2/users/${xUserId}/tweets?max_results=10&tweet.fields=created_at,entities,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url,type,variants`;
    if (sinceId) {
      url += `&since_id=${sinceId}`;
    }

    const tweetRes = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}` },
    });

    if (tweetRes.status === 429) {
      const resetHeader = tweetRes.headers.get('x-rate-limit-reset');
      const resetSeconds = resetHeader ? Math.max(1, parseInt(resetHeader) - Math.floor(Date.now() / 1000)) : 60;
      throw new Error(`X API Rate Limit reached for @${handle}. Rate limit resets in ${resetSeconds}s.`);
    }

    const tweetJson = (await tweetRes.json()) as any;
    if (!tweetRes.ok) {
      const errDetail = tweetJson.detail || tweetJson.errors?.[0]?.message || tweetRes.statusText;
      throw new Error(`Official X API tweet fetch for @${handle} failed: ${errDetail}`);
    }

    const tweets = tweetJson.data || [];
    const mediaMap = new Map<string, MediaItem>();
    if (tweetJson.includes?.media) {
      for (const m of tweetJson.includes.media) {
        mediaMap.set(m.media_key, {
          type: m.type === 'video' ? 'video' : m.type === 'animated_gif' ? 'gif' : 'image',
          url: m.url || m.preview_image_url || '',
        });
      }
    }

    return tweets.map((t: any) => {
      const mediaList: MediaItem[] = [];
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
        createdAt: t.created_at || new Date().toISOString(),
        url: `https://x.com/${handle}/status/${t.id}`,
        media: mediaList,
      };
    });
  }
}

export const xClient = new XClient();
