"use server";

/**
 * Server actions for /proposals/[id].
 *
 * TESTING (local, after README setup + seed data):
 *   1. Open the seeded proposal from /proposals ("Brightloop Co.").
 *   2. Change the status dropdown → proposals.status updates in the Table
 *      Editor, and the /proposals list badge matches after navigating back
 *      (both paths are revalidated here).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getProposalById } from "@/lib/data/proposals";
import { createClient } from "@/lib/supabase/server";
import type { ProposalStatus } from "@/lib/types/proposal";

export type ActionResult = { error?: string } | undefined;

const VALID_STATUSES: ProposalStatus[] = [
  "draft",
  "sent",
  "accepted",
  "declined",
];

export async function updateProposalStatus(input: {
  proposalId: string;
  status: ProposalStatus;
}): Promise<ActionResult> {
  if (!VALID_STATUSES.includes(input.status)) {
    return { error: "Invalid status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };

  // Plain UPDATE; RLS scopes it to the user's workspaces.
  const { error } = await supabase
    .from("proposals")
    .update({ status: input.status })
    .eq("id", input.proposalId);

  if (error) return { error: error.message };

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${input.proposalId}`);
  return { error: undefined };
}

/**
 * Generate a plan from a proposal: copies title / client / budget and maps
 * the proposal's deliverables directly into the plan's tasks array (same
 * {id, text, checked} shape, new column), inserts the plans row as
 * 'not_started', then redirects to the new plan's page. Ungated on
 * proposal status (mirrors proposal generation from briefs). All queries
 * go through the session client, so RLS blocks proposals outside the
 * user's workspaces (getProposalById returns null → "Proposal not found.").
 */
export async function createPlanFromProposal(input: {
  proposalId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };

  const proposal = await getProposalById(input.proposalId);
  if (!proposal) return { error: "Proposal not found." };

  const { data: plan, error } = await supabase
    .from("plans")
    .insert({
      workspace_id: proposal.workspace_id,
      proposal_id: proposal.id,
      title: proposal.title,
      client_name: proposal.client_name,
      budget_timeline: proposal.budget_timeline,
      tasks: proposal.deliverables,
      status: "not_started",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  if (!plan) return { error: "Could not create the plan." };

  revalidatePath("/plans");
  // throws NEXT_REDIRECT — intentionally not wrapped in try/catch
  redirect(`/plans/${plan.id}`);
}
