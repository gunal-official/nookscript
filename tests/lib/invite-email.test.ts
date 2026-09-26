/**
 * Unit tests for lib/invite-email.ts — the safety contract that keeps
 * invite creation working with no mail service configured: missing or
 * invalid SMTP_* env ALWAYS yields a silent `not-configured` skip and
 * never touches the network or throws. (Live delivery is integration
 * territory — plain SMTP, never exercised in tests.)
 */

import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { sendInviteEmail } from "../../lib/invite-email.ts";

const KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;
const saved = new Map<string, string | undefined>();
for (const k of KEYS) saved.set(k, process.env[k]);

const clearAll = () => {
  for (const k of KEYS) delete process.env[k];
};

after(() => {
  for (const k of KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const input = {
  to: "new@example.com",
  workspaceName: "Atelier North",
  inviterName: "Maya",
  inviteUrl: "https://nookscript.dev/invite/tok",
  expiresAt: new Date("2026-10-03T12:00:00Z"),
};

describe("sendInviteEmail — silent skip without SMTP", () => {
  test("zero SMTP env → not-configured, never throws", async () => {
    clearAll();
    const result = await sendInviteEmail(input);
    assert.deepEqual(result, { ok: false, reason: "not-configured" });
  });

  test("all five must be set: any single missing still skips", async () => {
    for (const missing of KEYS) {
      clearAll();
      for (const k of KEYS) {
        if (k === missing) continue;
        process.env[k] = k === "SMTP_PORT" ? "587" : "x";
      }
      const result = await sendInviteEmail(input);
      assert.deepEqual(
        result,
        { ok: false, reason: "not-configured" },
        `missing ${missing}`
      );
    }
  });

  test("invalid port is treated as unconfigured (no transport is built)", async () => {
    for (const port of ["abc", "0", "70000", ""]) {
      clearAll();
      process.env.SMTP_HOST = "smtp.example.com";
      process.env.SMTP_PORT = port;
      process.env.SMTP_USER = "u";
      process.env.SMTP_PASS = "p";
      process.env.SMTP_FROM = "NookScript <hi@example.com>";
      const result = await sendInviteEmail(input);
      assert.deepEqual(result, { ok: false, reason: "not-configured" }, `port ${port}`);
    }
  });
});
