import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { hasTokenKey, tokenDecrypt, tokenEncrypt } from "@/lib/email/crypto";
import {
  providerEnv,
  refreshAccessToken,
  type EmailProvider,
} from "@/lib/email/oauth";
import { EmailAuthError, fetchInboxMessages } from "@/lib/email/sync";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Mailbox sync sweep (future-list item "Gmail/Outlook") — the serverless
 * recovery path: any scheduler (cron, Vercel cron, GitHub Actions
 * schedule) POSTs here once per interval and every active account gets
 * a fresh inbox pull. In-app "Sync now" (settings action) covers the
 * interactive case; this keeps mail fresh when nobody is looking.
 *
 * GATE: `Authorization: Bearer <CRON_SECRET>` (constant-time compared —
 * same pattern as /api/cron/webhooks). CRON_SECRET unset → 503.
 * Writes through the SERVICE ROLE (tokens are encrypted at rest; the
 * sweep is the only other writer besides the OAuth callback + settings
 * actions).
 */

export const dynamic = "force-dynamic";

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Cron is not configured (CRON_SECRET missing)." },
      { status: 503 }
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!given || !constantTimeEquals(given, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const keyHex = process.env.EMAIL_TOKEN_ENCRYPTION_KEY ?? "";
  if (!hasTokenKey(keyHex)) {
    return NextResponse.json(
      { error: "EMAIL_TOKEN_ENCRYPTION_KEY is not configured." },
      { status: 503 }
    );
  }

  const service = createServiceClient();
  const { data: accounts } = await service
    .from("email_accounts")
    .select(
      "id, workspace_id, service, access_token_enc, refresh_token_enc, token_expires_at"
    )
    .eq("status", "active");

  let synced = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const acct of accounts ?? []) {
    const provider: EmailProvider =
      acct.service === "outlook" ? "outlook" : "gmail";
    const env = providerEnv(provider);
    if (!env) continue; // provider not configured for this deployment

    try {
      let access = tokenDecrypt(String(acct.access_token_enc), keyHex);
      const expiresAt = acct.token_expires_at
        ? new Date(acct.token_expires_at)
        : null;
      if (expiresAt && expiresAt.getTime() < Date.now() + 60_000) {
        const refreshed = await refreshAccessToken({
          provider,
          refreshToken: tokenDecrypt(String(acct.refresh_token_enc), keyHex),
          clientId: env.clientId,
          clientSecret: env.clientSecret,
        });
        access = refreshed.accessToken;
        if (refreshed.refreshToken) {
          await service
            .from("email_accounts")
            .update({
              access_token_enc: tokenEncrypt(access, keyHex),
              refresh_token_enc: tokenEncrypt(refreshed.refreshToken, keyHex),
              token_expires_at: refreshed.expiresAt ?? null,
            })
            .eq("id", acct.id);
        }
      }

      const messages = await fetchInboxMessages({ provider, accessToken: access });
      if (messages.length) {
        await service
          .from("email_messages")
          .upsert(
            messages.map((m) => ({
              workspace_id: String(acct.workspace_id),
              account_id: String(acct.id),
              external_id: m.externalId,
              sender: m.sender,
              subject: m.subject,
              snippet: m.snippet,
              body_text: m.bodyText,
              received_at: m.receivedAt,
            })),
            { onConflict: "account_id,external_id" }
          );
      }
      await service
        .from("email_accounts")
        .update({ last_synced_at: now, last_error: null })
        .eq("id", acct.id);
      synced += 1;
    } catch (e) {
      failed += 1;
      if (e instanceof EmailAuthError) {
        await service
          .from("email_accounts")
          .update({ status: "needs_reauth", last_error: e.message })
          .eq("id", acct.id);
      } else {
        await service
          .from("email_accounts")
          .update({
            last_error: e instanceof Error ? e.message.slice(0, 300) : "Sync failed.",
          })
          .eq("id", acct.id);
      }
    }
  }

  return NextResponse.json({ synced, failed });
}
