/**
 * Unit tests for lib/email/oauth.ts (mailbox OAuth plumbing).
 * Run with: npm test
 *
 * Exact auth-URL shapes (scopes/params per provider), the authorization-
 * code exchange (endpoint + form body + token parse), error pass-through,
 * refresh, best-effort revocation, and providerEnv resolution.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_AZURE_TENANT,
  GMAIL_SCOPE,
  OUTLOOK_SCOPE,
  exchangeCode,
  gmailAuthUrl,
  outlookAuthUrl,
  providerEnv,
  refreshAccessToken,
  revokeToken,
} from "../../lib/email/oauth.ts";

const REDIRECT = "https://app.example.com/api/email/callback";
const STATE = "state-123";

type FakeResult = { status: number; body?: unknown };
function fakeFetch(handler: (url: string, init?: RequestInit) => FakeResult) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = handler(url, init);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { f, calls };
}

const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
] as const;

async function withEnv(
  env: Record<string, string>,
  fn: () => void | Promise<void>
) {
  const saved = ENV_KEYS.map((k) => [k, process.env[k]] as const);
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    await fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("auth URL builders", () => {
  test("gmailAuthUrl: google v2 authorize with readonly scope + offline", () => {
    const u = new URL(gmailAuthUrl("gc-id", REDIRECT, STATE));
    assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("client_id"), "gc-id");
    assert.equal(u.searchParams.get("redirect_uri"), REDIRECT);
    assert.equal(u.searchParams.get("scope"), GMAIL_SCOPE);
    assert.equal(u.searchParams.get("state"), STATE);
    assert.equal(u.searchParams.get("access_type"), "offline");
    assert.equal(u.searchParams.get("prompt"), "consent");
  });

  test("outlookAuthUrl: v2 authorize under the tenant with Mail.Read", () => {
    const u = new URL(outlookAuthUrl("az-id", "72f988bf", REDIRECT, STATE));
    assert.equal(u.origin, "https://login.microsoftonline.com");
    assert.equal(u.pathname, "/72f988bf/oauth2/v2.0/authorize");
    assert.equal(u.searchParams.get("client_id"), "az-id");
    assert.equal(u.searchParams.get("scope"), `${OUTLOOK_SCOPE} offline_access`);
    assert.equal(u.searchParams.get("state"), STATE);
  });

  test("DEFAULT_AZURE_TENANT is 'common'", () => {
    assert.equal(DEFAULT_AZURE_TENANT, "common");
  });
});

describe("providerEnv", () => {
  test("gmail pair from GOOGLE_*", async () => {
    await withEnv(
      { GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs" },
      () => {
        assert.deepEqual(providerEnv("gmail"), { clientId: "g", clientSecret: "gs" });
      }
    );
  });

  test("missing half of the pair → null (button shows configure state)", async () => {
    await withEnv({ GOOGLE_CLIENT_ID: "g" }, () => {
      assert.equal(providerEnv("gmail"), null);
    });
    await withEnv({ AZURE_CLIENT_SECRET: "s" }, () => {
      assert.equal(providerEnv("outlook"), null);
    });
  });

  test("outlook tenant defaults to common, honors AZURE_TENANT_ID", async () => {
    await withEnv(
      { AZURE_CLIENT_ID: "a", AZURE_CLIENT_SECRET: "as" },
      () => {
        assert.equal(providerEnv("outlook")?.tenant, "common");
      }
    );
    await withEnv(
      { AZURE_CLIENT_ID: "a", AZURE_CLIENT_SECRET: "as", AZURE_TENANT_ID: "t-1" },
      () => {
        assert.equal(providerEnv("outlook")?.tenant, "t-1");
      }
    );
  });
});

describe("exchangeCode", () => {
  test("gmail: posts the exact form to the Google token endpoint", async () => {
    const { f, calls } = fakeFetch(() => ({
      status: 200,
      body: { access_token: "at", refresh_token: "rt", expires_in: 3599, email: "ops@studio.com" },
    }));
    const result = await exchangeCode({
      provider: "gmail",
      code: "4/abc",
      clientId: "gc-id",
      clientSecret: "gc-secret",
      redirectUri: REDIRECT,
      fetchImpl: f,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
    const form = new URLSearchParams(String(calls[0].init?.body));
    assert.equal(form.get("code"), "4/abc");
    assert.equal(form.get("client_id"), "gc-id");
    assert.equal(form.get("client_secret"), "gc-secret");
    assert.equal(form.get("redirect_uri"), REDIRECT);
    assert.equal(form.get("grant_type"), "authorization_code");
    assert.equal(form.get("scope"), GMAIL_SCOPE);
    assert.equal(result.accessToken, "at");
    assert.equal(result.refreshToken, "rt");
    assert.equal(result.email, "ops@studio.com");
    assert.ok(result.expiresAt && Number(new Date(result.expiresAt)) > Date.now() + 3000_000);
  });

  test("outlook: posts under the tenant's v2 token endpoint", async () => {
    const { f, calls } = fakeFetch(() => ({
      status: 200,
      body: { access_token: "mat", refresh_token: "mrt", expires_in: 3600 },
    }));
    await withEnv(
      { AZURE_TENANT_ID: "72f988bf" },
      async () => {
        const result = await exchangeCode({
          provider: "outlook",
          code: "AZC",
          clientId: "az-id",
          clientSecret: "az-secret",
          redirectUri: REDIRECT,
          fetchImpl: f,
        });
        assert.equal(
          calls[0].url,
          "https://login.microsoftonline.com/72f988bf/oauth2/v2.0/token"
        );
        const form = new URLSearchParams(String(calls[0].init?.body));
        assert.equal(form.get("grant_type"), "authorization_code");
        assert.equal(form.get("scope"), OUTLOOK_SCOPE);
        assert.equal(result.refreshToken, "mrt");
      }
    );
  });

  test("provider errors pass through (invalid_grant description)", async () => {
    const { f } = fakeFetch(() => ({
      status: 400,
      body: { error: "invalid_grant", error_description: "Invalid Value" },
    }));
    await assert.rejects(
      exchangeCode({
        provider: "gmail",
        code: "bad",
        clientId: "x",
        clientSecret: "y",
        redirectUri: REDIRECT,
        fetchImpl: f,
      }),
      /Invalid Value/
    );
  });
});

describe("refreshAccessToken", () => {
  test("gmail refresh posts grant_type=refresh_token and keeps the refresh token", async () => {
    const { f, calls } = fakeFetch(() => ({
      status: 200,
      body: { access_token: "new-at", expires_in: 3599 },
    }));
    const result = await refreshAccessToken({
      provider: "gmail",
      refreshToken: "rt-0",
      clientId: "gc-id",
      clientSecret: "gc-secret",
      fetchImpl: f,
    });
    const form = new URLSearchParams(String(calls[0].init?.body));
    assert.equal(form.get("grant_type"), "refresh_token");
    assert.equal(form.get("refresh_token"), "rt-0");
    assert.equal(result.accessToken, "new-at");
    assert.equal(result.refreshToken, "rt-0");
  });

  test("revoked refresh token throws (caller marks needs_reauth)", async () => {
    const { f } = fakeFetch(() => ({
      status: 401,
      body: { error: "invalid_grant", error_description: "Token has been revoked" },
    }));
    await assert.rejects(
      refreshAccessToken({
        provider: "gmail",
        refreshToken: "dead",
        clientId: "x",
        clientSecret: "y",
        fetchImpl: f,
      }),
      /revoked/
    );
  });
});

describe("revokeToken", () => {
  test("success → { ok: true } (gmail revokes the access token)", async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200 }));
    const r = await revokeToken({
      provider: "gmail",
      accessToken: "at",
      clientId: "x",
      fetchImpl: f,
    });
    assert.deepEqual(r, { ok: true });
    assert.equal(calls[0].url, "https://oauth2.googleapis.com/revoke?token=at");
  });

  test("provider 400 → { ok: false } (still no throw)", async () => {
    const { f } = fakeFetch(() => ({ status: 400 }));
    const r = await revokeToken({
      provider: "gmail",
      accessToken: "at",
      clientId: "x",
      fetchImpl: f,
    });
    assert.equal(r.ok, false);
  });

  test("network failure → { ok: false, error } (disconnect must never throw)", async () => {
    const f = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const r = await revokeToken({
      provider: "gmail",
      accessToken: "at",
      clientId: "x",
      fetchImpl: f,
    });
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /fetch failed/);
  });
});
