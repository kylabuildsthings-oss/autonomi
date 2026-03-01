/**
 * Rate limits for community: set username, create post, add reply.
 */

type Key = string;
const buckets = new Map<string, { count: number; resetAt: number }>();

const LIMITS = {
  community_username: { max: 5, windowMs: 60 * 60 * 1000 },
  community_post: { max: 20, windowMs: 60 * 60 * 1000 },
  community_reply: { max: 60, windowMs: 60 * 60 * 1000 },
} as const;

export type CommunityRateLimitAction = keyof typeof LIMITS;

function getKey(action: CommunityRateLimitAction, address: string, ip: string): Key {
  return `${action}:${(address || "").trim().toLowerCase()}:${(ip || "").trim() || "unknown"}`;
}

export function checkCommunityRateLimit(
  action: CommunityRateLimitAction,
  address: string,
  ip: string
): { allowed: boolean; retryAfterSec?: number } {
  const { max, windowMs } = LIMITS[action];
  const now = Date.now();
  const key = getKey(action, address, ip);
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
