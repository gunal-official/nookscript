/**
 * /contracts — per-workspace engagement agreements (Step 19, third
 * platform-phase feature). Create happens on this page; the terms,
 * lifecycle stamps, and signatory live on the detail page.
 *
 * HOW TO TEST (locally — ⚠ apply the contracts migration + seed first):
 *   1. Open /contracts: TWO seeded contracts — "Brand refresh —
 *      engagement agreement" (Signed badge, Brightloop brief chip) and
 *      "Seasonal packaging — engagement agreement" (Draft badge,
 *      "Standalone — no brief"). The Draft/Sent/Signed/Void tabs (with
 *      counts) filter; search matches title or client.
 *   2. "New contract" opens an inline form — client (free text with
 *      datalist suggestions from the briefs), title, optional brief,
 *      optional expiry — saving creates a DRAFT and redirects to its
 *      composer.
 *   3. Saving edits on the detail page revalidates this list (badge and
 *      "updated" time move after navigating back).
 */

import { ContractsList } from "@/components/contracts/ContractsList";
import { getContracts } from "@/lib/data/contracts";
import { getBriefs } from "@/lib/data/briefs";
import { getWorkspaceContext } from "@/lib/data/workspace-context";

export default async function ContractsPage() {
  // Scoped to the caller's ACTIVE workspace (Step 16), like every list.
  const context = await getWorkspaceContext();
  const [contracts, briefs] = await Promise.all([
    context ? getContracts(context.id) : Promise.resolve([]),
    context ? getBriefs(context.id) : Promise.resolve([]),
  ]);

  // id → title map for the cards + create form's brief picker.
  const briefTitles: Record<string, string> = {};
  for (const brief of briefs) briefTitles[brief.id] = brief.title;

  // Datalist suggestions: distinct client names seen on this
  // workspace's briefs (suggestion only — client_name stays free text).
  const clientSuggestions = Array.from(
    new Set(briefs.map((b) => b.client_name).filter((c): c is string => !!c))
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Contracts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Engagement agreements — draft → sent → signed, plus void as the
          audit-safe cancel.
        </p>
      </div>

      <ContractsList
        contracts={contracts}
        briefTitles={briefTitles}
        clientSuggestions={clientSuggestions}
      />
    </div>
  );
}
