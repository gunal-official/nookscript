import "server-only";

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import type { Template } from "@/lib/types/template";

/**
 * Server-side data access for templates (+ the workspace-role lookup the
 * /settings permission checks need). Cookie-authenticated client, so RLS
 * scopes reads to the caller's workspaces. Owner-enforcement for writes
 * lives in RLS (is_workspace_owner) — the role helper here exists only so
 * UI/actions can hide or short-circuit affordances non-owners can't use.
 */

/** All templates for the ACTIVE workspace (Step 16 — explicit filter so
 *  multi-workspace users never see merged lists; RLS remains the gate),
 *  most recently touched first. */
export async function getTemplates(workspaceId: string): Promise<Template[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Template[];
}

/**
 * The current user's role in their ACTIVE workspace ("owner" | "member" |
 * "viewer" | null) — resolved via the shared workspace-context resolver
 * (Step 16),
 * so someone who owns one workspace and is a member of another gets the
 * role of the workspace they're actually looking at. The (app) shell
 * resolves role for its own use but doesn't expose it to pages.
 */
export async function getCurrentUserRole(): Promise<
  "owner" | "member" | "viewer" | null
> {
  const context = await getWorkspaceContext();
  return context?.role ?? null;
}
