/**
 * /briefs — list view of every brief in the workspace, with status filter
 * tabs and search.
 *
 * HOW TO TEST (locally — Supabase configured per README.md, seed loaded):
 *   1. Log in and open /briefs: the seeded "Brightloop Co." brief renders as
 *      a card — Draft badge, client name, "1 open question" badge, and an
 *      "Updated … ago" timestamp.
 *   2. Status tabs (All / Draft / In review / Approved with counts) and the
 *      search box both filter the grid client-side; with no matches you get
 *      the "No matching briefs" empty state + Clear filters.
 *   3. Title links into /briefs/[id]; changing the status there and
 *      navigating back shows the updated badge (updateBriefStatus already
 *      revalidates /briefs).
 *   4. "New brief" links to /intake. With zero briefs the page shows the
 *      "No briefs yet" empty state with a create CTA.
 */

import Link from "next/link";
import { Plus } from "lucide-react";

import { BriefsList } from "@/components/briefs/BriefsList";
import { Button } from "@/components/ui/button";
import { getBriefs } from "@/lib/data/briefs";

export default async function BriefsPage() {
  // RLS scopes this to the current user's workspaces automatically.
  const briefs = await getBriefs();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Briefs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every client brief in your workspace.
          </p>
        </div>
        <Button asChild>
          <Link href="/intake">
            <Plus className="mr-2 h-4 w-4" />
            New brief
          </Link>
        </Button>
      </div>

      <BriefsList briefs={briefs} />
    </div>
  );
}
