import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDuration, formatMoney } from "@/lib/utils";
import type { Report } from "@/lib/reports";

/**
 * Presentation for /reports (Step 20). Pure — no client state, no
 * handlers, no island: the whole page renders server-side from the
 * computed Report (D4: fixed windows, no picker). "Charts" are
 * pure-CSS bar widths (no chart dependency).
 */

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">
        {label}
        {hint && (
          <span className="ml-1.5 text-xs text-muted-foreground/70">
            {hint}
          </span>
        )}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function MoneySection({ report }: { report: Report }) {
  const { money } = report;
  const anyInvoices =
    money.draft_count + money.sent_count + money.paid_count + money.void_count;
  return (
    <Card>
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <CardTitle className="text-base">Money</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        {anyInvoices === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <>
            <Stat
              label="Collected"
              value={formatMoney(money.collected_cents)}
              hint={`${money.paid_count} paid`}
            />
            <Stat
              label="Outstanding"
              value={formatMoney(money.outstanding_cents)}
              hint={`${money.sent_count} sent`}
            />
            <Stat
              label="Draft"
              value={formatMoney(money.draft_cents)}
              hint={`${money.draft_count} draft`}
            />
            {money.void_count > 0 && (
              <p className="text-xs text-muted-foreground">
                {money.void_count} voided invoice{money.void_count > 1 ? "s" : ""}{" "}
                excluded from all totals.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TimeSection({ report }: { report: Report }) {
  const { time } = report;
  const maxMinutes = time.by_brief.reduce(
    (max, bar) => Math.max(max, bar.minutes),
    0
  );
  return (
    <Card>
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <CardTitle className="text-base">Time</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <Stat label="Today" value={formatDuration(time.today_minutes)} />
        <Stat
          label="This month"
          value={formatDuration(time.month_minutes)}
        />
        <Stat
          label="All time"
          value={formatDuration(time.all_minutes)}
        />

        {time.by_brief.length > 0 && (
          <div className="pt-2">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              This month, by brief
            </p>
            <div className="space-y-2.5">
              {time.by_brief.map((bar) => (
                <div key={bar.brief_id ?? "general"}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate">{bar.title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatDuration(bar.minutes)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${
                          maxMinutes > 0
                            ? Math.max(2, Math.round((bar.minutes / maxMinutes) * 100))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContractsSection({ report }: { report: Report }) {
  const { contracts } = report;
  const total =
    contracts.draft_count +
    contracts.sent_count +
    contracts.signed_count +
    contracts.void_count;
  return (
    <Card>
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <CardTitle className="text-base">Contracts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No contracts yet.</p>
        ) : (
          <>
            <Stat
              label="Signed"
              value={String(contracts.signed_count)}
            />
            <Stat
              label="Sent"
              value={String(contracts.sent_count)}
            />
            <Stat
              label="Draft"
              value={String(contracts.draft_count)}
            />
            {contracts.void_count > 0 && (
              <Stat label="Void" value={String(contracts.void_count)} />
            )}
            <div className="border-t border-border pt-3">
              <Stat
                label="Expiring within 30 days"
                value={String(contracts.expiring_soon_count)}
              />
              <Stat
                label="Expired"
                value={String(contracts.expired_count)}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportsView({ report }: { report: Report }) {
  return (
    <div className="grid items-start gap-6 md:grid-cols-3">
      <MoneySection report={report} />
      <TimeSection report={report} />
      <ContractsSection report={report} />
    </div>
  );
}
