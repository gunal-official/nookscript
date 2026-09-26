import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TimeEntry } from "@/lib/types/time";

/**
 * Server-side data access for time entries (Step 18). Same conventions as
 * lib/data/invoices.ts: cookie-authenticated server client, list reads pin
 * the caller's ACTIVE workspace explicitly (Step 16 — RLS is the security
 * gate; the filter keeps multi-workspace users' logs unmerged). Call only
 * with an active session. There is no public surface — members only.
 */

/** All time entries for a workspace, most recently worked first:
 *  worked_on desc, then created_at desc (the (workspace_id, worked_on
 *  desc) index backs the first key). */
export async function getTimeEntries(
  workspaceId: string
): Promise<TimeEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("time_entries")
    .select(
      "id, brief_id, description, worked_on, duration_minutes, created_at, updated_at"
    )
    .eq("workspace_id", workspaceId)
    .order("worked_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TimeEntry[];
}
