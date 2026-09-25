"use server";

/**
 * Server actions for /contracts/[id].
 *
 * TESTING (local, after the contracts migration + seed):
 *   1. Open the seeded signed contract ("Brand refresh — engagement
 *      agreement"). Details show Sent + Signed dates (the audit stamps)
 *      and the signatory.
 *   2. Status: Signed → Draft CLEARS signed_at; → Sent keeps sent_at
 *      (never overwritten on re-send); → Signed stamps it again; → Void
 *      keeps every stamp — the row is never destroyed.
 *   3. Composer edits (title, client, brief, terms, expiry, signatory)
 *      persist on Save.
 *   4. There is no delete anywhere — void is the cancel.
 *
 * STATUS STAMPING (mirrors invoices): sent_at is stamped the first time
 * a contract becomes "sent" (never overwritten); signed_at is stamped
 * when it becomes "signed" and CLEARED when it leaves "signed".
 */

import { revalidatePath } from "next/cache";

import { requireEditor } from "@/lib/data/workspace-context";
import { recordEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import type { ContractStatus } from "@/lib/types/contract";

export type ActionResult = { error?: string } | undefined;

const VALID_STATUSES: ContractStatus[] = ["draft", "sent", "signed", "void"];

async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return supabase;
}

/** Manual save from the composer. */
export async function saveContract(input: {
  contractId: string;
  title: string;
  client_name: string;
  brief_id: string | null;
  terms: string;
  expires_on: string | null;
  signed_by: string;
}): Promise<ActionResult> {
  const title = input.title?.trim() ?? "";
  const clientName = input.client_name?.trim() ?? "";
  if (!title) return { error: "Title is required." };
  if (!clientName) return { error: "Client is required." };

  const briefId = input.brief_id?.trim() || null;
  if (briefId !== null && !isUuid(briefId)) return { error: "Unknown brief." };
  if (!isUuid(input.contractId)) return { error: "Unknown contract." };

  const supabase = await requireSession();
  if (!supabase)
    return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  const { error } = await supabase
    .from("contracts")
    .update({
      title,
      client_name: clientName,
      brief_id: briefId,
      terms: input.terms ?? "",
      expires_on: input.expires_on,
      signed_by: input.signed_by?.trim() ?? "",
    })
    .eq("id", input.contractId);

  if (error) return { error: error.message };

  revalidatePath(`/contracts/${input.contractId}`);
  revalidatePath("/contracts");
  return { error: undefined };
}

/** Lifecycle transition. Stamps audit timestamps as part of the write:
 *  → sent: sent_at set once (first send kept);
 *  → signed: signed_at = now;
 *  leaving signed: signed_at cleared. */
export async function setContractStatus(input: {
  contractId: string;
  status: ContractStatus;
}): Promise<ActionResult> {
  if (!VALID_STATUSES.includes(input.status)) {
    return { error: "Invalid status." };
  }
  if (!isUuid(input.contractId)) return { error: "Unknown contract." };

  const supabase = await requireSession();
  if (!supabase)
    return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // Read the current row (RLS-scoped; foreign contracts look absent) so
  // the stamps are computed from real state, not assumptions.
  const { data: contract, error: fetchError } = await supabase
    .from("contracts")
    .select("status, sent_at, signed_at, workspace_id, title, client_name")
    .eq("id", input.contractId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!contract) return { error: "Contract not found." };

  const previous = contract.status as ContractStatus;
  let sentAt: string | null = contract.sent_at;
  let signedAt: string | null = contract.signed_at;

  if (input.status === "sent" && previous !== "sent" && !sentAt) {
    sentAt = new Date().toISOString(); // stamped once, never overwritten
  }
  if (input.status === "signed" && previous !== "signed") {
    signedAt = new Date().toISOString();
  }
  if (previous === "signed" && input.status !== "signed") {
    signedAt = null; // cleared when leaving "signed" (invoice precedent)
  }

  const { error } = await supabase
    .from("contracts")
    .update({ status: input.status, sent_at: sentAt, signed_at: signedAt })
    .eq("id", input.contractId);

  if (error) return { error: error.message };

  if (previous !== "signed" && input.status === "signed") {
    await recordEvent(supabase, {
      workspace_id: contract.workspace_id,
      event_type: "contract.signed",
      payload: {
        contract_id: input.contractId,
        title: contract.title,
        client_name: contract.client_name,
      },
    });
  }

  revalidatePath(`/contracts/${input.contractId}`);
  revalidatePath("/contracts");
  return { error: undefined };
}
