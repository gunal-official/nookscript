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

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("templates").insert({
    workspace_id: membership.workspace_id,
    title: input.title.trim(),
    body: input.body ?? "",
  });

  if (error) return { error: error.message };

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
