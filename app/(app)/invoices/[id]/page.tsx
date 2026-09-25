/**
 * /invoices/:id — the invoice composer: line items with live totals,
 * tax, notes, due date, the draft/sent/paid/void lifecycle (audit
 * stamps included), and the public link panel.
 *
 * HOW TO TEST (locally — ⚠ invoices migration + seed applied first):
 *   1. From /invoices open the seeded INV-0002 (sent). The composer
 *      shows its line items; totals (subtotal → tax → total) match the
 *      public view's math.
 *   2. Edit a price → "Unsaved changes" chip → Save: the items jsonb
 *      updates and the chip clears.
 *   3. Status: Sent → Paid stamps invoices.paid_at (shown below);
 *      Paid → Sent clears it; Void keeps the stamps (audit trail).
 *   4. Link panel: create → copy the /invoice/<token> URL → open it in
 *      an INCOGNITO window: the invoice renders read-only with a Print
 *      button. Revoke → the URL now shows the generic "unavailable"
 *      state; regenerate → fresh token works.
 *   5. Bogus or foreign ids render the "not found" state (RLS hides
 *      them identically).
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getInvoiceById } from "@/lib/data/invoices";
import { getInvoiceLinkForInvoice } from "@/lib/data/invoices";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { formatDate, isUuid, invoiceNumberLabel, timeAgo } from "@/lib/utils";
import { InvoiceComposer } from "@/components/invoices/InvoiceComposer";
import { InvoiceLinkPanel } from "@/components/invoices/InvoiceLinkPanel";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { InvoiceStatusSelect } from "@/components/invoices/InvoiceStatusSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Badge variant="secondary">Not found</Badge>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Invoice not found
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This invoice doesn’t exist — or it belongs to a workspace you’re
          not a member of.
        </p>
      </div>
      <Button asChild variant="secondary">
        <Link href="/invoices" className="inline-flex min-h-11 min-w-11 items-center">Back to invoices</Link>
      </Button>
    </div>
  );
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) {
    return <NotFoundState />;
  }

  const context = await getWorkspaceContext();
  if (!context?.canSeeMoney) {
    return (
      <div className="mx-auto max-w-3xl border border-border bg-card p-8">
        <p className="text-sm text-muted-foreground">
          View only — invoices and time entries aren’t visible to viewers.
        </p>
      </div>
    );
  }

  const invoice = await getInvoiceById(id);
  if (!invoice) {
    return <NotFoundState />;
  }

  // The link read is RLS-scoped to the caller's workspaces.
  const link = await getInvoiceLinkForInvoice(id);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/invoices"
          className="mb-3 inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5"  aria-hidden="true" />
          Invoices
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-muted-foreground">
            {invoiceNumberLabel(invoice.invoice_number)}
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {invoice.title}
          </h1>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {invoice.client_name}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* ── Left: composer ── */}
        <Card>
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <CardTitle className="text-base">Composer</CardTitle>
            <CardDescription>
              Line items are in dollars; the math is the same on the
              client’s public view. Totals are computed, never stored.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <InvoiceComposer
              invoiceId={invoice.id}
              initialTitle={invoice.title}
              initialClient={invoice.client_name}
              initialItems={invoice.items}
              initialTaxPercent={invoice.tax_percent}
              initialNotes={invoice.notes}
              initialDueDate={invoice.due_date}
            />
          </CardContent>
        </Card>

        {/* ── Right: details ── */}
        <Card>
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5 p-5">
            <MetaRow label="Status">
              <InvoiceStatusSelect
                invoiceId={invoice.id}
                status={invoice.status}
              />
            </MetaRow>
            <MetaRow label="Number">
              {invoiceNumberLabel(invoice.invoice_number)}
            </MetaRow>
            <MetaRow label="Client">{invoice.client_name}</MetaRow>
            <MetaRow label="Due">{formatDate(invoice.due_date)}</MetaRow>
            {invoice.sent_at && (
              <MetaRow label="Sent">{formatDate(invoice.sent_at)}</MetaRow>
            )}
            {invoice.paid_at && (
              <MetaRow label="Paid">{formatDate(invoice.paid_at)}</MetaRow>
            )}
            <MetaRow label="Created">{formatDate(invoice.created_at)}</MetaRow>
            <MetaRow label="Updated">{timeAgo(invoice.updated_at)}</MetaRow>
          </CardContent>
        </Card>

        {/* ── Right: public link ── */}
        <Card>
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <CardTitle className="text-base">Public link</CardTitle>
            <CardDescription>
              Read-only invoice form the client can open and print —
              revocable any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <InvoiceLinkPanel invoiceId={invoice.id} invoiceLink={link} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
