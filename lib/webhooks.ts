/**
 * Outbound webhooks (Phase: events/webhooks foundation) — PURE helpers:
 * HMAC signing/verification (Stripe-style scheme), URL normalization
 * (SSRF guard), retry schedule, and delivery body/header builders.
 * Zero dependencies: node:crypto only. Impure dispatch lives in
 * lib/webhook-dispatch.ts.
 *
 * Signature scheme (header `X-NookScript-Signature`):
 *   signed_payload = `${timestampSec}.${rawBody}`
 *   v1 = hex(HMAC_SHA256(signing_secret, signed_payload))
 *   header = `t=${timestampSec},v1=${v1}` (multiple v1= values allowed
 *   for rotation; every candidate is checked).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-nookscript-signature";
export const EVENT_HEADER = "x-nookscript-event";
export const DELIVERY_HEADER = "x-nookscript-delivery";
/** Signature freshness window for inbound verification (seconds). */
export const SIGNATURE_TOLERANCE_SEC = 300;
/** Attempt schedule: 1 immediate try + retries after these backoffs. */
export const RETRY_BACKOFF_MS: readonly number[] = [15_000, 60_000];

export function generateSigningSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function computeSignature(
  secret: string,
  timestampSec: number,
  raw: string
): string {
  return createHmac("sha256", secret)
    .update(`${timestampSec}.${raw}`)
    .digest("hex");
}

export function signPayload(
  secret: string,
  timestampSec: number,
  raw: string
): string {
  return `t=${timestampSec},v1=${computeSignature(secret, timestampSec, raw)}`;
}

export function verifySignedPayload(input: {
  secret: string;
  header: string;
  raw: string;
  nowSec: number;
  toleranceSec?: number;
}): { ok: true } | { ok: false; reason: "malformed" | "stale" | "mismatch" } {
  const parts = input.header.split(",").map((p) => p.trim());
  let timestampSec: number | null = null;
  const candidates: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === "t") {
      const t = Number(value);
      if (!Number.isFinite(t)) return { ok: false, reason: "malformed" };
      timestampSec = t;
    } else if (key === "v1") {
      candidates.push(value);
    }
  }
  if (timestampSec === null || candidates.length === 0) {
    return { ok: false, reason: "malformed" };
  }
  const tolerance = input.toleranceSec ?? SIGNATURE_TOLERANCE_SEC;
  if (Math.abs(input.nowSec - timestampSec) > tolerance) {
    return { ok: false, reason: "stale" };
  }
  const expected = Buffer.from(
    computeSignature(input.secret, timestampSec, input.raw),
    "utf8"
  );
  for (const candidate of candidates) {
    const got = Buffer.from(candidate, "utf8");
    if (got.length === expected.length && timingSafeEqual(got, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "mismatch" };
}

/**
 * SSRF guard: https is required; plain http is allowed only for loopback
 * hosts (local development receivers). Everything else is rejected before
 * any request is ever attempted.
 */
export function normalizeWebhookUrl(
  raw: string
): { ok: true; url: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Enter a valid absolute URL." };
  }
  const loopback =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "https:") {
    return { ok: true, url: parsed.toString() };
  }
  if (parsed.protocol === "http:" && loopback) {
    return { ok: true, url: parsed.toString() };
  }
  return {
    ok: false,
    error: "Webhook URLs must use https (http is allowed for localhost only).",
  };
}

/** Attempt n (1-based) → ms to wait before the NEXT attempt, or null when
 *  the schedule is exhausted (3 attempts total). */
export function backoffForAttempt(attempt: number): number | null {
  const idx = attempt - 1;
  return idx >= 0 && idx < RETRY_BACKOFF_MS.length ? RETRY_BACKOFF_MS[idx] : null;
}

export function buildDeliveryBody(row: {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}): string {
  return JSON.stringify({
    id: row.id,
    event_type: row.event_type,
    payload: row.payload,
    created_at: row.created_at,
  });
}

export function buildDeliveryHeaders(
  body: string,
  secret: string,
  timestampSec: number,
  deliveryId: string,
  eventType: string
): Record<string, string> {
  return {
    "content-type": "application/json",
    [SIGNATURE_HEADER]: signPayload(secret, timestampSec, body),
    [EVENT_HEADER]: eventType,
    [DELIVERY_HEADER]: deliveryId,
  };
}
