"use server";

/**
 * Webhook endpoint management for /settings (Phase: events/webhooks
 * foundation). Owner-only — the UI hides these controls from members and
 * these actions re-check the role themselves as defense in depth; RLS
 * (is_workspace_owner on webhook_endpoints) is the final gate either way.
 *
 * Registration is intentionally just {url}: the HMAC signing secret is
 * GENERATED here (never client-supplied) and returned once for the owner
 * to paste into their receiver. Rotation = delete + register again (the
 * endpoints table has no UPDATE policy on purpose).
 */

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { normalizeWebhookUrl } from "@/lib/webhooks";

export type WebhookActionResult = { error?: string; secret?: string };

async function getMembership() {
  const supabase = await createClient();
  const context = await getWorkspaceContext();

  return {
    supabase,
    membership: context
      ? { workspace_id: context.id, role: context.role }
      : null,
  };
}

const NOT_OWNER = "Only workspace owners can manage webhooks.";

export async function registerWebhookEndpoint(input: {
  url: string;
}): Promise<WebhookActionResult> {
  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") return { error: NOT_OWNER };

  const normalized = normalizeWebhookUrl(input.url ?? "");
  if (!normalized.ok) return { error: normalized.error };

  const signingSecret = `whsec_${randomBytes(24).toString("base64url")}`;

  const { data, error } = await supabase
    .from("webhook_endpoints")
    .insert({
      workspace_id: membership.workspace_id,
      url: normalized.url,
      signing_secret: signingSecret,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "That URL is already registered." };
    }
    return { error: error.message };
  }
  if (!data) return { error: "Could not register the webhook." };

  revalidatePath("/settings");
  return { secret: signingSecret };
}

export async function deleteWebhookEndpoint(input: {
  endpointId: string;
}): Promise<WebhookActionResult> {
  if (!isUuid(input.endpointId)) return { error: "Unknown webhook." };

  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") return { error: NOT_OWNER };

  const { error } = await supabase
    .from("webhook_endpoints")
    .delete()
    .eq("id", input.endpointId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return {};
}
