/**
 * Unit tests for lib/email/crypto.ts (mailbox token cryptography).
 * Run with: npm test
 *
 * AES-256-GCM round-trip, wrong-key / tampered-payload rejection,
 * payload format, and key validation (EMAIL_TOKEN_ENCRYPTION_KEY =
 * 64 hex chars).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  hasTokenKey,
  tokenDecrypt,
  tokenEncrypt,
} from "../../lib/email/crypto.ts";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);

describe("tokenEncrypt / tokenDecrypt", () => {
  test("round-trips a token string", () => {
    const plain = "ya29.a0AfH6SM...refresh-looking-token";
    const payload = tokenEncrypt(plain, KEY);
    assert.equal(tokenDecrypt(payload, KEY), plain);
  });

  test("payload has the v1 four-part shape", () => {
    const payload = tokenEncrypt("x", KEY);
    const parts = payload.split(".");
    assert.equal(parts.length, 4);
    assert.equal(parts[0], "v1");
  });

  test("two encryptions of the same token differ (random IV)", () => {
    assert.notEqual(tokenEncrypt("same", KEY), tokenEncrypt("same", KEY));
  });

  test("wrong key throws", () => {
    const payload = tokenEncrypt("secret", KEY);
    assert.throws(() => tokenDecrypt(payload, OTHER_KEY), /incorrect|auth|tag|Decryption/i);
  });

  test("tampered ciphertext throws", () => {
    const payload = tokenEncrypt("secret", KEY);
    const parts = payload.split(".");
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith("AA") ? "BB" : "AA");
    assert.throws(() => tokenDecrypt(parts.join("."), KEY));
  });

  test("unrecognized format throws", () => {
    assert.throws(() => tokenDecrypt("v0.a.b.c", KEY), /Unrecognized/);
    assert.throws(() => tokenDecrypt("garbage", KEY), /Unrecognized/);
  });
});

describe("key validation", () => {
  test("hasTokenKey accepts exactly 64 hex chars", () => {
    assert.equal(hasTokenKey(KEY), true);
    assert.equal(hasTokenKey("0123456789abcdef0123456789abcdef0123456789abcdef0123456789ABCDEF"), true);
    assert.equal(hasTokenKey("a".repeat(62)), false);
    assert.equal(hasTokenKey("a".repeat(66)), false);
    assert.equal(hasTokenKey("z".repeat(64)), false);
    assert.equal(hasTokenKey(undefined), false);
  });

  test("tokenEncrypt rejects a wrong-length key", () => {
    assert.throws(() => tokenEncrypt("x", "a".repeat(62)), /64 hex/);
    assert.throws(() => tokenEncrypt("x", "zz".repeat(32)), /64 hex/);
  });
});
