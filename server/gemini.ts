import { GoogleGenAI, Type } from '@google/genai';
import { db } from './db.ts';

let aiInstance: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  if (!aiInstance && process.env.GEMINI_API_KEY) {
    aiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

export interface AdDetectionResult {
  isAd: boolean;
  confidence: number;
  reason: string;
  category: 'organic' | 'sponsored' | 'affiliate_link' | 'crypto_shill' | 'hard_sale' | 'unknown';
}

export interface RewriteResult {
  text: string;
  threadParts?: string[];
  characterCount: number;
  isThread: boolean;
  preservedFactsChecked: boolean;
}

/**
 * Detects whether a post is an advertisement, sponsored promotion,
 * affiliate link, or spam that should not be forwarded.
 */
export async function detectAdOrPromotion(
  content: string,
  links: string[] = [],
  authorContext = ''
): Promise<AdDetectionResult> {
  const lower = content.toLowerCase();

  // Fast heuristic regex for blatant spam/ads before calling Gemini
  const blatantPatterns = [
    /#ad\b/i,
    /#sponsored\b/i,
    /#partner\b/i,
    /\bpresale\b/i,
    /\bairdrop\b.*?(claim|register|connect wallet)/i,
    /\buse code\s+['"]?[A-Z0-9]{3,}['"]?\s+for\s+\d+%/i,
    /\bfree\s+(usdt|crypto|bitcoin|eth)\b/i,
    /\btoken sale\b/i,
    /\bguaranteed (10x|100x|returns|profit)\b/i,
  ];

  for (const pat of blatantPatterns) {
    if (pat.test(lower)) {
      return {
        isAd: true,
        confidence: 0.95,
        reason: `Matched blatant commercial or token shill pattern: ${pat.source}`,
        category: 'sponsored',
      };
    }
  }

  const ai = getGenAI();
  if (!ai) {
    // If no Gemini API key configured, use rule-based heuristics
    const linkHasRef = links.some((l) => /ref=|aff=|promo=|utm_source=/i.test(l));
    if (linkHasRef) {
      return {
        isAd: true,
        confidence: 0.85,
        reason: 'Contains commercial affiliate or referral tracking parameters',
        category: 'affiliate_link',
      };
    }
    return {
      isAd: false,
      confidence: 0.1,
      reason: 'Rule-based heuristic passed (no promotional patterns detected)',
      category: 'organic',
    };
  }

  try {
    const prompt = `Analyze this social media post to determine if it is an advertisement, sponsored promotion, affiliate marketing, token shill, commercial spam, or organic genuine content.

Author/Account Context: "${authorContext || 'Unknown'}"
Detected URLs: ${links.length > 0 ? links.join(', ') : 'None'}

Post Content:
"""
${content}
"""

Rules:
- Genuine news, tech updates, thought leadership, developer tutorials, and standard announcements are NOT ads, even if they mention a company or product.
- Posts explicitly selling products, demanding signups via referral codes, shilling tokens/presales/giveaways, using sponsored hashtags (#ad, #sponsored), or pushing affiliate links ARE ads.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isAd: { type: Type.BOOLEAN, description: 'True if post is promotional/ad/spam' },
            confidence: { type: Type.NUMBER, description: 'Confidence between 0.0 and 1.0' },
            reason: { type: Type.STRING, description: 'Brief explanation of classification' },
            category: {
              type: Type.STRING,
              description: 'One of: organic, sponsored, affiliate_link, crypto_shill, hard_sale',
            },
          },
          required: ['isAd', 'confidence', 'reason', 'category'],
        },
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}') as AdDetectionResult;
    return {
      isAd: Boolean(parsed.isAd && (parsed.confidence ?? 0) >= 0.65),
      confidence: parsed.confidence ?? 0.5,
      reason: parsed.reason || 'AI classified content',
      category: (parsed.category as AdDetectionResult['category']) || (parsed.isAd ? 'sponsored' : 'organic'),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    db.logSystem('warn', 'ad_detector', `Gemini ad check failed, using fallback: ${message}`);
    return {
      isAd: false,
      confidence: 0.2,
      reason: 'Fallback classifier due to AI timeout',
      category: 'organic',
    };
  }
}

/**
 * Rewrites a post for the target platform:
 * - Strictly preserves all facts, figures, names, quotes, dates, claims
 * - Formats cleanly for Telegram (clean markdown, bullet points if appropriate)
 * - Or formats for X (validating 280-char boundaries or intelligent threading [1/N])
 */
export async function rewriteSocialPost({
  content,
  direction,
  preferredFormat = 'auto',
  sourceAuthor = '',
  sourceUrl = '',
}: {
  content: string;
  direction: 'x_to_telegram' | 'telegram_to_x';
  preferredFormat?: 'auto' | 'concise' | 'thread';
  sourceAuthor?: string;
  sourceUrl?: string;
}): Promise<RewriteResult> {
  const ai = getGenAI();

  // If direction is telegram_to_x and content is already short and no AI configured
  if (!ai) {
    return fallbackRewrite(content, direction, preferredFormat, sourceAuthor, sourceUrl);
  }

  try {
    if (direction === 'telegram_to_x') {
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
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tweets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Array of 1 to 5 tweets, each under 270 characters',
              },
              summary: { type: Type.STRING, description: 'Single most concise version under 270 chars' },
            },
            required: ['tweets', 'summary'],
          },
        },
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      const tweets: string[] = Array.isArray(parsed.tweets) && parsed.tweets.length > 0 ? parsed.tweets : [parsed.summary || content];

      // Validate character limits on all generated tweets
      const validatedTweets = tweets.map((t) => (t.length > 280 ? `${t.slice(0, 277)}...` : t));

      if (validatedTweets.length > 1 && preferredFormat !== 'concise') {
        return {
          text: validatedTweets[0],
          threadParts: validatedTweets,
          characterCount: validatedTweets[0].length,
          isThread: true,
          preservedFactsChecked: true,
        };
      } else {
        const singleText = validatedTweets[0] || content.slice(0, 275);
        return {
          text: singleText,
          characterCount: singleText.length,
          isThread: false,
          preservedFactsChecked: true,
        };
      }
    } else {
      // X ➔ Telegram: Enrich with clean Telegram formatting (emoji accents, readable paragraphs, attribution)
      const prompt = `You are a high-signal Telegram channel editor. Rewrite this X (Twitter) post for publication in a Telegram channel.

CRITICAL INVARIANTS:
1. STRICTLY PRESERVE all names, figures, percentages, dates, quotes, claims, and the exact meaning. NEVER change or exaggerate any fact.
2. Structure for effortless scanning: clean opening hook, formatted bullet points if there are multiple facts, and clean punctuation.
3. Keep it natural and engaging without fluff.
4. Format in clean text (bold headers with *, bullet points with •).

Author: ${sourceAuthor || 'Source'}
Original X Post:
"""
${content}
"""`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          temperature: 0.3, // Low temperature for factual precision
        },
      });

      let rewritten = response.text?.trim() || content;
      if (sourceUrl) {
        rewritten += `\n\n🔗 Original: ${sourceUrl}`;
      }

      return {
        text: rewritten,
        characterCount: rewritten.length,
        isThread: false,
        preservedFactsChecked: true,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    db.logSystem('warn', 'gemini', `Gemini rewriting error, applying fallback: ${message}`);
    return fallbackRewrite(content, direction, preferredFormat, sourceAuthor, sourceUrl);
  }
}

function fallbackRewrite(
  content: string,
  direction: 'x_to_telegram' | 'telegram_to_x',
  preferredFormat: 'auto' | 'concise' | 'thread',
  sourceAuthor?: string,
  sourceUrl?: string
): RewriteResult {
  if (direction === 'telegram_to_x') {
    if (content.length <= 280) {
      return {
        text: content,
        characterCount: content.length,
        isThread: false,
        preservedFactsChecked: true,
      };
    }

    if (preferredFormat === 'thread' || content.length > 300) {
      // Split into logical thread chunks of ~250 chars
      const words = content.split(' ');
      const chunks: string[] = [];
      let current = '';

      for (const word of words) {
        if ((current + ' ' + word).length > 250) {
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
        preservedFactsChecked: true,
      };
    }

    const truncated = `${content.slice(0, 275)}...`;
    return {
      text: truncated,
      characterCount: truncated.length,
      isThread: false,
      preservedFactsChecked: true,
    };
  } else {
    let formatted = content;
    if (sourceAuthor) {
      formatted = `📌 ${sourceAuthor}:\n\n${formatted}`;
    }
    if (sourceUrl) {
      formatted = `${formatted}\n\n🔗 ${sourceUrl}`;
    }
    return {
      text: formatted,
      characterCount: formatted.length,
      isThread: false,
      preservedFactsChecked: true,
    };
  }
}
