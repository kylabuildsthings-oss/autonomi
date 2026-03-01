/**
 * In-memory rate limits for SMS endpoints to prevent abuse.
 * Per address and per IP; resets on server restart.
 */

type Key = string;
const buckets = new Map<string, { count: number; resetAt: number }>();

const LIMITS = {
  register: { max: 5, windowMs: 60 * 60 * 1000 },   // 5 per hour per key
  preferences: { max: 30, windowMs: 60 * 60 * 1000 }, // 30 per hour
  test: { max: 3, windowMs: 10 * 60 * 1000 },       // 3 test SMS per 10 min per key
} as const;

export type SmsRateLimitAction = keyof typeof LIMITS;

function getKey(action: SmsRateLimitAction, address: string, ip: string): Key {
  const a = (address || "").trim().toLowerCase();
  const p = (ip || "").trim() || "unknown";
  return `${action}:${a}:${p}`;
}

function checkLimit(key: Key, action: SmsRateLimitAction): { allowed: boolean; retryAfterSec?: number } {
  const { max, windowMs } = LIMITS[action];
  const now = Date.now();
  const b = buckets.get(key);
  if (!b) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (now >= b.resetAt) {
    b.count = 1;
    b.resetAt = now + windowMs;
    return { allowed: true };
  }
  if (b.count >= max) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { allowed: true };
}

/**
 * Returns true if the request is within limits; otherwise false and retryAfterSec.
 */
export function checkSmsRateLimit(
  action: SmsRateLimitAction,
  address: string,
  ip: string
): { allowed: boolean; retryAfterSec?: number } {
  return checkLimit(getKey(action, address, ip), action);
}
