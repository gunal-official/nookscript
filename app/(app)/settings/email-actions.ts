"use server";

/**
 * Server actions for mailbox management (future-list item
 * "Gmail/Outlook"). Owner-only for connect-side management (the OAuth
 * callback is the only other writer); createBriefFromEmail follows the
 * editor guard (viewers read, never write).
 *
 * Token access + message upserts + attached-brief marking go through the
 * SERVICE client (bypasses RLS) — same trust model as the Stripe webhook
 * route; the user-facing checks above are the authorization boundary.
 */

import { revalidatePath } from "next/cache";

import { recordEvent } from "@/lib/events";
import {
  getWorkspaceContext,
  requireEditor,
} from "@/lib/data/workspace-context";
import {
  hasTokenKey,
  tokenDecrypt,
  tokenEncrypt,
} from "@/lib/email/crypto";
import {
  providerEnv,
  refreshAccessToken,
  revokeToken,
  type EmailProvider,
} from "@/lib/email/oauth";
import { EmailAuthError, fetchInboxMessages } from "@/lib/email/sync";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type ActionResult = { error?: string } | undefined;

function asProvider(v: unknown): EmailProvider {
  return v === "outlook" ? "outlook" : "gmail";
}

/** Owner: pull the latest inbox messages for one account and stage them. */
export async function syncEmailNow(
  accountId: string
): Promise<{ error?: string; staged?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please log in again." };

  const context = await getWorkspaceContext();
  if (!context) return { error: "No workspace found for your account." };
  if (context.role !== "owner") {
    return { error: "Only workspace owners can manage mailboxes." };
  }

  const keyHex = process.env.EMAIL_TOKEN_ENCRYPTION_KEY ?? "";
  if (!hasTokenKey(keyHex)) {
    return {
      error: "EMAIL_TOKEN_ENCRYPTION_KEY is not set on the server (64 hex chars).",
    };
  }

  const { data: acct } = await supabase
    .from("email_accounts")
    .select("id, service, access_token_enc, refresh_token_enc, token_expires_at")
    .eq("id", accountId)
    .eq("workspace_id", context.id)
    .maybeSingle();
  if (!acct) return { error: "Mailbox not found." };

  const provider = asProvider(acct.service);
  const env = providerEnv(provider);
  if (!env) {
    return {
      error: `${provider === "gmail" ? "GOOGLE_" : "AZURE_"}CLIENT_ID/_SECRET are not set on the server.`,
    };
  }

  const service = createServiceClient();
  const mark = (patch: Record<string, unknown>) =>
    service.from("email_accounts").update(patch).eq("id", accountId);

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
        await mark({
          access_token_enc: tokenEncrypt(access, keyHex),
          refresh_token_enc: tokenEncrypt(refreshed.refreshToken, keyHex),
          token_expires_at: refreshed.expiresAt ?? null,
        });
      }
    }

    const messages = await fetchInboxMessages({ provider, accessToken: access });
    if (messages.length) {
      await service
        .from("email_messages")
        .upsert(
          messages.map((m) => ({
            workspace_id: context.id,
            account_id: accountId,
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
    await mark({
      last_synced_at: new Date().toISOString(),
      last_error: null,
    });
    revalidatePath("/settings");
    revalidatePath("/intake/inbox");
    return { staged: messages.length };
  } catch (e) {
    if (e instanceof EmailAuthError) {
      await mark({
        status: "needs_reauth",
        last_error: e.message,
      });
      return { error: e.message };
    }
    const message = e instanceof Error ? e.message : "Sync failed.";
    await mark({ last_error: message.slice(0, 300) });
    return { error: message };
  }
}

/** Owner: best-effort revoke at the provider, then delete the account
 *  (staged mail cascades away with it). */
export async function disconnectEmail(accountId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please log in again." };

  const context = await getWorkspaceContext();
  if (!context) return { error: "No workspace found for your account." };
  if (context.role !== "owner") {
    return { error: "Only workspace owners can manage mailboxes." };
  }

  const { data: acct } = await supabase
    .from("email_accounts")
    .select("id, service, access_token_enc")
    .eq("id", accountId)
    .eq("workspace_id", context.id)
    .maybeSingle();
  if (!acct) return { error: "Mailbox not found." };

  const provider = asProvider(acct.service);
  const env = providerEnv(provider);
  const keyHex = process.env.EMAIL_TOKEN_ENCRYPTION_KEY ?? "";
  if (env && hasTokenKey(keyHex)) {
    try {
      const access = tokenDecrypt(String(acct.access_token_enc), keyHex);
      await revokeToken({ provider, accessToken: access, clientId: env.clientId });
    } catch {
      // revocation is best-effort — the local delete always proceeds
    }
  }

  const service = createServiceClient();
  const { error } = await service
    .from("email_accounts")
    .delete()
    .eq("id", accountId);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/intake/inbox");
  return undefined;
}

/** Editor: create a brief from a staged mailbox message (source_type
 *  'email' via the existing create_brief_bundle RPC) and mark the
 *  message attached (service client — no user write policy on
 *  email_messages by design). */
export async function createBriefFromEmail(
  messageId: string
): Promise<{ error?: string; briefId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Please log in again." };

  const viewerGuard = await requireEditor();
  if (viewerGuard) return { error: viewerGuard.error };

  const context = await getWorkspaceContext();
  if (!context) return { error: "No workspace found for your account." };

  const { data: msg } = await supabase
    .from("email_messages")
    .select(
      "id, sender, subject, snippet, body_text, received_at, external_id, attached_brief_id, account:email_accounts(service)"
    )
    .eq("id", messageId)
    .eq("workspace_id", context.id)
    .maybeSingle();
  if (!msg) return { error: "That email is no longer staged." };
  if (msg.attached_brief_id) {
    return { error: "That email is already attached to a brief." };
  }

  const acct = msg.account as { service: string } | { service: string }[] | null;
  const service = Array.isArray(acct) ? acct[0]?.service : acct?.service;
  const sender = String(msg.sender ?? "Unknown sender");
  const subject = (msg.subject as string | null) ?? null;
  const title = (subject || `Email from ${sender}`).slice(0, 120);
  const rawContent = String(msg.body_text ?? msg.snippet ?? "");
  const match = /<([^>]+)>/.exec(sender);
  const clientName = match ? match[1] : null;

  const { data: briefId, error } = await supabase.rpc("create_brief_bundle", {
    p_workspace_id: context.id,
    p_title: title,
    p_objective: "",
    p_deliverables: [],
    p_budget_timeline: "",
    p_client_name: clientName,
    p_owner_id: user.id,
    p_source_type: "email",
    p_raw_content: rawContent,
    p_source_metadata: {
      from: sender,
      subject,
      received_at: msg.received_at,
      provider: service ?? null,
      provider_message_id: msg.external_id,
    },
    p_questions: [],
  });

  if (error || !briefId) {
    return { error: error?.message ?? "Could not create the brief." };
  }

  const serviceClient = createServiceClient();
  await serviceClient
    .from("email_messages")
    .update({ attached_brief_id: briefId })
    .eq("id", messageId);

  await recordEvent(supabase, {
    workspace_id: context.id,
    event_type: "brief.created",
    payload: {
      brief_id: briefId,
      title,
      client_name: clientName,
      source: "mailbox",
    },
  });

  revalidatePath("/intake/inbox");
  revalidatePath("/briefs");
  return { briefId: String(briefId) };
}
