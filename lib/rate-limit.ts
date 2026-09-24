/**
 * Step 14 — sliding-window rate limiter; Step 24 — optional shared
 * (Upstash) store behind the same check.
 *
 * SCOPE: applied ONLY to unauthenticated routes that hit Postgres on
 * every request — /share/* (Step 14), /invite/* (Step 15's public
 * token-probe page), and /invoice/* (Step 17's public invoice forms).
 * Login/signup are intentionally NOT covered — those
 * are client-component flows whose traffic goes straight to Supabase's
 * hosted auth API, never touching this server, so their abuse protection
 * lives in Supabase's dashboard auth rate limits (see SECURITY.md →
 * Production checklist). (app) routes require a session and are likewise
 * out of scope.
 *
 * STORES (same sliding-window semantics — 30 requests / 60s per key —
 * pick one per environment):
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set → the window
 *     lives in Upstash Redis (lib/upstash: one EVAL per check), so
 *     counters survive redeploys and are SHARED across instances;
 *   - either var unset → the Step 14 in-memory Map (silent — dev mode
 *     unchanged): does NOT survive redeploys and does NOT share counters
 *     across serverless instances (effective ceiling multiplies by
 *     instance count) — documented, accepted fallback;
 *   - Upstash configured but UNREACHABLE / erroring → fall back to the
 *     in-memory Map so a store outage neither takes the routes down nor
 *     opens them wide (one console.warn per failure).
 *
 * Implementation: sliding window — per key, keep the hits inside the
 * window; a request is rejected exactly when the window already holds
 * `limit` hits (rejected hits are NOT recorded). In-memory = timestamps
 * in a Map with opportunistic sweeping; Upstash = a sorted set per key
 * pruned/scored server-side by SLIDING_WINDOW_LUA (atomic — the check
 * and the record are one EVAL).
 */

import { upstashCommand, upstashConfigured } from "@/lib/upstash";

const WINDOW_MS = 60_000; // 1 minute
const LIMIT = 30; // requests per key per window
const SWEEP_THRESHOLD = 5_000; // Map size that triggers an idle-key sweep

/** URL prefixes the middleware rate-limits (all share one key space).
 *  ⚠ "/invoice/" carries its trailing slash ON PURPOSE: a bare
 *  "/invoice" prefix would also match the AUTH-REQUIRED app list at
 *  "/invoices" (startsWith collision). The public form is always
 *  /invoice/<token>, so the slashed prefix is exactly the public
 *  surface — nothing else. */
export const RATE_LIMITED_PREFIXES = ["/share", "/invite", "/invoice/"] as const;

/** KEYS[1] = bucket; ARGV = now_ms, window_ms, limit, member.
 *  Returns 1 = recorded & allowed, 0 = window already full.
 *  Prune bound is `score <= now - window`, matching the in-memory test
 *  `now - t < WINDOW_MS` exactly (hits age out at the same instant). */
const SLIDING_WINDOW_LUA = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
if redis.call('ZCARD', KEYS[1]) >= limit then
  return 0
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return 1
`;

const hits = new Map<string, number[]>();

function sweep(now: number) {
  // Map#forEach (not for..of) — the project targets pre-es2015 iteration
  // support, so the iterator protocol isn't available at the type level.
  hits.forEach((timestamps, key) => {
    const active = timestamps.filter((t) => now - t < WINDOW_MS);
    if (active.length === 0) hits.delete(key);
    else hits.set(key, active);
  });
}

/** The Step 14 in-memory window. Also the store-outage fallback. */
function memoryCheck(key: string): boolean {
  const now = Date.now();
  if (hits.size > SWEEP_THRESHOLD) sweep(now);

  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= LIMIT) {
    hits.set(key, timestamps); // persist pruned copy; do NOT record this hit
    return true;
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return false;
}

/** True when the key has already used its window budget (caller should
 *  return a 429); false when the hit was recorded and may proceed. */
export async function rateLimitExceeded(key: string): Promise<boolean> {
  if (!upstashConfigured()) return memoryCheck(key);

  // Unique member per hit — same-ms hits must not dedupe inside the
  // sorted set (score = arrival time; identity is a tiebreaker only).
  const now = Date.now();
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;
  try {
    const result = await upstashCommand([
      "EVAL",
      SLIDING_WINDOW_LUA,
      "1",
      key,
      String(now),
      String(WINDOW_MS),
      String(LIMIT),
      member,
    ]);
    if (result !== 0 && result !== 1) {
      throw new Error(`unexpected EVAL result: ${String(result)}`);
    }
    return result === 0;
  } catch (error) {
    console.warn(
      "[rate-limit] upstash check failed — using in-memory window:",
      error instanceof Error ? error.message : error
    );
    return memoryCheck(key);
  }
}

/** Best-effort client IP for keying. On edge/serverless this comes from
 *  the platform's x-forwarded-for chain (first hop = originating client);
 *  "unknown" callers share one bucket — acceptable degradation. */
export function clientKey(request: { headers: Headers }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || "unknown";
}
