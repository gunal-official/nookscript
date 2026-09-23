import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { BriefDeliverable } from "@/lib/types/brief";
import type {
  ProposalStatus,
  ProposalSummary,
  ProposalWithBrief,
} from "@/lib/types/proposal";

/**
 * Server-side data access for proposals. Same conventions as
 * lib/data/briefs.ts: cookie-authenticated server client, so RLS scopes
 * every read to the current user's workspaces — no manual workspace_id
 * filters anywhere. Call only with an active session.
 */

/** Summary rows for the /proposals list, most recently updated first. */
export async function getProposals(): Promise<ProposalSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("proposals")
    .select("id, title, client_name, status, updated_at, deliverables")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    client_name: string | null;
    status: ProposalStatus;
    updated_at: string;
    deliverables: BriefDeliverable[] | null;
  }>;

  return rows.map((row) => {
    const deliverables = row.deliverables ?? [];
    return {
      id: row.id,
      title: row.title,
      client_name: row.client_name,
      status: row.status,
      updated_at: row.updated_at,
      deliverablesTotal: deliverables.length,
      deliverablesDone: deliverables.filter((d) => d.checked).length,
    };
  });
}

/** A single proposal with its source brief (id + title) embedded via the
 *  briefs FK. Returns null when not found (or not visible via RLS). */
export async function getProposalById(
  proposalId: string
): Promise<ProposalWithBrief | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("proposals")
    .select("*, brief:briefs(id, title)")
    .eq("id", proposalId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ProposalWithBrief | null;
}
