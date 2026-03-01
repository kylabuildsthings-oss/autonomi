/**
 * In-memory rate limiting by API key.
 * Uses a 1-minute fixed window; limit is per key's rate_limit tier (stored in api_keys.rate_limit).
 */

const WINDOW_MS = 60_000; // 1 minute

interface Window {
  count: number;
  windowStart: number;
}

const store = new Map<string, Window>();

function getWindow(keyId: string, now: number): Window {
  let w = store.get(keyId);
  if (!w || now - w.windowStart >= WINDOW_MS) {
    w = { count: 0, windowStart: now };
    store.set(keyId, w);
  }
  return w;
}

/**
 * Check if the key is under its rate limit and consume one request.
 * Returns true if allowed, false if rate limit exceeded.
 * limit is the key's rate_limit value (requests per minute).
 */
export function checkAndConsume(keyId: string, limit: number): boolean {
  if (limit <= 0) return false;
  const now = Date.now();
  const w = getWindow(keyId, now);
  if (w.count >= limit) return false;
  w.count += 1;
  return true;
}

/** Retry-After value (seconds) when rate limited. */
export const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;
