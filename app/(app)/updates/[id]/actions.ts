"use server";

/**
 * Server actions for /updates/[id].
 *
 * TESTING (local, after README setup + the updates migration + seed):
 *   1. Open a seeded update from /updates.
 *   2. Edit title/body in the composer → Save → updates.title/body update
 *      in the Table Editor; both /updates and this page stay in sync.
 *   3. Change the status dropdown (Draft ↔ Sent): updates.status updates;
 *      list badge matches after navigating back.
 */

import { revalidatePath } from "next/cache";

import { requireEditor } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import type { UpdateStatus } from "@/lib/types/update";

export type ActionResult = { error?: string } | undefined;

const VALID_STATUSES: UpdateStatus[] = ["draft", "sent"];

export async function updateUpdateStatus(input: {
  updateId: string;
  status: UpdateStatus;
}): Promise<ActionResult> {
  if (!VALID_STATUSES.includes(input.status)) {
    return { error: "Invalid status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // Plain UPDATE; RLS scopes it to the user's workspaces.
  const { error } = await supabase
    .from("updates")
    .update({ status: input.status })
    .eq("id", input.updateId);

  if (error) return { error: error.message };

  revalidatePath("/updates");
  revalidatePath(`/updates/${input.updateId}`);
  return { error: undefined };
}

/** Manual save from the composer — no autosave, explicit user action. */export async function saveUpdateContent(input: {
  updateId: string;
  title: string;
  body: string;
}): Promise<ActionResult> {
  if (!input.title?.trim()) return { error: "Title is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  const { error } = await supabase
    .from("updates")
    .update({ title: input.title.trim(), body: input.body ?? "" })
    .eq("id", input.updateId);

  if (error) return { error: error.message };

  revalidatePath(`/updates/${input.updateId}`);
  revalidatePath("/updates");
  return { error: undefined };
}

// ── Share links (Step 10) ────────────────────────────────────────────────
// Member actions only — the share_links table is fully member-gated; the
// public read path is the get_shared_document RPC, untouched by these.

export async function createShareLink(input: {
  updateId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // The insert needs workspace_id; read it from the update (RLS-scoped,
  // so foreign updates simply look absent).
  const { data: update, error: fetchError } = await supabase
    .from("updates")
    .select("workspace_id")
    .eq("id", input.updateId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!update) return { error: "Update not found." };

  // token defaults to gen_random_uuid() at insert. unique(update_id)
  // turns a double-click race into a friendly error.
  const { error } = await supabase.from("share_links").insert({
    workspace_id: update.workspace_id,
    update_id: input.updateId,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A share link already exists for this update."
          : error.message,
    };
  }

  revalidatePath(`/updates/${input.updateId}`);
  return { error: undefined };
}

export async function revokeShareLink(input: {
  shareId: string;
  updateId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  const { error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.shareId);

  if (error) return { error: error.message };

  revalidatePath(`/updates/${input.updateId}`);
  return { error: undefined };
}

export async function regenerateShareLink(input: {
  shareId: string;
  updateId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // Same row, fresh unguessable token (uuid v4 — the JS-side equivalent of
  // gen_random_uuid(), since PostgREST updates can't invoke SQL defaults),
  // and the link becomes active again.
  const { error } = await supabase
    .from("share_links")
    .update({ token: crypto.randomUUID(), revoked_at: null })
    .eq("id", input.shareId);

  if (error) return { error: error.message };

  revalidatePath(`/updates/${input.updateId}`);
  return { error: undefined };
}
