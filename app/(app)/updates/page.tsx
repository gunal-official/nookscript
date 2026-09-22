/**
 * /updates — client updates composed from plans, with status filter tabs
 * and search.
 *
 * HOW TO TEST (locally — Supabase configured per README.md, ⚠ apply the
 * new updates migration + seed first):
 *   1. Open /updates: TWO seeded updates render — "…Week 1" (Sent badge,
 *      older) and "…Week 2" (Draft badge, more recent, first in the grid
 *      thanks to updated_at ordering). The Draft/Sent tabs (with counts)
 *      filter between them; the search box matches title or client.
 *   2. No matches → "No matching updates" + Clear filters. With zero
 *      updates the page shows "No updates yet" with a CTA to /plans
 *      (there is no "New" button — updates only originate from plans).
 *   3. Card title links into /updates/[id]; saving edits or changing the
 *      status there and navigating back reflects here (both actions
 *      revalidate /updates).
 */

import { UpdatesList } from "@/components/updates/UpdatesList";
import { getUpdates } from "@/lib/data/updates";

export default async function UpdatesPage() {
  // RLS scopes this to the current user's workspaces automatically.
  const updates = await getUpdates();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Updates
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Composed from plans — open a plan to write one.
        </p>
      </div>

      <UpdatesList updates={updates} />
    </div>
  );
}
