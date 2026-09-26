/**
 * Unit tests for lib/email/state.ts (signed OAuth state).
 * Run with: npm test
 *
 * Round-trip (provider claim survives), tampered MAC rejection, claim
 * mismatch (wrong user/workspace) rejection, and no-key → null (the
 * connect route's "not configured" state).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildOAuthState, verifyOAuthState } from "../../lib/email/state.ts";

const KEY = "stub-state-secret";
const USER = "user-1";
const WS = "ws-1";

function withKey(fn: () => void | Promise<void>) {
  const saved = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = KEY;
  return Promise.resolve(fn()).finally(() => {
    if (saved === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = saved;
  });
}

describe("buildOAuthState / verifyOAuthState", () => {
  test("round-trips the provider claim", async () => {
    await withKey(async () => {
      const state = buildOAuthState(USER, WS, "gmail");
      assert.ok(state);
      assert.equal(verifyOAuthState(state, USER, WS), "gmail");
    });
  });

  test("rejects a tampered MAC", async () => {
    await withKey(async () => {
      const state = buildOAuthState(USER, WS, "gmail")!;
      const [payload, mac] = state.split(".");
      const flipped = mac.slice(0, -2) + (mac.endsWith("AA") ? "BB" : "AA");
      assert.equal(verifyOAuthState(`${payload}.${flipped}`, USER, WS), null);
    });
  });

  test("rejects a state built for another user or workspace", async () => {
    await withKey(async () => {
      const state = buildOAuthState(USER, WS, "outlook")!;
      assert.equal(verifyOAuthState(state, "user-OTHER", WS), null);
      assert.equal(verifyOAuthState(state, USER, "ws-OTHER"), null);
    });
  });

  test("rejects garbage / missing state", async () => {
    await withKey(async () => {
      assert.equal(verifyOAuthState(null, USER, WS), null);
      assert.equal(verifyOAuthState("noperiod", USER, WS), null);
      assert.equal(verifyOAuthState("a.b.c", USER, WS), null);
    });
  });

  test("no key → build returns null (connect shows not-configured)", async () => {
    const saved = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    const savedService = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      assert.equal(buildOAuthState(USER, WS, "gmail"), null);
      assert.equal(verifyOAuthState("x.y", USER, WS), null);
    } finally {
      if (saved === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = saved;
      if (savedService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = savedService;
    }
  });
});
