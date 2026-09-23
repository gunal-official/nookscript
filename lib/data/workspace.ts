import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-side workspace lookup shared by /settings (and anywhere else that
 * needs the caller's workspace name + role without going through the
 * templates module). Cookie-authenticated; RLS scopes the reads.
 */

export interface WorkspaceInfo {
  id: string;
  name: string;
  role: "owner" | "member";
}

/** Caller's first-joined workspace + their role in it. Null when logged
 *  out or when no workspace exists yet (pre-onboarding). */
export async function getWorkspaceInfo(): Promise<WorkspaceInfo | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", membership.workspace_id)
    .single();
  if (!workspace) return null;

  return {
    id: membership.workspace_id as string,
    name: workspace.name as string,
    role: membership.role as "owner" | "member",
  };
}
