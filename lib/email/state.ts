/**
 * Signed OAuth `state` for mailbox connections (future-list item
 * "Gmail/Outlook"). The connect route signs
 * `{u: userId, w: workspaceId, p: provider, n: nonce}` and the callback
 * route verifies it — so a leaked/tampered state can never route
 * someone else's tokens into the wrong workspace (and the provider is
 * part of the claim, so a gmail code can't be redeemed as outlook).
 *
 * Key: AUTH_SECRET (the @supabase/ssr cookie secret — always present in
 * a working deployment), falling back to SUPABASE_SERVICE_ROLE_KEY (the
 * callback needs it anyway to persist the account). Neither present →
 * buildOAuthState returns null and the connect route shows its
 * "not configured" state.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function stateKey(): string | null {
  return process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function buildOAuthState(
  userId: string,
  workspaceId: string,
  provider: string
): string | null {
  const key = stateKey();
  if (!key) return null;
  const payload = Buffer.from(
    JSON.stringify({
      u: userId,
      w: workspaceId,
      p: provider,
      n: randomBytes(16).toString("base64url"),
    })
  ).toString("base64url");
  const mac = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

/** Verify state for (userId, workspaceId). Returns the provider on
 *  success, null on any failure (missing key, bad MAC, claim mismatch). */
export function verifyOAuthState(
  state: string | null | undefined,
  userId: string,
  workspaceId: string
): string | null {
  const key = stateKey();
  if (!key || !state || !state.includes(".")) return null;
  const dot = state.lastIndexOf(".");
  const payload = state.slice(0, dot);
  const given = Buffer.from(state.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", key).update(payload).digest();
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (obj.u !== userId || obj.w !== workspaceId) return null;
    return typeof obj.p === "string" ? obj.p : null;
  } catch {
    return null;
  }
}
