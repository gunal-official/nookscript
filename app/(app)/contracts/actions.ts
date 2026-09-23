"use server";

/**
 * Server actions for the /contracts list — create-on-list (the invoices
 * precedent: creation happens where the list lives). After creating, the
 * client redirects to the new contract's composer to add terms.
 *
 * TESTING (local, after the contracts migration + seed):
 *   1. /contracts shows the two seeded contracts. "New contract" opens
 *      an inline form — client (free text, datalist from the briefs),
 *      title, optional brief, optional expiry.
 *   2. Saving creates a DRAFT and redirects to its composer.
 */

import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

export type ActionResult = { error?: string; id?: string } | undefined;

export async function createContract(input: {
  client_name: string;
  title: string;
  brief_id: string | null;
  expires_on: string | null;
}): Promise<ActionResult> {
  const clientName = input.client_name?.trim() ?? "";
  const title = input.title?.trim() ?? "";
  if (!clientName) return { error: "Client name is required." };
  if (!title) return { error: "Title is required." };

  const briefId = input.brief_id?.trim() || null;
  if (briefId !== null && !isUuid(briefId)) return { error: "Unknown brief." };

  const expiresOn = input.expires_on?.trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };

  // Create on the ACTIVE workspace (Step 16 resolver).
  const context = await getWorkspaceContext();
  if (!context) {
    return { error: "Your session has expired. Please log in again." };
  }

  const { data, error } = await supabase
    .from("contracts")
    .insert({
      workspace_id: context.id,
      brief_id: briefId,
      client_name: clientName,
      title,
      status: "draft",
      terms: "",
      expires_on: expiresOn,
      signed_by: "",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/contracts");
  return { error: undefined, id: (data as { id: string }).id };
}
