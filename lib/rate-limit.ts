/**
 * Step 14 — lightweight in-memory sliding-window rate limiter.
 *
 * SCOPE: applied ONLY to /share/* (the one unauthenticated route that
 * hits Postgres on every request). Login/signup are intentionally NOT
 * covered — those are client-component flows whose traffic goes straight
 * to Supabase's hosted auth API, never touching this server, so their
 * abuse protection lives in Supabase's dashboard auth rate limits (see
 * SECURITY.md → Production checklist). (app) routes require a session
 * and are likewise out of scope.
 *
 * ⚠ KNOWN LIMITATION (documented, accepted for now):
 * state lives in-process in a Map → it does NOT survive redeploys, and
 * it does NOT share counters across multiple serverless instances in a
 * multi-instance production deploy. In that world each instance enforces
 * its own window, so the effective ceiling multiplies by instance count.
 * Verdict: a REAL mitigation for casual abuse and single-instance deploys,
 * NOT production-grade distributed limiting.
 * → Future upgrade path: a durable shared store (e.g. Upstash Redis +
 *   @upstash/ratelimit) behind the same check — deliberately no new
 *   external dependency today.
 *
 * Implementation: sliding window — per key, keep the timestamps of hits
 * inside the window; a request is rejected exactly when the window
 * already holds `limit` hits. O(limit) memory per key, opportunistic
 * sweep keeps idle keys from accumulating.
 */

const WINDOW_MS = 60_000; // 1 minute
const LIMIT = 30; // requests per key per window
const SWEEP_THRESHOLD = 5_000; // Map size that triggers an idle-key sweep

const hits = new Map<string, number[]>();

function sweep(now: number) {
  for (const [key, timestamps] of hits) {
    const active = timestamps.filter((t) => now - t < WINDOW_MS);
    if (active.length === 0) hits.delete(key);
    else hits.set(key, active);
  }
}

/** True when the key has already used its window budget (caller should
 *  return a 429); false when the hit was recorded and may proceed. */
export function rateLimitExceeded(key: string): boolean {
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

/** Best-effort client IP for keying. On edge/serverless this comes from
 *  the platform's x-forwarded-for chain (first hop = originating client);
 *  "unknown" callers share one bucket — acceptable degradation. */
export function clientKey(request: { headers: Headers }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || "unknown";
}
