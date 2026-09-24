/**
 * Minimal Upstash Redis REST client (Step 24). ONE command shape is
 * needed by the rate limiter (EVAL of its sliding-window script), and
 * Upstash's REST API is a single HTTPS POST of a JSON command array —
 * so this is raw fetch, deliberately NO @upstash/* dependency (same
 * doctrine as the SMTP revision: smallest reasonable option).
 *
 * Env (both required for the shared store to engage):
 *   UPSTASH_REDIS_REST_URL   — the database's REST URL (https://….upstash.io)
 *   UPSTASH_REDIS_REST_TOKEN — its REST token (read-write)
 *
 * Edge-runtime safe (middleware is an Edge Runtime consumer): fetch +
 * AbortSignal only, no Node builtins. Throws on ANY failure (network,
 * timeout, non-2xx, error body, non-JSON) — callers decide the
 * fail-safe; this layer never swallows.
 */

const REQUEST_TIMEOUT_MS = 1_500;

export function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/** Run one Redis command via the REST API; returns the `result` value.
 *  Example: upstashCommand(["EVAL", script, "1", key, "…"]) → 0 | 1 */
export async function upstashCommand(
  command: (string | number)[]
): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let body: { result?: unknown; error?: string } | null = null;
  try {
    body = (await res.json()) as { result?: unknown; error?: string };
  } catch {
    throw new Error(`upstash returned non-JSON (status ${res.status})`);
  }
  if (!res.ok || typeof body?.error === "string") {
    throw new Error(body?.error ?? `upstash responded ${res.status}`);
  }
  return body.result;
}
