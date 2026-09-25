/**
 * Unit tests for lib/webhooks.ts — the outbound webhook pure core: HMAC
 * scheme (cross-checked against node:crypto directly), tamper/stale
 * rejection, the SSRF URL guard, the retry schedule, and the delivery
 * envelope shape consumers rely on.
 */

import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  backoffForAttempt,
  buildDeliveryBody,
  buildDeliveryHeaders,
  computeSignature,
  normalizeWebhookUrl,
  RETRY_BACKOFF_MS,
  signPayload,
  verifySignedPayload,
} from "../../lib/webhooks.ts";

const SECRET = "whsec_test_secret";
const RAW = JSON.stringify({ id: "e1", event_type: "invoice.paid" });
const NOW = 1_764_000_000;

describe("HMAC scheme (Stripe-style t/v1 over `${ts}.${body}`)", () => {
  test("computeSignature matches a direct node:crypto HMAC", () => {
    const expected = createHmac("sha256", SECRET)
      .update(`${NOW}.${RAW}`)
      .digest("hex");
    assert.equal(computeSignature(SECRET, NOW, RAW), expected);
  });

  test("signPayload/verify round-trips", () => {
    const header = signPayload(SECRET, NOW, RAW);
    assert.match(header, /^t=\d+,v1=[0-9a-f]{64}$/);
    assert.deepEqual(
      verifySignedPayload({ secret: SECRET, header, raw: RAW, nowSec: NOW }),
      { ok: true }
    );
  });

  test("verify rejects tampered bodies and wrong secrets", () => {
    const header = signPayload(SECRET, NOW, RAW);
    assert.deepEqual(
      verifySignedPayload({ secret: SECRET, header, raw: RAW + "x", nowSec: NOW }),
      { ok: false, reason: "mismatch" }
    );
    assert.deepEqual(
      verifySignedPayload({ secret: "whsec_other", header, raw: RAW, nowSec: NOW }),
      { ok: false, reason: "mismatch" }
    );
  });

  test("verify rejects stale timestamps outside the tolerance", () => {
    const header = signPayload(SECRET, NOW, RAW);
    assert.deepEqual(
      verifySignedPayload({
        secret: SECRET,
        header,
        raw: RAW,
        nowSec: NOW + 301,
      }),
      { ok: false, reason: "stale" }
    );
    assert.deepEqual(
      verifySignedPayload({
        secret: SECRET,
        header,
        raw: RAW,
        nowSec: NOW + 299,
      }),
      { ok: true }
    );
  });

  test("verify accepts any matching v1 among rotation candidates", () => {
    const good = computeSignature(SECRET, NOW, RAW);
    const header = `t=${NOW},v1=deadbeef,v1=${good}`;
    assert.deepEqual(
      verifySignedPayload({ secret: SECRET, header, raw: RAW, nowSec: NOW }),
      { ok: true }
    );
  });

  test("verify rejects malformed headers", () => {
    for (const header of ["", "v1=abc", "t=notanumber,v1=abc", "garbage"]) {
      const result = verifySignedPayload({
        secret: SECRET,
        header,
        raw: RAW,
        nowSec: NOW,
      });
      assert.deepEqual(result, { ok: false, reason: "malformed" }, header);
    }
  });
});

describe("normalizeWebhookUrl (SSRF guard)", () => {
  test("https everywhere; http only for loopback", () => {
    assert.deepEqual(normalizeWebhookUrl("https://example.com/h"), {
      ok: true,
      url: "https://example.com/h",
    });
    assert.equal(normalizeWebhookUrl("http://localhost:8787/h").ok, true);
    assert.equal(normalizeWebhookUrl("http://127.0.0.1/h").ok, true);
    assert.equal(normalizeWebhookUrl("http://example.com/h").ok, false);
    assert.equal(normalizeWebhookUrl("ftp://example.com/h").ok, false);
    assert.equal(normalizeWebhookUrl("not a url").ok, false);
    assert.equal(normalizeWebhookUrl("  ").ok, false);
    assert.equal(
      normalizeWebhookUrl("http://169.254.169.254/latest/meta-data").ok,
      false,
      "cloud metadata endpoints must never qualify"
    );
  });
});

describe("retry schedule + delivery envelope", () => {
  test("3 attempts: immediate, +15s, +60s, then done", () => {
    assert.deepEqual([...RETRY_BACKOFF_MS], [15_000, 60_000]);
    assert.equal(backoffForAttempt(1), 15_000);
    assert.equal(backoffForAttempt(2), 60_000);
    assert.equal(backoffForAttempt(3), null);
  });

  test("buildDeliveryBody is the documented envelope", () => {
    const body = buildDeliveryBody({
      id: "e1",
      event_type: "invoice.paid",
      payload: { invoice_id: "i1" },
      created_at: "2026-09-26T10:00:00Z",
    });
    assert.deepEqual(JSON.parse(body), {
      id: "e1",
      event_type: "invoice.paid",
      payload: { invoice_id: "i1" },
      created_at: "2026-09-26T10:00:00Z",
    });
  });

  test("buildDeliveryHeaders signs the body and stamps ids", () => {
    const headers = buildDeliveryHeaders(RAW, SECRET, NOW, "d1", "invoice.paid");
    assert.equal(headers["content-type"], "application/json");
    assert.equal(headers["x-nookscript-event"], "invoice.paid");
    assert.equal(headers["x-nookscript-delivery"], "d1");
    assert.equal(headers["x-nookscript-signature"], signPayload(SECRET, NOW, RAW));
  });
});
