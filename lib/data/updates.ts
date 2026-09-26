import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  UpdateStatus,
  UpdateSummary,
  UpdateWithPlan,
} from "@/lib/types/update";

/**
 * Server-side data access for updates. Same conventions as
 * lib/data/plans.ts: cookie-authenticated server client. List reads pin
 * the caller's ACTIVE workspace explicitly (Step 16 — RLS is the security
 * gate; the filter keeps multi-workspace users' lists unmerged).
 * Call only with an active session.
 */

const EXCERPT_LENGTH = 140;

/** Summary rows for the /updates list, most recently updated first. */
export async function getUpdates(
  workspaceId: string
): Promise<UpdateSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("updates")
    .select("id, title, client_name, status, updated_at, body")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    client_name: string | null;
    status: UpdateStatus;
    updated_at: string;
    body: string | null;
  }>;

  return rows.map((row) => {
    const collapsed = (row.body ?? "").replace(/\s+/g, " ").trim();
    return {
      id: row.id,
      title: row.title,
      client_name: row.client_name,
      status: row.status,
      updated_at: row.updated_at,
      excerpt:
        collapsed.length > EXCERPT_LENGTH
          ? `${collapsed.slice(0, EXCERPT_LENGTH - 1)}…`
          : collapsed,
    };
  });
}

/** A single update with its source plan (id + title) embedded via the
 *  plans FK. Returns null when not found (or not visible via RLS). */
export async function getUpdateById(
  updateId: string
): Promise<UpdateWithPlan | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("updates")
    .select("*, plan:plans(id, title)")
    .eq("id", updateId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as UpdateWithPlan | null;
}
