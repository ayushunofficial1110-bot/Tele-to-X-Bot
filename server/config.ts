/**
 * Application URL and Environment Configuration
 */

export const PRODUCTION_APP_URL = 'https://tele-to-x-bot.onrender.com';
export const LOCAL_APP_URL = 'http://localhost:3000';

/**
 * Returns the public URL of the application.
 * 1. Reads process.env.APP_URL if configured.
 * 2. In production (NODE_ENV=production), always ensures a non-localhost, public URL.
 * 3. Fallbacks to https://tele-to-x-bot.onrender.com when in production.
 * 4. Localhost is retained only for local development.
 */
export function getAppUrl(): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl.length > 0) {
    const cleanUrl = envUrl.replace(/\/+$/, '');
    // Guard: never allow localhost in production or for production callbacks
    if (process.env.NODE_ENV === 'production' && (cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1'))) {
      return PRODUCTION_APP_URL;
    }
    return cleanUrl;
  }

  // Default to production Render URL
  return PRODUCTION_APP_URL;
}

/**
 * Returns a valid URL for Telegram inline keyboard buttons.
 * Telegram API strictly rejects 'localhost' and '127.0.0.1' with:
 * "Bad Request: inline keyboard button URL '...' is invalid: Wrong HTTP URL"
 * This function guarantees that Telegram button URLs are always valid public HTTP/HTTPS URLs.
 */
export function getTelegramButtonUrl(pathWithQuery: string = ''): string {
  const base = getAppUrl();
  const normalizedPath = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;

  // Telegram rejects localhost in all environments for inline buttons
  if (base.includes('localhost') || base.includes('127.0.0.1')) {
    return `${PRODUCTION_APP_URL}${normalizedPath}`;
  }

  return `${base}${normalizedPath}`;
}
