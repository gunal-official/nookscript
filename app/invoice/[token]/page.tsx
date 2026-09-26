/**
 * /invoice/:token — PUBLIC, read-only invoice document (Step 34(b) client
 * treatment, mirrors the member invoice paper). No auth, no app shell:
 * the page lives outside the route groups (share page precedent) and
 * inherits only the root layout (font/theme).
 *
 * HOW TO TEST (locally — ⚠ invoices migration + seed applied first):
 *   1. Seed plants a link for the sent INV-0002 with token
 *      00000000-0000-0000-0000-000000000070 → open
 *      http://localhost:3000/invoice/00000000-0000-0000-0000-000000000070
 *      in an INCOGNITO window (no session) — the invoice renders as a
 *      paper invoice: letterhead, billed-to, wrap-safe line items,
 *      subtotal → tax → total, notes footer, Print button in the chrome.
 *   2. The DRAFT invoice's seeded link (token …0069) opens the SAME
 *      generic "unavailable" state as a revoked or garbage token —
 *      drafts are never shared, and the visitor cannot tell which kind
 *      of link they have (by design).
 *   3. /invoice/not-a-uuid never reaches the database (shape check
 *      first).
 *   4. "Print" → the browser print dialog. Print output = the paper only
 *      (chrome + footer are print:hidden).
 *   5. "Download PDF" → GET /api/pdf/shared/invoice/<token> streams the
 *      same invoice as a real PDF file (same totals, letterhead and
 *      notes); a revoked or draft link 404s there exactly as it does
 *      here.
 *
 * Security notes: data comes ONLY from the get_shared_invoice SECURITY
 * DEFINER RPC (invoice_links itself is fully member-gated); invalid vs
 * revoked vs draft vs void are indistinguishable; no ids or internals
 * are returned (workspace_name is the intended seller identity).
 */

import { Link2Off } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { PrintButton } from "@/components/invoices/PrintButton";
import { DownloadPdfButton } from "@/components/ui/DownloadPdfButton";
import { PaperCard } from "@/components/ui/doc-detail";
import { getSharedInvoiceByToken } from "@/lib/data/invoices";
import {
  formatDate,
  formatMoney,
  invoiceNumberLabel,
  isUuid,
} from "@/lib/utils";
import { invoiceTotals } from "@/lib/invoice-totals";

function Brand({ token }: { token?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <span className="font-display text-lg font-bold tracking-tight">
        nook<span className="text-accent">script</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Shared invoice — read only</Badge>
        {/* Only offered once the token resolved: the unavailable state must
            not hand a visitor a download link that 404s. */}
        {token && (
          <DownloadPdfButton
            href={`/api/pdf/shared/invoice/${token}`}
            label="Download PDF"
          />
        )}
        <PrintButton />
      </div>
    </div>
  );
}

function InvalidState() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col [justify-content:safe_center] px-6">
      <Brand />
      <span className="icon-chip icon-chip-muted mb-4 h-10 w-10">
        <Link2Off className="h-5 w-5" aria-hidden="true" />
      </span>
      <h1 className="font-display text-3xl font-bold tracking-tight">
        This link is invalid or has been revoked
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask the sender for a new link, or check that the URL was copied
        in full.
      </p>
    </main>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Shape-check first: /invoice/demo-token and any garbage path never
  // reach the database.
  if (!isUuid(token)) {
    return <InvalidState />;
  }

  let invoice = null;
  try {
    invoice = await getSharedInvoiceByToken(token);
  } catch {
    // RPC/DB failure renders the same generic state — no internals here.
    return <InvalidState />;
  }

  if (!invoice) {
    return <InvalidState />;
  }

  const totals = invoiceTotals(invoice.items, invoice.tax_percent);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col [justify-content:safe_center] px-6 py-16">
      <Brand token={token} />

      <PaperCard
        letterLabel="Invoice"
        letterhead={invoice.workspace_name}
        meta={invoiceNumberLabel(invoice.invoice_number)}
        footer={
          invoice.notes.trim() !== "" ? (
            <div className="space-y-1.5">
              <FieldLabel>Notes</FieldLabel>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {invoice.notes}
              </p>
            </div>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {invoice.title}
              </h1>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoiceNumberLabel(invoice.invoice_number)} ·{" "}
              {invoice.workspace_name}
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>Issued {formatDate(invoice.sent_at)}</p>
            <p>Due {formatDate(invoice.due_date)}</p>
            {invoice.paid_at && <p>Paid {formatDate(invoice.paid_at)}</p>}
          </div>
        </div>

        <div className="mt-5">
          <FieldLabel>Billed to</FieldLabel>
          <p className="mt-1 font-display text-lg font-bold">
            {invoice.client_name}
          </p>
        </div>

        {/* Line items — wrapping rows (no clipped cells at any width). */}
        <div className="mt-6 border-t border-border">
          {invoice.items.length === 0 ? (
            <p className="py-3 text-sm italic text-muted-foreground">
              No line items.
            </p>
          ) : (
            invoice.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border py-3"
              >
                <p className="min-w-0 flex-1 basis-full text-sm sm:basis-auto">
                  {item.description}
                </p>
                <p className="w-12 shrink-0 text-right text-sm text-muted-foreground">
                  ×{item.quantity}
                </p>
                <p className="w-20 shrink-0 text-right text-sm text-muted-foreground">
                  {formatMoney(item.unit_amount_cents)}
                </p>
                <p className="w-24 shrink-0 text-right text-sm font-medium">
                  {formatMoney(item.quantity * item.unit_amount_cents)}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Totals — computed, never stored (same math as the member app). */}
        <div className="mt-5 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between gap-6">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatMoney(totals.subtotal_cents)}</dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt className="text-muted-foreground">
                Tax ({invoice.tax_percent}%)
              </dt>
              <dd>{formatMoney(totals.tax_cents)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-6 border-t border-border pt-2">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Total
              </dt>
              <dd className="font-display text-xl font-bold">
                {formatMoney(totals.total_cents)}
              </dd>
            </div>
          </dl>
        </div>
      </PaperCard>

      <p className="mt-6 text-center text-xs text-muted-foreground print:hidden">
        Shared via nookscript — the sender can revoke this link at any
        time.
      </p>
    </main>
  );
}
