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
 * Detects whether the current process is running inside Google AI Studio / local preview environment.
 * Used to stop Telegram Bot polling in AI Studio so it does not conflict (409) with
 * the live production instance running on Render.
 */
export function isAiStudioEnvironment(): boolean {
  if (process.env.DISABLE_TELEGRAM_POLLING === 'true') return true;
  if (process.env.ENABLE_TELEGRAM_POLLING === 'false') return true;
  if (process.env.FORCE_RUN_BOT === 'true' || process.env.RUN_BOT_IN_DEV === 'true') return false;

  // Cloud Run / AI Studio container marker
  if (process.env.K_SERVICE && (process.env.K_SERVICE.includes('ais-') || process.env.K_SERVICE.includes('ais-dev'))) {
    return true;
  }

  // App URL marker for AI Studio preview / dev URL
  const appUrl = (process.env.APP_URL || '').toLowerCase();
  if (appUrl.includes('ais-dev') || appUrl.includes('ais-pre')) {
    return true;
  }

  // If running on Render, it is production
  if (process.env.RENDER === 'true') {
    return false;
  }

  // If in development mode (not production)
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    return true;
  }

  return false;
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
