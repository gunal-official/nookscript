import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  PlanStatus,
  PlanSummary,
  PlanTask,
  PlanWithProposal,
} from "@/lib/types/plan";

/**
 * Server-side data access for plans. Same conventions as
 * lib/data/proposals.ts: cookie-authenticated server client. List reads
 * pin the caller's ACTIVE workspace explicitly (Step 16 — RLS is the
 * security gate; the filter keeps multi-workspace users' lists unmerged).
 * Call only with an active session.
 */

/** Summary rows for the /plans list, most recently updated first. */
export async function getPlans(
  workspaceId: string
): Promise<PlanSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plans")
    .select("id, title, client_name, status, updated_at, tasks")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    client_name: string | null;
    status: PlanStatus;
    updated_at: string;
    tasks: PlanTask[] | null;
  }>;

  return rows.map((row) => {
    const tasks = row.tasks ?? [];
    return {
      id: row.id,
      title: row.title,
      client_name: row.client_name,
      status: row.status,
      updated_at: row.updated_at,
      tasksTotal: tasks.length,
      tasksDone: tasks.filter((t) => t.checked).length,
    };
  });
}

/** A single plan with its source proposal (id + title) embedded via the
 *  proposals FK. Returns null when not found (or not visible via RLS). */
export async function getPlanById(
  planId: string
): Promise<PlanWithProposal | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plans")
    .select("*, proposal:proposals(id, title)")
    .eq("id", planId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as PlanWithProposal | null;
}
