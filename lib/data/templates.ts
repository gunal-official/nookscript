import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Template } from "@/lib/types/template";

/**
 * Server-side data access for templates (+ the workspace-role lookup the
 * /settings permission checks need). Cookie-authenticated client, so RLS
 * scopes reads to the caller's workspaces. Owner-enforcement for writes
 * lives in RLS (is_workspace_owner) — the role helper here exists only so
 * UI/actions can hide or short-circuit affordances non-owners can't use.
 */

/** All templates for the workspace, most recently touched first —
 *  consistent with the other entity lists. */
export async function getTemplates(): Promise<Template[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Template[];
}

/**
 * The current user's role in their first-joined workspace ("owner" |
 * "member" | null). The (app)/layout.tsx shell fetches role for its own
 * use but doesn't expose it to pages, and duplicating that query shape
 * here keeps permission checks explicit where they're needed.
 */
export async function getCurrentUserRole(): Promise<"owner" | "member" | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data?.role as "owner" | "member" | undefined) ?? null;
}
