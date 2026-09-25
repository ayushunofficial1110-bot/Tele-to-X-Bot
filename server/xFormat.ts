/**
 * Utility functions for X/Twitter identifier and URL formatting.
 */

/**
 * Checks whether an input string is an X (Twitter) URL (profile, post, or web link).
 */
export function isXUrl(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const cleaned = input.trim().replace(/^<|>$/g, '').replace(/^\(|\)$/g, '');
  return /^(?:https?:\/\/)?(?:(?:[a-zA-Z0-9-]+\.)?)*(?:twitter\.com|x\.com)\/[^\s]+/i.test(cleaned);
}

/**
 * Normalizes an X input:
 * - If it is an X/Twitter URL (e.g. https://x.com/OpenAI or twitter.com/user/status/123),
 *   preserve it as a proper clickable https://x.com/... URL.
 *   NEVER prepend '@' or format as a Telegram @username!
 * - If it is a handle or username (e.g. OpenAI or @OpenAI), format as a proper clickable https://x.com/... URL!
 *   X/Twitter source links must NEVER be transformed into Telegram @username syntax!
 */
export function formatXInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  const cleaned = input.trim().replace(/^<|>$/g, '').replace(/^\(|\)$/g, '');

  if (isXUrl(cleaned)) {
    let url = cleaned;
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    // Normalize to https://x.com/ while preserving the full path, post status, query, etc.
    // Also safely strip optional @ directly after domain (e.g. x.com/@user -> x.com/user)
    url = url.replace(/^https?:\/\/(?:(?:[a-zA-Z0-9-]+\.)?)*(?:twitter\.com|x\.com)\/@?/i, 'https://x.com/');
    return url;
  }

  // If a username/handle was provided (e.g. @OpenAI or OpenAI), format as a clickable https://x.com/... URL
  // NEVER format an X/Twitter identifier as a Telegram-style @username!
  const rawUsername = cleaned.replace(/^@+/, '').trim();
  if (rawUsername.length > 0) {
    return `https://x.com/${rawUsername}`;
  }

  return '';
}

/**
 * Extracts the raw username from an X handle or X URL for API queries.
 */
export function extractXUsername(input: string): string {
  if (!input || typeof input !== 'string') return '';
  const cleaned = input.trim().replace(/^<|>$/g, '').replace(/^\(|\)$/g, '');
  const urlMatch = cleaned.match(
    /(?:https?:\/\/)?(?:(?:[a-zA-Z0-9-]+\.)?)*(?:twitter\.com|x\.com)\/@?([a-zA-Z0-9_]{1,25})/i
  );
  if (urlMatch) {
    return urlMatch[1];
  }
  return cleaned.replace(/^@+/, '').trim();
}

/**
 * Returns the standardized bridge display name, ensuring X/Twitter sources are always proper clickable URLs.
 */
export function getBridgeDisplayName(auto: {
  direction?: string;
  source: string;
  destination: string;
  name?: string;
}): string {
  const isXToTg = auto.direction === 'x_to_telegram';
  const cleanSource = isXToTg ? formatXInput(auto.source) : auto.source;
  const cleanDestination = !isXToTg ? formatXInput(auto.destination) : auto.destination;
  return `${cleanSource} ➔ ${cleanDestination}`;
}
