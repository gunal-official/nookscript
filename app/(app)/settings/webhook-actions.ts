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

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import {
  buildDeliveryBody,
  buildDeliveryHeaders,
  normalizeWebhookUrl,
} from "@/lib/webhooks";

export type WebhookActionResult = {
  error?: string;
  secret?: string;
  /** HTTP status the receiver answered with (test ping). */
  status?: number;
};

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

/**
 * Send a one-off signed test delivery to a registered endpoint
 * (suggestions pass 2/10). Owner-only. The ping uses the REAL delivery
 * shape and signature scheme under its own event type
 * (`nookscript.endpoint_test`) so a receiver's full verify-and-parse
 * pipeline runs; it is NOT an event row and writes no
 * webhook_deliveries entry (delivery rows require a real event).
 */
/**
 * Rotate an endpoint's signing secret (suggestions pass 3/10). Owner-only.
 * The endpoints table has NO update policy on purpose — rotation is
 * delete + re-register with the SAME URL and a fresh app-generated
 * secret. Honest consequence (same as manual delete + register): the
 * endpoint's id changes, so its webhook_deliveries rows cascade away
 * and the card's delivery log restarts. The receiver must be updated
 * with the new secret or every later delivery fails signature checks.
 */
export async function rotateWebhookEndpoint(input: {
  endpointId: string;
}): Promise<WebhookActionResult> {
  if (!isUuid(input.endpointId)) return { error: "Unknown webhook." };

  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") return { error: NOT_OWNER };

  const { data: endpoint, error } = await supabase
    .from("webhook_endpoints")
    .select("id, url")
    .eq("id", input.endpointId)
    .maybeSingle();
  if (error || !endpoint) return { error: "Unknown webhook." };

  const { error: deleteError } = await supabase
    .from("webhook_endpoints")
    .delete()
    .eq("id", input.endpointId);
  if (deleteError) return { error: deleteError.message };

  const signingSecret = `whsec_${randomBytes(24).toString("base64url")}`;
  const { error: insertError } = await supabase
    .from("webhook_endpoints")
    .insert({
      workspace_id: membership.workspace_id,
      url: endpoint.url,
      signing_secret: signingSecret,
    });
  if (insertError) {
    if (insertError.code === "23505") {
      return {
        error:
          "Rotation failed — another endpoint now owns that URL. Re-register it manually.",
      };
    }
    return { error: insertError.message };
  }

  revalidatePath("/settings");
  return { secret: signingSecret };
}

export async function testWebhookEndpoint(input: {
  endpointId: string;
}): Promise<WebhookActionResult> {
  if (!isUuid(input.endpointId)) return { error: "Unknown webhook." };

  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") return { error: NOT_OWNER };

  const { data: endpoint, error } = await supabase
    .from("webhook_endpoints")
    .select("id, url, signing_secret")
    .eq("id", input.endpointId)
    .maybeSingle();
  if (error || !endpoint) return { error: "Unknown webhook." };

  // Stored URLs are validated at registration; re-check before any
  // outbound request (defense in depth against stale rows).
  const normalized = normalizeWebhookUrl(endpoint.url);
  if (!normalized.ok) return { error: normalized.error };

  const body = buildDeliveryBody({
    id: randomUUID(),
    event_type: "nookscript.endpoint_test",
    payload: { test: true, sent_at: new Date().toISOString() },
    created_at: new Date().toISOString(),
  });

  try {
    const res = await fetch(normalized.url, {
      method: "POST",
      headers: buildDeliveryHeaders(
        body,
        endpoint.signing_secret,
        Math.floor(Date.now() / 1000),
        "endpoint-test",
        "nookscript.endpoint_test"
      ),
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { status: res.status };
    return {
      status: res.status,
      error: `Your receiver answered HTTP ${res.status} — check its logs.`,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Could not reach the URL (${err.message}).`
          : "Could not reach the URL.",
    };
  }
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
