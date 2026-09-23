/**
 * /invoice/:token — PUBLIC, read-only invoice form. No auth, no app
 * shell: the page lives outside the route groups by design (share page
 * precedent) and inherits only the root layout (font/theme).
 *
 * HOW TO TEST (locally — ⚠ invoices migration + seed applied first):
 *   1. Seed plants a link for the sent INV-0002 with token
 *      00000000-0000-0000-0000-000000000070 → open
 *      http://localhost:3000/invoice/00000000-0000-0000-0000-000000000070
 *      in an INCOGNITO window (no session) — the invoice renders as a
 *      clean form: number, billed to, line items, subtotal → tax →
 *      total, due date, notes, from-line, Print button.
 *   2. The DRAFT invoice's seeded link (token …0069) opens the SAME
 *      generic "unavailable" state as a revoked or garbage token —
 *      drafts are never shared, and the visitor cannot tell which kind
 *      of link they have (by design).
 *   3. /invoice/not-a-uuid never reaches the database (shape check
 *      first).
 *   4. "Print" → the browser print dialog (the v1 export story — no
 *      markdown/PDF endpoint recorded-cut).
 *
 * Security notes: data comes ONLY from the get_shared_invoice SECURITY
 * DEFINER RPC (invoice_links itself is fully member-gated); invalid vs
 * revoked vs draft vs void are indistinguishable; no ids or internals
 * are returned (workspace_name is the intended seller identity).
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Printer } from "lucide-react";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { getSharedInvoiceByToken } from "@/lib/data/invoices";
import {
  formatDate,
  formatMoney,
  invoiceNumberLabel,
  isUuid,
} from "@/lib/utils";
import { invoiceTotals } from "@/lib/invoice-totals";

function InvalidState() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center px-6">
      <Badge variant="secondary" className="mb-4">
        Link unavailable
      </Badge>
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

export default async function PublicInvoicePage({
  params,
}: {
  params: { token: string };
}) {
  // Shape-check first: /invoice/demo-token and any garbage path never
  // reach the database.
  if (!isUuid(params.token)) {
    return <InvalidState />;
  }

  let invoice = null;
  try {
    invoice = await getSharedInvoiceByToken(params.token);
  } catch {
    // RPC/DB failure renders the same generic state — no internals here.
    return <InvalidState />;
  }

  if (!invoice) {
    return <InvalidState />;
  }

  const totals = invoiceTotals(invoice.items, invoice.tax_percent);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      {/* minimal public chrome */}
      <div className="mb-6 flex items-center justify-between">
        <span className="font-display text-lg font-bold tracking-tight">
          nook<span className="text-accent">script</span>
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Shared invoice — read only</Badge>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="print:hidden"
            onClick={() => window.print()}
          >
            <Printer className="mr-2 h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {invoiceNumberLabel(invoice.invoice_number)}
        </h1>
        <InvoiceStatusBadge status={invoice.status} />
      </div>
      <p className="mb-6 text-sm text-muted-foreground">{invoice.title}</p>

      <Card>
        <CardHeader className="space-y-4 border-b border-border px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Billed to
              </p>
              <p className="mt-1 text-sm font-medium">{invoice.client_name}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                From
              </p>
              <p className="mt-1 text-sm font-medium">{invoice.workspace_name}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Issued
              </p>
              <p className="mt-1 text-sm">
                {formatDate(invoice.sent_at)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Due
              </p>
              <p className="mt-1 text-sm">{formatDate(invoice.due_date)}</p>
            </div>
            {invoice.paid_at && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Paid
                </p>
                <p className="mt-1 text-sm">{formatDate(invoice.paid_at)}</p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          {/* line items */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_3.5rem_6rem_6.5rem] gap-2 border-b border-border pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit</span>
              <span className="text-right">Amount</span>
            </div>
            {invoice.items.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No line items.
              </p>
            ) : (
              invoice.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_3.5rem_6rem_6.5rem] gap-2 text-sm"
                >
                  <span>{item.description}</span>
                  <span className="text-right text-muted-foreground">
                    {item.quantity}
                  </span>
                  <span className="text-right text-muted-foreground">
                    {formatMoney(item.unit_amount_cents)}
                  </span>
                  <span className="text-right">
                    {formatMoney(item.quantity * item.unit_amount_cents)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* totals — computed, never stored */}
          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatMoney(totals.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax ({invoice.tax_percent}%)</span>
              <span>{formatMoney(totals.tax_cents)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-display text-base font-bold tracking-tight">
              <span>Total</span>
              <span>{formatMoney(totals.total_cents)}</span>
            </div>
          </div>

          {invoice.notes.trim() !== "" && (
            <p className="border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
              {invoice.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground print:hidden">
        Shared via nookscript
      </p>
    </main>
  );
}
