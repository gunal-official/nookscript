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

  const supabase = createClient();
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
