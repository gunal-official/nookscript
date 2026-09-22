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

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { error?: string } | undefined;

/** Session + workspace membership (+role). Null = not authenticated or no
 *  workspace yet. */
async function getMembership() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, membership: null };

  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    supabase,
    membership: (data ?? null) as {
      workspace_id: string;
      role: "owner" | "member";
    } | null,
  };
}

const NOT_OWNER = "Only workspace owners can manage templates.";

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
