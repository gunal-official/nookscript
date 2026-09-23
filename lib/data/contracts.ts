import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Contract, ContractSummary } from "@/lib/types/contract";

/**
 * Server-side data access for contracts (Step 19). Same conventions as
 * lib/data/invoices.ts: cookie-authenticated server client, list reads
 * pin the caller's ACTIVE workspace explicitly (Step 16 — RLS is the
 * security gate; the filter keeps multi-workspace users' lists
 * unmerged). Members only — contracts have no public surface.
 */

/** Summary rows for the /contracts list, most recently created first
 *  (the (workspace_id, created_at desc) index backs this). */
export async function getContracts(
  workspaceId: string
): Promise<ContractSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contracts")
    .select("id, title, client_name, status, brief_id, expires_on, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ContractSummary[];
}

/** Full row for the composer. RLS-scoped: a foreign-workspace id
 *  resolves to null (identical to "not found"). */
export async function getContractById(id: string): Promise<Contract | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contracts")
    .select(
      "id, workspace_id, brief_id, client_name, title, status, terms, expires_on, signed_by, sent_at, signed_at, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as Contract | null) ?? null;
}
