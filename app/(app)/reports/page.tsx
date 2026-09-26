/**
 * /reports — the platform rollup (Step 20, last platform-phase feature).
 * One server page: fetch invoices + time entries + contracts + briefs
 * for the ACTIVE workspace, compute everything in lib/reports.ts (pure
 * TS — nothing stored that can drift), render. No client island: fixed
 * windows, no picker, zero interactivity.
 *
 * HOW TO TEST (locally — requires the Step 17–19 seeds):
 *   1. Open /reports. MONEY: Collected $0.00 (0 paid), Outstanding
 *      $3,150.00 (1 sent — INV-0002 with its 5% tax), Draft $1,950.00
 *      (1 draft — INV-0001).
 *   2. TIME: Today 3h 40m (the seeded entry dated today), This month
 *      8h 25m, All time 8h 25m (all four seeded days — re-seeding near a
 *      month boundary can split "this month"/"all time"). By brief:
 *      "Brightloop Co. — Brand Identity Refresh" 7h 25m, "General —
 *      no brief" 1h.
 *   3. CONTRACTS: Signed 1, Sent 0, Draft 1; Expiring within 30 days
 *      0, Expired 0 (the seeds carry no expiry — set one on a draft to
 *      watch the counters move).
 *   4. Mutate anything (pay an invoice, log time, send a contract) →
 *      navigate back and the numbers follow — no cache, all computed.
 */

import { ReportsView } from "@/components/reports/ReportsView";
import { computeReport } from "@/lib/reports";
import { getInvoices } from "@/lib/data/invoices";
import { getTimeEntries } from "@/lib/data/time";
import { getContracts } from "@/lib/data/contracts";
import { getBriefs } from "@/lib/data/briefs";
import { getWorkspaceContext } from "@/lib/data/workspace-context";

export default async function ReportsPage() {
  // Scoped to the caller's ACTIVE workspace (Step 16), like every list.
  const context = await getWorkspaceContext();
  const [invoices, entries, contracts, briefs] = await Promise.all([
    context ? getInvoices(context.id) : Promise.resolve([]),
    context ? getTimeEntries(context.id) : Promise.resolve([]),
    context ? getContracts(context.id) : Promise.resolve([]),
    context ? getBriefs(context.id) : Promise.resolve([]),
  ]);

  const report = computeReport({ invoices, entries, contracts, briefs });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Reports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The workspace rollup — money, hours, and contracts, computed
          live from your data.
        </p>
      </div>

      <ReportsView report={report} />
    </div>
  );
}
