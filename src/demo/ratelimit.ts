/**
 * Rate limiting for the public demo endpoint.
 *
 * Two layers:
 *   1. Per-IP sliding window (10 runs/hour) — stops one visitor hammering it.
 *   2. Global daily budget (200 runs/day) — caps total spend no matter what.
 *
 * Fail-closed in production: if Upstash env vars are missing on a deployed
 * instance, requests are refused rather than silently unmetered.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const HAS_UPSTASH = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

const redis = HAS_UPSTASH ? Redis.fromEnv() : null;

const perIp = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "issuegraph:ip",
    })
  : null;

const GLOBAL_DAILY_LIMIT = Number(process.env.DEMO_DAILY_LIMIT ?? "200");

export type LimitResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

export async function checkLimits(ip: string): Promise<LimitResult> {
  if (!redis || !perIp) {
    // Local dev without Upstash: allow. Deployed without Upstash: refuse.
    if (process.env.NODE_ENV === "production") {
      return { ok: false, status: 503, message: "Rate limiting is not configured." };
    }
    return { ok: true };
  }

  const { success } = await perIp.limit(ip);
  if (!success) {
    return {
      ok: false,
      status: 429,
      message: "Rate limit reached (10 runs/hour). Try again later.",
    };
  }

  // Global daily counter — one key per UTC day, expires after 48h.
  const day = new Date().toISOString().slice(0, 10);
  const key = `issuegraph:daily:${day}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60 * 60 * 48);
  if (count > GLOBAL_DAILY_LIMIT) {
    return {
      ok: false,
      status: 429,
      message: "The demo hit its daily budget. Come back tomorrow.",
    };
  }

  return { ok: true };
}
