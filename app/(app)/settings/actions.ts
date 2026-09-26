"use server";

/**
 * Server actions for /settings (templates). Owner-only — the UI hides
 * these controls from members, and these actions re-check the role
 * themselves as defense in depth; RLS (is_workspace_owner) is the final
 * gate either way.
 *
 * TESTING (local, after the templates migration + seed):
 *   1. Log in as the seeded demo user (owner) → create/edit/delete work.
 *   2. Sign up a second account, re-run seed.sql (it adds other users as
 *      'member') → as that user the controls are hidden; calling these
 *      actions anyway returns "Only workspace owners…".
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { recordEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { createBillingPortalSession, createCheckoutSession } from "@/lib/stripe";

export type ActionResult = { error?: string } | undefined;

/** Session + ACTIVE workspace membership (+role) via the Step-16
 *  resolver. Null = not authenticated or no workspace yet. */
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

const NOT_OWNER = "Only workspace owners can manage templates.";
const RENAME_NOT_OWNER = "Only workspace owners can rename the workspace.";
const DELETE_NOT_OWNER = "Only workspace owners can delete the workspace.";

/**
 * Rename the caller's workspace (post-roadmap item). Owner-only — re-checked
 * here as defense in depth, with the workspaces UPDATE policy
 * (is_workspace_owner) as the final gate. Revalidates the full layout so
 * the sidebar name updates everywhere immediately.
 */
export async function updateWorkspaceName(input: {
  name: string;
}): Promise<ActionResult> {
  const name = input.name?.trim() ?? "";
  if (!name) return { error: "Workspace name can't be empty." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };

  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") return { error: RENAME_NOT_OWNER };

  const { error } = await supabase
    .from("workspaces")
    .update({ name })
    .eq("id", membership.workspace_id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/", "layout"); // sidebar shows the name on every app page
  return { error: undefined };
}

/**
 * Delete the ACTIVE workspace (Step 27 — the escape hatch the Step-26
 * leave arc exposed: a sole owner can neither leave nor, until now,
 * destroy). Owner-only — re-checked here as defense in depth, with the
 * workspaces DELETE policy (is_workspace_owner) as the final gate.
 * EVERYTHING cascades (all workspace_id FKs are on delete cascade; the
 * active pointer is on delete set null) — briefs, proposals, invoices,
 * templates, team access. Irreversible; the UI says so twice.
 */
export async function deleteWorkspaceAction(): Promise<ActionResult> {
  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") return { error: DELETE_NOT_OWNER };

  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", membership.workspace_id);

  if (error) return { error: error.message };

  // The whole shell changes — next workspace (or /onboarding when none
  // remain) resolves on the revalidated layout render.
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { error: undefined };
}

export async function createTemplate(input: {
  title: string;
  body: string;
}): Promise<ActionResult> {
  if (!input.title?.trim()) return { error: "Title is required." };

  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") return { error: NOT_OWNER };

  const { data: created, error } = await supabase
    .from("templates")
    .insert({
      workspace_id: membership.workspace_id,
      title: input.title.trim(),
      body: input.body ?? "",
    })
    .select("id, title")
    .single();

  if (error) return { error: error.message };
  if (!created) return { error: "Could not create the template." };

  // The template-created event (suggestions pass 9/10) — recordEvent
  // never throws; a missed row never blocks template creation.
  await recordEvent(supabase, {
    workspace_id: membership.workspace_id,
    event_type: "template.created",
    payload: { template_id: created.id, title: created.title },
  });

  revalidatePath("/settings");
  return { error: undefined };
}

export async function updateTemplate(input: {
  templateId: string;
  title: string;
  body: string;
}): Promise<ActionResult> {
  if (!input.title?.trim()) return { error: "Title is required." };

  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") return { error: NOT_OWNER };

  const { error } = await supabase
    .from("templates")
    .update({ title: input.title.trim(), body: input.body ?? "" })
    .eq("id", input.templateId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { error: undefined };
}

export async function deleteTemplate(input: {
  templateId: string;
}): Promise<ActionResult> {
  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") return { error: NOT_OWNER };

  const { error } = await supabase
    .from("templates")
    .delete()
    .eq("id", input.templateId);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { error: undefined };
}

/**
 * Start a hosted Stripe Checkout session for the Free → Pro upgrade
 * (Phase: events/webhooks foundation). Owner-only; TEST-mode keys only
 * (STRIPE_SECRET_KEY = sk_test_…, STRIPE_PRICE_ID = a test price). On
 * success this NEVER returns — the browser lands on Stripe's hosted page;
 * state changes arrive via /api/stripe/webhook, not from this action.
 */
export async function startCheckout(): Promise<ActionResult> {
  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") {
    return { error: "Only workspace owners can manage billing." };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!secretKey || !priceId) {
    return {
      error:
        "Billing is not configured yet — set STRIPE_SECRET_KEY and STRIPE_PRICE_ID (test mode).",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();

  const h = await headers();
  const host = h.get("origin") ?? (h.get("x-forwarded-host") ? `https://${h.get("x-forwarded-host")}` : "http://localhost:3000");

  const session = await createCheckoutSession({
    secretKey,
    workspaceId: membership.workspace_id,
    priceId,
    successUrl: `${host}/settings?checkout=success`,
    cancelUrl: `${host}/settings?checkout=canceled`,
    customerEmail: profile?.email ?? null,
  });
  if (!session.ok) return { error: session.error };

  redirect(session.url);
}

/**
 * Open the hosted Stripe Customer Portal for the workspace's
 * subscription (suggestions pass 5/10). Owner-only, TEST-mode keys.
 * The browser lands on Stripe's hosted page where the owner can cancel
 * or update the subscription; the plan state HERE still flips only via
 * the two webhooks (customer.subscription.deleted included) — the
 * portal manages Stripe's side, the webhooks own ours.
 */
export async function openCustomerPortal(): Promise<ActionResult> {
  const { supabase, membership } = await getMembership();
  if (!membership) {
    return { error: "Your session has expired. Please log in again." };
  }
  if (membership.role !== "owner") {
    return { error: "Only workspace owners can manage billing." };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return {
      error:
        "Billing is not configured yet — set STRIPE_SECRET_KEY (test mode).",
    };
  }

  const { data: billing } = await supabase
    .from("billing_subscriptions")
    .select("status, stripe_customer_id")
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();

  if (!billing || !billing.stripe_customer_id) {
    return {
      error: "No subscription to manage yet — complete checkout first.",
    };
  }

  const h = await headers();
  const host =
    h.get("origin") ??
    (h.get("x-forwarded-host")
      ? `https://${h.get("x-forwarded-host")}`
      : "http://localhost:3000");

  const session = await createBillingPortalSession({
    secretKey,
    customerId: billing.stripe_customer_id,
    returnUrl: `${host}/settings`,
  });
  if (!session.ok) return { error: session.error };

  redirect(session.url);
}
