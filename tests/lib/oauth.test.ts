/**
 * Unit tests for lib/auth/oauth.ts (SSO item — Google sign-in).
 * Run with: npm test
 *
 * The contract under test: `signInWithGoogle` calls
 * `auth.signInWithOAuth` with EXACTLY `{ provider: "google", options: {
 * redirectTo } }` and passes the Supabase result through untouched
 * (success URL on success, error object on failure — the button
 * component turns that error into the inline message).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { signInWithGoogle } from "../../lib/auth/oauth.ts";

function fakeClient(result: unknown) {
  const calls: unknown[] = [];
  const client = {
    auth: {
      signInWithOAuth(args: unknown) {
        calls.push(args);
        return Promise.resolve(result);
      },
    },
  };
  return { client, calls };
}

describe("signInWithGoogle", () => {
  test("calls signInWithOAuth with exactly provider google + redirectTo", async () => {
    const { client, calls } = fakeClient({
      data: { provider: "google", url: "https://accounts.google.com/o/oauth2/auth?..." },
      error: null,
    });

    await signInWithGoogle(client as never, "https://app.example.com/intake");

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      provider: "google",
      options: { redirectTo: "https://app.example.com/intake" },
    });
  });

  test("passes the success result through untouched (url for the redirect)", async () => {
    const url = "https://accounts.google.com/o/oauth2/v2/auth?client_id=x";
    const { client } = fakeClient({ data: { provider: "google", url }, error: null });

    const result = await signInWithGoogle(client as never, "https://app.example.com/");

    assert.equal(result.data.url, url);
    assert.equal(result.error, null);
  });

  test("passes the error result through untouched (button shows it inline)", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: "Could not find a matching OAuth provider configuration" },
    });

    const result = await signInWithGoogle(client as never, "https://app.example.com/");

    assert.equal(result.data, null);
    assert.ok(result.error);
    assert.equal(
      result.error.message,
      "Could not find a matching OAuth provider configuration"
    );
  });
});
