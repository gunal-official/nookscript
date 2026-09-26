/**
 * Unit tests for lib/email/sync.ts (mailbox fetch + normalize).
 * Run with: npm test
 *
 * Provider fixtures (Gmail full-format multipart/html; Graph text/html)
 * normalized to the one SyncedMessage shape, request shape (URL params +
 * bearer auth), and failure semantics (401 → EmailAuthError so callers
 * mark the account needs_reauth; other non-2xx → plain Error).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  EmailAuthError,
  fetchAccountEmail,
  fetchInboxMessages,
} from "../../lib/email/sync.ts";

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

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("Gmail normalization", () => {
  test("multipart message → plain-text body, headers, from, internalDate", async () => {
    const { f, calls } = fakeFetch(() => ({
      status: 200,
      body: {
        messages: [
          {
            id: "msg-1",
            internalDate: "1758000000000",
            payload: {
              mimeType: "multipart/alternative",
              from: { value: "Ada Client <ada@client.com>" },
              headers: [
                { name: "Subject", value: "Kickoff notes" },
                { name: "From", value: "Ada Client <ada@client.com>" },
              ],
              parts: [
                {
                  mimeType: "text/html",
                  body: { data: b64("<html><body><p>Hi <b>there</b></p></body></html>") },
                },
                {
                  mimeType: "text/plain",
                  body: { data: b64("Hi there — plain body wins.") },
                },
              ],
            },
          },
        ],
      },
    }));
    const msgs = await fetchInboxMessages({ provider: "gmail", accessToken: "at", fetchImpl: f });

    assert.equal(calls[0].url,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&format=full");
    assert.equal(
      String(calls[0].init?.headers).includes("Bearer at") ||
        (calls[0].init?.headers as Record<string, string>)?.authorization === "Bearer at",
      true
    );
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].externalId, "msg-1");
    assert.equal(msgs[0].sender, "Ada Client <ada@client.com>");
    assert.equal(msgs[0].subject, "Kickoff notes");
    assert.equal(msgs[0].bodyText, "Hi there — plain body wins.");
    assert.equal(new Date(msgs[0].receivedAt).getTime(), 1758000000000);
    assert.ok(msgs[0].snippet && msgs[0].snippet.length > 0);
  });

  test("html-only message → tags stripped best-effort", async () => {
    const { f } = fakeFetch(() => ({
      status: 200,
      body: {
        messages: [
          {
            id: "msg-2",
            internalDate: "1758000600000",
            payload: {
              mimeType: "text/html",
              from: { value: "bob@client.com" },
              headers: [{ name: "Subject", value: "Re: scope" }],
              body: { data: b64("<div>Line&nbsp;one</div><div>Line two</div>") },
            },
          },
        ],
      },
    }));
    const msgs = await fetchInboxMessages({ provider: "gmail", accessToken: "at", fetchImpl: f });
    assert.equal(msgs[0].bodyText, "Line one\n\nLine two");
  });

  test("fragments are reassembled (long base64 bodies)", async () => {
    const { f } = fakeFetch(() => ({
      status: 200,
      body: {
        messages: [
          {
            id: "msg-3",
            internalDate: "1758000600000",
            payload: {
              mimeType: "text/plain",
              from: { value: "x@y.com" },
              body: { fragments: [b64("part1 "), b64("part2")] },
            },
          },
        ],
      },
    }));
    const msgs = await fetchInboxMessages({ provider: "gmail", accessToken: "at", fetchImpl: f });
    assert.equal(msgs[0].bodyText, "part1 part2");
  });

  test("401 → EmailAuthError (re-auth, not retry)", async () => {
    const { f } = fakeFetch(() => ({ status: 401, body: { error: { message: "Invalid Credentials" } } }));
    await assert.rejects(
      fetchInboxMessages({ provider: "gmail", accessToken: "dead", fetchImpl: f }),
      (e: Error) => e instanceof EmailAuthError && /re-connect/.test(e.message)
    );
  });

  test("500 → plain Error with the status", async () => {
    const { f } = fakeFetch(() => ({ status: 500 }));
    await assert.rejects(
      fetchInboxMessages({ provider: "gmail", accessToken: "at", fetchImpl: f }),
      /HTTP 500/
    );
  });

  test("empty mailbox → []", async () => {
    const { f } = fakeFetch(() => ({ status: 200, body: { messages: [] } }));
    const msgs = await fetchInboxMessages({ provider: "gmail", accessToken: "at", fetchImpl: f });
    assert.deepEqual(msgs, []);
  });
});

describe("fetchAccountEmail", () => {
  test("gmail → users/me/profile emailAddress", async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, body: { emailAddress: "ops@studio.com" } }));
    const email = await fetchAccountEmail({ provider: "gmail", accessToken: "at", fetchImpl: f });
    assert.equal(email, "ops@studio.com");
    assert.equal(calls[0].url, "https://gmail.googleapis.com/gmail/v1/users/me/profile");
  });

  test("outlook → graph /me userPrincipalName", async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, body: { userPrincipalName: "ops@studio.onmicrosoft.com" } }));
    const email = await fetchAccountEmail({ provider: "outlook", accessToken: "at", fetchImpl: f });
    assert.equal(email, "ops@studio.onmicrosoft.com");
    assert.ok(calls[0].url.startsWith("https://graph.microsoft.com/v1.0/me"));
  });

  test("provider failure → null (caller stores a placeholder, no throw)", async () => {
    const { f } = fakeFetch(() => ({ status: 403 }));
    const email = await fetchAccountEmail({ provider: "gmail", accessToken: "at", fetchImpl: f });
    assert.equal(email, null);
    const throwing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    assert.equal(await fetchAccountEmail({ provider: "outlook", accessToken: "at", fetchImpl: throwing }), null);
  });
});

describe("Outlook (Graph) normalization", () => {
  test("text + html bodies, from name <address>, params + bearer", async () => {
    const { f, calls } = fakeFetch(() => ({
      status: 200,
      body: {
        value: [
          {
            id: "AAMkAG1sg1",
            receivedDateTime: "2025-09-16T19:21:00Z",
            from: { emailAddress: { name: "Bob Client", address: "bob@client.com" } },
            subject: "Re: scope",
            snippet: "Snipped",
            body: { contentType: "text", content: "Plain graph body" },
          },
          {
            id: "AAMkAGm1g2",
            receivedDateTime: "2025-09-16T19:22:00Z",
            from: { emailAddress: { address: "carol@client.com" } },
            subject: "Budget",
            body: {
              contentType: "html",
              content: "<html><body><p>One &amp; two</p></body></html>",
            },
          },
        ],
      },
    }));
    const msgs = await fetchInboxMessages({ provider: "outlook", accessToken: "mat", fetchImpl: f });

    const u = new URL(calls[0].url);
    assert.equal(u.origin + u.pathname, "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
    assert.equal(u.searchParams.get("$top"), "25");
    assert.equal(u.searchParams.get("$orderby"), "receivedDateTime desc");
    assert.ok(u.searchParams.get("$select")?.includes("receivedDateTime"));
    assert.equal(
      (calls[0].init?.headers as Record<string, string>)?.authorization,
      "Bearer mat"
    );

    assert.equal(msgs[0].sender, "Bob Client <bob@client.com>");
    assert.equal(msgs[0].bodyText, "Plain graph body");
    assert.equal(msgs[0].snippet, "Snipped");
    assert.equal(msgs[0].receivedAt, "2025-09-16T19:21:00Z");
    assert.equal(msgs[1].sender, "carol@client.com");
    assert.equal(msgs[1].bodyText, "One & two");
  });

  test("401 → EmailAuthError (re-auth, not retry)", async () => {
    const { f } = fakeFetch(() => ({ status: 401, body: { error: { message: "Expired" } } }));
    await assert.rejects(
      fetchInboxMessages({ provider: "outlook", accessToken: "dead", fetchImpl: f }),
      (e: Error) => e instanceof EmailAuthError && /re-connect/.test(e.message)
    );
  });
});
