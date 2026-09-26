/**
 * /invoices/:id — the invoice document (Step 34(b) money treatment): the
 * invoice rendered as a paper invoice (line items, computed totals block,
 * notes), stat tiles (total / due / paid), the public-link panel, and an
 * activity timeline with the audit stamps. The composer sits below for
 * editing — totals are computed here exactly as on the public view.
 *
 * HOW TO TEST (locally — ⚠ invoices migration + seed applied first):
 *   1. From /invoices open the seeded INV-0002 (sent). The paper invoice
 *      shows line items; totals (subtotal → tax → total) match the
 *      public view's math and the composer below.
 *   2. Edit a price in the composer → "Unsaved changes" chip → Save: the
 *      items jsonb updates and the chip clears.
 *   3. Status: Sent → Paid stamps invoices.paid_at (tiles + timeline
 *      update after reload); Paid → Sent clears it; Void keeps stamps.
 *   4. Link panel: create → copy the /invoice/<token> URL → open it in an
 *      INCOGNITO window: the invoice renders read-only with a Print
 *      button. Revoke → the URL shows "unavailable"; regenerate works.
 *   5. Bogus or foreign ids render the "not found" state (RLS hides
 *      them identically).
 */

import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CircleDollarSign,
  Clock,
  FilePlus2,
  Hourglass,
  Link2,
  Receipt,
  Send,
  Wallet,
} from "lucide-react";

import { getInvoiceById } from "@/lib/data/invoices";
import { getInvoiceLinkForInvoice } from "@/lib/data/invoices";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { invoiceTotals } from "@/lib/invoice-totals";
import { formatDate, formatMoney, isUuid, invoiceNumberLabel, timeAgo } from "@/lib/utils";
import { InvoiceComposer } from "@/components/invoices/InvoiceComposer";
import { InvoiceLinkPanel } from "@/components/invoices/InvoiceLinkPanel";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { InvoiceStatusSelect } from "@/components/invoices/InvoiceStatusSelect";
import { PrintButton } from "@/components/invoices/PrintButton";
import { DownloadPdfButton } from "@/components/ui/DownloadPdfButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActivityTimeline,
  DocHeader,
  PaperCard,
  StatTile,
  type TimelineEvent,
} from "@/components/ui/doc-detail";

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
      <span className="min-w-0 break-words text-right">{children}</span>
    </div>
  );
}

function RailCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="animate-rise-in">
      <CardHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-border px-5 py-3.5">
        <span className="icon-chip icon-chip-muted h-8 w-8">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3.5 p-5">{children}</CardContent>
    </Card>
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

  const totals = invoiceTotals(invoice.items, invoice.tax_percent);
  const today = new Date().toISOString().slice(0, 10);
  const overdue =
    invoice.status === "sent" && !!invoice.due_date && invoice.due_date < today;

  const events: TimelineEvent[] = [
    {
      icon: FilePlus2,
      title: "Created",
      detail: invoiceNumberLabel(invoice.invoice_number),
      at: formatDate(invoice.created_at),
      tone: "muted",
    },
    ...(invoice.sent_at
      ? [
          {
            icon: Send,
            title: "Sent to client",
            detail: invoice.client_name,
            at: formatDate(invoice.sent_at),
            tone: "accent",
          } as TimelineEvent,
        ]
      : []),
    ...(invoice.paid_at
      ? [
          {
            icon: CircleDollarSign,
            title: "Paid",
            detail: formatMoney(totals.total_cents),
            at: formatDate(invoice.paid_at),
            tone: "success",
          } as TimelineEvent,
        ]
      : []),
    ...(invoice.status === "void"
      ? [
          {
            icon: Ban,
            title: "Voided",
            detail: "Keeps every audit stamp",
            at: timeAgo(invoice.updated_at),
            tone: "error",
          } as TimelineEvent,
        ]
      : []),
    ...(invoice.due_date && invoice.status !== "paid" && invoice.status !== "void"
      ? [
          {
            icon: Hourglass,
            title: overdue ? "Overdue" : "Payment due",
            detail: overdue ? "Past the due date" : "Last day to pay",
            at: formatDate(invoice.due_date),
            tone: overdue ? "error" : "muted",
          } as TimelineEvent,
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/invoices"
        className="mb-3 inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Invoices
      </Link>

      <DocHeader
        icon={Receipt}
        title={invoice.title}
        badges={<InvoiceStatusBadge status={invoice.status} />}
        subtitle={`${invoiceNumberLabel(invoice.invoice_number)} · ${invoice.client_name}`}
        actions={
          <>
            <DownloadPdfButton href={`/api/pdf/invoice/${invoice.id}`} />
            <PrintButton />
          </>
        }
      />

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          icon={Wallet}
          label="Total due"
          value={formatMoney(totals.total_cents)}
          hint={
            invoice.tax_percent > 0
              ? `incl. ${invoice.tax_percent}% tax`
              : "No tax applied"
          }
          tone="accent"
        />
        <StatTile
          icon={Clock}
          label="Due date"
          value={invoice.due_date ? formatDate(invoice.due_date) : "No due date"}
          hint={
            overdue
              ? "Overdue"
              : invoice.due_date
                ? "Last day to pay"
                : "Payable on receipt"
          }
          tone={overdue ? "error" : "muted"}
        />
        <StatTile
          icon={CircleDollarSign}
          label="Payment"
          value={
            invoice.paid_at
              ? formatDate(invoice.paid_at)
              : invoice.status === "sent"
                ? "Awaiting"
                : invoice.status === "void"
                  ? "Void"
                  : "Not sent"
          }
          hint={
            invoice.paid_at
              ? "Recorded in full"
              : `Outstanding ${formatMoney(totals.total_cents)}`
          }
          tone={invoice.paid_at ? "success" : "muted"}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* ── Left: the invoice document + composer ── */}
        <div className="space-y-6">
          <PaperCard
            letterLabel="Invoice"
            letterhead={context.name}
            meta={invoiceNumberLabel(invoice.invoice_number)}
            footer={
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Notes
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {invoice.notes || "—"}
                </p>
              </div>
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Billed to
                </p>
                <p className="mt-1 font-display text-lg font-bold">
                  {invoice.client_name}
                </p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>Issued {formatDate(invoice.created_at)}</p>
                <p>
                  Due {invoice.due_date ? formatDate(invoice.due_date) : "on receipt"}
                </p>
              </div>
            </div>

            {/* Line items — wrapping rows (no clipped cells). */}
            <div className="mt-6 border-t border-border">
              {invoice.items.map((item) => (
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
              ))}
            </div>

            {/* Totals — computed, never stored. */}
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

          <Card className="animate-rise-in">
            <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
              <CardTitle className="text-base">Edit invoice</CardTitle>
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
        </div>

        {/* ── Right: link + metadata rail ── */}
        <div className="space-y-4">
          <RailCard
            icon={Link2}
            title="Public link"
            description="Read-only invoice the client can open and print — revocable any time."
          >
            <InvoiceLinkPanel invoiceId={invoice.id} invoiceLink={link} />
          </RailCard>

          <RailCard icon={Receipt} title="Details">
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
            <MetaRow label="Due">
              {invoice.due_date ? formatDate(invoice.due_date) : "On receipt"}
            </MetaRow>
            {invoice.sent_at && (
              <MetaRow label="Sent">{formatDate(invoice.sent_at)}</MetaRow>
            )}
            {invoice.paid_at && (
              <MetaRow label="Paid">{formatDate(invoice.paid_at)}</MetaRow>
            )}
            <MetaRow label="Created">
              {formatDate(invoice.created_at)}
            </MetaRow>
            <MetaRow label="Updated">{timeAgo(invoice.updated_at)}</MetaRow>
          </RailCard>

          <RailCard icon={Clock} title="Activity">
            <ActivityTimeline events={events} />
          </RailCard>
        </div>
      </div>
    </div>
  );
}
