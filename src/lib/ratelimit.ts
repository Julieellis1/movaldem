import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

export type RateLimitWindow = `${number} s` | `${number} m`;

// Thrown when a guarded endpoint has exhausted its budget. Carries the status
// so routes can answer 429 without inspecting the message, and every message
// is the same generic string so nothing leaks about the account (SEC-06).
export class RateLimitError extends Error {
  readonly status = 429;

  constructor(message = "Too many attempts. Try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

// Call sites mix limits and windows (5/min, 5/hour, 3/hour, 10/hour), so a
// single cached limiter would serve the first config it saw to every later
// call — a 5/min limiter answering a 5/hour check. Cache one limiter per
// config instead (SEC-05).
const limiters = new Map<string, Ratelimit>();

// Local/CI fallback (single instance only): with no Upstash credentials there
// is no shared store, so an in-process counter keeps local dev, CI-without-redis
// and the test suite protected and honest.
const memory = new Map<string, { count: number; reset: number }>();

export async function rateLimit(
  key: string,
  opts: { limit: number; window: RateLimitWindow },
): Promise<{ success: boolean }> {
  if (env().UPSTASH_REDIS_REST_URL && env().UPSTASH_REDIS_REST_TOKEN) {
    const cacheKey = `${opts.limit}:${opts.window}`;
    let limiter = limiters.get(cacheKey);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(opts.limit, opts.window),
      });
      limiters.set(cacheKey, limiter);
    }
    return limiter.limit(key);
  }

  const now = Date.now();
  const win = parseInt(opts.window, 10) * 1000;
  const cur = memory.get(key);
  if (!cur || cur.reset < now) {
    memory.set(key, { count: 1, reset: now + win });
    return { success: true };
  }
  cur.count++;
  return { success: cur.count <= opts.limit };
}

// Builds a limit key from the segments that are actually present. Vercel
// always sets `x-forwarded-for` on real requests, so production keeps its
// IP-scoped buckets; server-side callers (server actions), Playwright-driven
// requests and vitest supply no IP, and an empty segment would collapse every
// caller into one bucket (or split buckets unpredictably). Those callers omit
// the IP segment and stay limited on the identifier alone (email / actorId).
export function rateLimitKey(scope: string, parts: (string | null | undefined)[]): string {
  const segments = parts
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  return [scope, ...segments].join(":");
}
