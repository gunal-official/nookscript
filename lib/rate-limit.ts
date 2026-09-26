/**
 * Step 14 — sliding-window rate limiter. Store: the in-memory Map,
 * PERMANENTLY — the product decision is no third-party service
 * dependencies (an optional Upstash Redis store existed briefly in
 * Step 24 and was rejected + removed; `UPSTASH_*` is never set).
 *
 * SCOPE: applied ONLY to unauthenticated routes that hit Postgres on
 * every request — /share/* (Step 14), /invite/* (Step 15's public
 * token-probe page), /invoice/* (Step 17's public invoice forms) and
 * /api/pdf/shared/* (the public PDF download, which additionally burns
 * CPU building a document).
 * Login/signup are intentionally NOT covered — those
 * are client-component flows whose traffic goes straight to Supabase's
 * hosted auth API, never touching this server, so their abuse protection
 * lives in Supabase's dashboard auth rate limits (see SECURITY.md →
 * Production checklist). (app) routes require a session and are likewise
 * out of scope.
 *
 * SEMANTICS: sliding window — 30 requests / 60s per key. Per key, keep
 * the hits inside the window; a request is rejected exactly when the
 * window already holds `limit` hits (rejected hits are NOT recorded).
 * In-memory = timestamps in a Map with opportunistic sweeping.
 *
 * ACCEPTED LIMITATION: state does NOT survive redeploys and is NOT
 * shared across serverless instances (the effective ceiling multiplies
 * by instance count) — casual-abuse mitigation only. If a hard
 * multi-instance ceiling is ever needed, enforce it at the edge
 * (CDN/WAF) rather than adding a service (SECURITY.md).
 */

const WINDOW_MS = 60_000; // 1 minute
const LIMIT = 30; // requests per key per window
const SWEEP_THRESHOLD = 5_000; // Map size that triggers an idle-key sweep

/** URL prefixes the middleware rate-limits (all share one key space).
 *  ⚠ "/invoice/" carries its trailing slash ON PURPOSE: a bare
 *  "/invoice" prefix would also match the AUTH-REQUIRED app list at
 *  "/invoices" (startsWith collision). The public form is always
 *  /invoice/<token>, so the slashed prefix is exactly the public
 *  surface — nothing else. */
export const RATE_LIMITED_PREFIXES = [
  "/share",
  "/invite",
  "/invoice/",
  // PDF export: the PUBLIC token-gated download only. Member downloads
  // (/api/pdf/<kind>/<id>) need a session and are out of scope, exactly
  // like the rest of (app) — the prefix below cannot match them because
  // "shared" is not one of the member kinds.
  "/api/pdf/shared",
] as const;

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
  return memoryCheck(key);
}

/** Best-effort client IP for keying. On edge/serverless this comes from
 *  the platform's x-forwarded-for chain (first hop = originating client);
 *  "unknown" callers share one bucket — acceptable degradation. */
export function clientKey(request: { headers: Headers }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || "unknown";
}
