"use server";

/**
 * App-shell server actions (Step 16). Currently just the workspace
 * switch; the validation that matters — "is the caller actually a member
 * of the workspace they're switching to?" — is backed by RLS itself:
 * workspace_members select is membership-scoped, so a workspace the
 * caller doesn't belong to simply yields no row.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

export type AppActionResult = { error?: string } | undefined;

/** Pin the caller's active workspace (profiles.active_workspace_id).
 *  Every (app) read resolves through it on the next render. */
export async function setActiveWorkspaceAction(input: {
  workspaceId: string;
}): Promise<AppActionResult> {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId || !isUuid(workspaceId)) {
    return { error: "Unknown workspace." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session has expired. Please log in again." };
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!membership) {
    return { error: "You're not a member of that workspace." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ active_workspace_id: workspaceId })
    .eq("id", user.id);

  if (error) return { error: error.message };

  // The workspace name + role render in the shell on every app page.
  revalidatePath("/", "layout");
  return { error: undefined };
}
