/**
 * Unit tests for lib/rate-limit.ts — the permanent in-memory limiter's
 * public contract (Step 14): the exact prefix surface (trailing slash on
 * /invoice/ is load-bearing) and clientKey's identity semantics.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { clientKey, RATE_LIMITED_PREFIXES } from "../../lib/rate-limit.ts";

describe("RATE_LIMITED_PREFIXES", () => {
  test("exact public surface, /invoice/ slashed on purpose", () => {
    assert.deepEqual([...RATE_LIMITED_PREFIXES], ["/share", "/invite", "/invoice/"]);
    assert.ok(!RATE_LIMITED_PREFIXES.includes("/invoices" as never), "never the authed app list");
  });
});

describe("clientKey", () => {
  const req = (ip: string) => ({
    headers: new Headers({ "x-forwarded-for": ip }),
  });

  test("pure: same headers → same key, different client → different key", () => {
    const a1 = clientKey(req("203.0.113.7"));
    const a2 = clientKey(req("203.0.113.7"));
    const b = clientKey(req("198.51.100.9"));
    assert.equal(a1, a2);
    assert.notEqual(a1, b);
  });

  test("survives headers with no forwarding information", () => {
    const bare = clientKey({ headers: new Headers() });
    assert.equal(typeof bare, "string");
    assert.ok(bare.length > 0);
    assert.equal(bare, clientKey({ headers: new Headers() }));
  });
});
