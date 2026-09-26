/**
 * Mailbox sync — fetch + normalize the latest inbox messages from the
 * connected provider (future-list item "Gmail/Outlook"). Zero
 * dependencies (fetch only).
 *
 * Both providers are normalized to ONE shape (SyncedMessage); staging
 * dedupe is the DB's job (unique(account_id, external_id)), so a sync is
 * idempotent no matter how often it runs.
 *
 * Read-only scopes only (Gmail readonly, Graph Mail.Read) — the app
 * never sends mail.
 *
 * Every network function takes an optional `fetchImpl` so provider
 * fixtures are unit-testable (tests/lib/email-sync.test.ts).
 */

import type { EmailProvider } from "@/lib/email/oauth";

export interface SyncedMessage {
  externalId: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  /** ISO timestamp. */
  receivedAt: string;
}

/** Provider rejected the token (expired/revoked) — the caller marks the
 *  account needs_reauth instead of retrying. */
export class EmailAuthError extends Error {}

const GMAIL_MESSAGES_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GRAPH_MESSAGES_URL =
  "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages";

/** Best-effort HTML → text (synced mail is displayed, not rendered). */
function stripTags(html: string): string {
  return html
    .replace(/<\s*\/?\s*(br|p|div|tr|li)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Gmail ────────────────────────────────────────────────────────────────

type GmailPart = {
  mimeType?: string;
  body?: { data?: string; fragments?: string[] };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  internalDate?: string;
  payload?: {
    from?: { value?: string };
    subject?: string;
    headers?: { name: string; value: string }[];
  } & GmailPart;
};

function base64UrlData(part: GmailPart): string | null {
  if (!part.body) return null;
  const raw = part.body.fragments
    ? part.body.fragments.join("")
    : (part.body.data ?? "");
  if (!raw) return null;
  try {
    return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
  } catch {
    return null;
  }
}

function findTextPart(part: GmailPart | undefined): string | null {
  if (!part) return null;
  if (part.parts) {
    for (const child of part.parts) {
      const hit = findTextPart(child);
      if (hit) return hit;
    }
    return null;
  }
  if (part.mimeType === "text/plain") return base64UrlData(part);
  return null;
}

function findHtmlPart(part: GmailPart | undefined): string | null {
  if (!part) return null;
  if (part.parts) {
    for (const child of part.parts) {
      const hit = findHtmlPart(child);
      if (hit) return hit;
    }
    return null;
  }
  if (part.mimeType === "text/html") return base64UrlData(part);
  return null;
}

function normalizeGmail(m: GmailMessage): SyncedMessage {
  const payload = m.payload;
  const header = (name: string) =>
    payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
      ?.value ?? null;
  const plain = findTextPart(payload);
  const html = plain ? null : findHtmlPart(payload);
  const bodyText = plain ?? (html ? stripTags(html) : null);
  const receivedAt = m.internalDate
    ? new Date(Number(m.internalDate)).toISOString()
    : new Date(0).toISOString();
  return {
    externalId: m.id,
    sender: payload?.from?.value ?? "Unknown sender",
    subject: header("Subject") ?? payload?.subject ?? null,
    snippet: (bodyText ?? "").slice(0, 280) || null,
    bodyText,
    receivedAt,
  };
}

// ── Microsoft Graph (Outlook) ───────────────────────────────────────────

type GraphMessage = {
  id: string;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  subject?: string | null;
  snippet?: string | null;
  body?: { contentType?: string; content?: string };
};

function normalizeGraph(m: GraphMessage): SyncedMessage {
  const addr = m.from?.emailAddress?.address;
  const name = m.from?.emailAddress?.name;
  const sender =
    addr && name ? `${name} <${addr}>` : (addr ?? name ?? "Unknown sender");
  const raw = m.body?.content ?? null;
  const bodyText =
    raw == null
      ? null
      : m.body?.contentType?.toLowerCase().includes("html")
        ? stripTags(raw)
        : raw;
  return {
    externalId: m.id,
    sender,
    subject: m.subject ?? null,
    snippet: m.snippet ?? ((bodyText ?? "").slice(0, 280) || null),
    bodyText,
    receivedAt: m.receivedDateTime,
  };
}

/** Resolve the mailbox address the token belongs to (account row label
 *  — the token exchange doesn't always carry it). Best-effort: null on
 *  any failure, the caller stores a placeholder. */
export async function fetchAccountEmail(opts: {
  provider: EmailProvider;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const f = opts.fetchImpl ?? fetch;
  const headers = {
    authorization: `Bearer ${opts.accessToken}`,
    accept: "application/json",
  };
  try {
    if (opts.provider === "gmail") {
      const res = await f(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers }
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { emailAddress?: string };
      return json.emailAddress ?? null;
    }
    const res = await f(
      "https://graph.microsoft.com/v1.0/me?$select=userPrincipalName",
      { headers }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { userPrincipalName?: string };
    return json.userPrincipalName ?? null;
  } catch {
    return null;
  }
}

// ── entry point ─────────────────────────────────────────────────────────

/** Fetch the latest inbox messages (newest first, ≤25) for a connected
 *  account. Throws EmailAuthError on 401 and Error with the provider's
 *  message on other failures. */
export async function fetchInboxMessages(opts: {
  provider: EmailProvider;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<SyncedMessage[]> {
  const f = opts.fetchImpl ?? fetch;
  const headers = {
    authorization: `Bearer ${opts.accessToken}`,
    accept: "application/json",
  };

  if (opts.provider === "gmail") {
    const res = await f(
      `${GMAIL_MESSAGES_URL}?maxResults=25&format=full`,
      { headers }
    );
    if (res.status === 401) {
      throw new EmailAuthError(
        "Google rejected the mailbox token — re-connect the account."
      );
    }
    if (!res.ok) {
      throw new Error(`Gmail sync failed (HTTP ${res.status}).`);
    }
    const json = (await res.json()) as { messages?: GmailMessage[] };
    return (json.messages ?? []).map(normalizeGmail);
  }

  const res = await f(
    `${GRAPH_MESSAGES_URL}?$top=25&$orderby=receivedDateTime desc&$select=id,from,subject,snippet,body,receivedDateTime`,
    { headers }
  );
  if (res.status === 401) {
    throw new EmailAuthError(
      "Microsoft rejected the mailbox token — re-connect the account."
    );
  }
  if (!res.ok) {
    throw new Error(`Outlook sync failed (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as { value?: GraphMessage[] };
  return (json.value ?? []).map(normalizeGraph);
}
