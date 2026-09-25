"use client";

/**
 * Client side of /invoices — status filter tabs + search over the list
 * the server page fetched, plus create-on-list (the settings/templates
 * precedent for creation living on the list page). Mirrors
 * components/updates/UpdatesList.tsx for the filter/search/card shape;
 * invoices have a number and a total, so the card leads with both.
 *
 * The create form's client_name input is backed by a <datalist> of
 * client names seen on this workspace's briefs — a suggestion, never a
 * constraint (D1: standalone invoice, free-text client, no clients
 * table yet).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Plus, Search, X, Receipt } from "lucide-react";

import { createInvoice } from "@/app/(app)/invoices/actions";
import { InvoiceStatusBadge } from "@/components/invoices/InvoiceStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatMoney, invoiceNumberLabel, timeAgo } from "@/lib/utils";
import type { InvoiceStatus, InvoiceSummary } from "@/lib/types/invoice";

type StatusFilter = "all" | InvoiceStatus;

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

function EmptyState({
  hasInvoices,
  onClearFilters,
  onNewInvoice,
}: {
  hasInvoices: boolean;
  onClearFilters: () => void;
  onNewInvoice: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16 text-center">
      <span className="icon-chip icon-chip-accent" aria-hidden="true">
        <Receipt className="h-5 w-5" />
      </span>
      {hasInvoices ? (
        <>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              No matching invoices
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search or status filter.
            </p>
          </div>
          <Button variant="secondary" onClick={onClearFilters}>
            Clear filters
          </Button>
        </>
      ) : (
        <>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              No invoices yet
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create your first invoice — it will be numbered INV-0001
              for this workspace, and you can add line items right after.
            </p>
          </div>
          <Button onClick={onNewInvoice}>
            <Plus className="mr-2 h-4 w-4"  aria-hidden="true" />
            New invoice
          </Button>
        </>
      )}
    </div>
  );
}

function InvoiceCard({ invoice }: { invoice: InvoiceSummary }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/invoices/${invoice.id}`}
              className="inline-flex min-h-11 min-w-11 items-center font-display text-base font-semibold leading-snug underline-offset-2 hover:underline"
            >
              {invoice.title}
            </Link>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {invoice.client_name}
            </p>
          </div>
          <InvoiceStatusBadge status={invoice.status} className="shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 p-5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-mono text-xs text-muted-foreground">
            {invoiceNumberLabel(invoice.invoice_number)}
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            {formatMoney(invoice.total_cents)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Due {formatDate(invoice.due_date)} · Updated{" "}
          {timeAgo(invoice.updated_at)}
        </p>
      </CardContent>
    </Card>
  );
}

export function InvoicesList({
  invoices,
  clientSuggestions,
}: {
  invoices: InvoiceSummary[];
  clientSuggestions: string[];
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [creatingPending, setCreatingPending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: invoices.length,
      draft: 0,
      sent: 0,
      paid: 0,
      void: 0,
    };
    for (const invoice of invoices) counts[invoice.status] += 1;
    return counts;
  }, [invoices]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (statusFilter !== "all" && invoice.status !== statusFilter)
        return false;
      if (!q) return true;
      return (
        invoice.title.toLowerCase().includes(q) ||
        invoice.client_name.toLowerCase().includes(q) ||
        invoiceNumberLabel(invoice.invoice_number).toLowerCase().includes(q)
      );
    });
  }, [invoices, statusFilter, query]);

  async function handleCreate() {
    setCreatingPending(true);
    setCreateError(null);
    const result = await createInvoice({
      client_name: newClient,
      title: newTitle,
      due_date: newDue || null,
    });
    setCreatingPending(false);
    if (result?.error) {
      setCreateError(result.error);
      return;
    }
    // Creation succeeded → compose the new invoice (add line items).
    if (result?.id) router.push(`/invoices/${result.id}`);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <TabsList>
            {FILTER_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {statusCounts[tab.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"  aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, client, or #…"
              className="pl-8"
              aria-label="Search invoices"
            />
          </div>
          {!creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4"  aria-hidden="true" />
              New invoice
            </Button>
          )}
        </div>
      </div>

      {creating && (
        <Card className="mb-5">
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <h2 className="font-display text-base font-semibold tracking-tight">
              New invoice
            </h2>
            <p className="text-xs text-muted-foreground">
              Starts as a draft — add line items after saving. The client
              name is free text; suggestions come from this workspace’s
              briefs.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="new-invoice-client"
                  className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Client
                </label>
                <Input
                  id="new-invoice-client"
                  list="invoice-client-suggestions"
                  value={newClient}
                  onChange={(e) => setNewClient(e.target.value)}
                  placeholder="e.g. Brightloop Co."
                />
                <datalist id="invoice-client-suggestions">
                  {clientSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="new-invoice-title"
                  className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Title
                </label>
                <Input
                  id="new-invoice-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Brand refresh — phase one"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="new-invoice-due"
                className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Due date (optional)
              </label>
              <Input
                id="new-invoice-due"
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="w-48"
              />
            </div>
            {createError && (
              <p className="text-xs text-error">{createError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleCreate}
                disabled={creatingPending}
              >
                {creatingPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin"  aria-hidden="true" />
                ) : (
                  <Plus className="mr-2 h-4 w-4"  aria-hidden="true" />
                )}
                Create draft
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewClient("");
                  setNewTitle("");
                  setNewDue("");
                  setCreateError(null);
                }}
              >
                <X className="mr-2 h-4 w-4"  aria-hidden="true" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {visible.length === 0 ? (
        <EmptyState
          hasInvoices={invoices.length > 0}
          onClearFilters={() => {
            setStatusFilter("all");
            setQuery("");
          }}
          onNewInvoice={() => setCreating(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((invoice) => (
            <InvoiceCard key={invoice.id} invoice={invoice} />
          ))}
        </div>
      )}
    </div>
  );
}
