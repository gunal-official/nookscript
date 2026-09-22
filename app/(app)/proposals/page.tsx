/**
 * /proposals — proposals generated from briefs, with status filter tabs
 * and search.
 *
 * HOW TO TEST (locally — Supabase configured per README.md, seed loaded):
 *   1. Open /proposals: the seeded "Brightloop Co." proposal renders as a
 *      card — Draft badge, client name, "1/3 deliverables done" chip, and
 *      an "Updated … ago" timestamp.
 *   2. Status tabs (All / Draft / Sent / Accepted / Declined with counts)
 *      and the search box filter the grid client-side; no matches →
 *      "No matching proposals" + Clear filters. With zero proposals the
 *      page shows "No proposals yet" with a CTA to /briefs (there is no
 *      "New" button — proposals only originate from briefs).
 *   3. Card title links into /proposals/[id]; changing the status there
 *      and navigating back shows the updated badge (updateProposalStatus
 *      revalidates /proposals).
 */

import { ProposalsList } from "@/components/proposals/ProposalsList";
import { getProposals } from "@/lib/data/proposals";

export default async function ProposalsPage() {
  // RLS scopes this to the current user's workspaces automatically.
  const proposals = await getProposals();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Proposals
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generated from briefs — open a brief to create one.
        </p>
      </div>

      <ProposalsList proposals={proposals} />
    </div>
  );
}
