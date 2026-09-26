/**
 * OAuth plumbing for email mailbox connections (future-list item
 * "Gmail/Outlook"). Zero dependencies (fetch + URL only):
 *
 *   - auth URL builders (the /api/email/connect route redirects here);
 *   - authorization-code exchange (the /api/email/callback route);
 *   - refresh (sync action + cron sweep, when the access token lapses);
 *   - best-effort revocation (disconnect).
 *
 * Every network function takes an optional `fetchImpl` so the exact
 * request shape is unit-testable (tests/lib/email-oauth.test.ts) — the
 * same shape as lib/stripe.
 *
 * TEST/dev credentials only in this repo; production client IDs/secrets
 * are never referenced.
 */

export type EmailProvider = "gmail" | "outlook";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const OUTLOOK_SCOPE = "Mail.Read";
export const DEFAULT_AZURE_TENANT = "common";

export function gmailAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GMAIL_SCOPE,
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export function outlookAuthUrl(
  clientId: string,
  tenant: string,
  redirectUri: string,
  state: string
): string {
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: `${OUTLOOK_SCOPE} offline_access`,
    state,
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(
    tenant
  )}/oauth2/v2.0/authorize?${p.toString()}`;
}

/** Provider credentials from env (all optional — absence = the connect
 *  button shows its "configure env" state instead of failing). */
export function providerEnv(
  provider: EmailProvider
): { clientId: string; clientSecret: string; tenant?: string } | null {
  if (provider === "gmail") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    tenant: process.env.AZURE_TENANT_ID || DEFAULT_AZURE_TENANT,
  };
}

export interface TokenResult {
  accessToken: string;
  refreshToken: string | null;
  /** ISO timestamp, or null when the provider omits expires_in. */
  expiresAt: string | null;
  /** Present on Google exchanges (not on refreshes) — used to label the
   *  account row. */
  email?: string | null;
}

function tokenError(res: Response, json: Record<string, unknown>): Error {
  return new Error(
    String(json.error_description || json.error || `Provider returned HTTP ${res.status}.`)
  );
}

/** Exchange the authorization code for tokens. Throws an Error carrying
 *  the provider's message on failure. */
export async function exchangeCode(opts: {
  provider: EmailProvider;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<TokenResult> {
  const f = opts.fetchImpl ?? fetch;
  let res: Awaited<ReturnType<typeof fetch>>;
  if (opts.provider === "gmail") {
    res = await f("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        code: opts.code,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        redirect_uri: opts.redirectUri,
        grant_type: "authorization_code",
        scope: GMAIL_SCOPE,
      }).toString(),
    });
  } else {
    const tenant = process.env.AZURE_TENANT_ID || DEFAULT_AZURE_TENANT;
    res = await f(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
          code: opts.code,
          redirect_uri: opts.redirectUri,
          grant_type: "authorization_code",
          scope: OUTLOOK_SCOPE,
        }).toString(),
      }
    );
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw tokenError(res as never, json);
  const expiresAt = json.expires_in
    ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString()
    : null;
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    expiresAt,
    email: json.email ? String(json.email) : null,
  };
}

/** Refresh an expired access token. Throws on provider rejection — the
 *  caller marks the account needs_reauth. */
export async function refreshAccessToken(opts: {
  provider: EmailProvider;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<TokenResult> {
  const f = opts.fetchImpl ?? fetch;
  let res: Awaited<ReturnType<typeof fetch>>;
  if (opts.provider === "gmail") {
    res = await f("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        refresh_token: opts.refreshToken,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        grant_type: "refresh_token",
        scope: GMAIL_SCOPE,
      }).toString(),
    });
  } else {
    const tenant = process.env.AZURE_TENANT_ID || DEFAULT_AZURE_TENANT;
    res = await f(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          refresh_token: opts.refreshToken,
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
          grant_type: "refresh_token",
          scope: OUTLOOK_SCOPE,
        }).toString(),
      }
    );
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw tokenError(res as never, json);
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: json.refresh_token ? String(json.refresh_token) : opts.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString()
      : null,
    email: null,
  };
}

/** Best-effort revocation — never throws (disconnect must succeed even
 *  when the provider is unreachable). */
export async function revokeToken(opts: {
  provider: EmailProvider;
  accessToken: string;
  clientId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; error?: string }> {
  const f = opts.fetchImpl ?? fetch;
  try {
    if (opts.provider === "gmail") {
      const res = await f(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(opts.accessToken)}`,
        { method: "POST" }
      );
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    }
    const tenant = process.env.AZURE_TENANT_ID || DEFAULT_AZURE_TENANT;
    const res = await f(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/revoke`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: opts.clientId,
          token: opts.accessToken,
        }).toString(),
      }
    );
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}
