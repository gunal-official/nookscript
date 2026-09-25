"use client";

/**
 * The invoice composer (Step 17): editable title, client, line items
 * (description + quantity + unit price in integer cents under the
 * hood), tax %, due date, and notes — with an explicit Save (no
 * autosave, UpdateComposer precedent: local edits diverge from the
 * server props, an "Unsaved changes" chip appears, Save persists via
 * saveInvoiceContent, and fresh props re-sync the fields).
 *
 * Money: inputs are DOLLAR strings ("1200.50"); they are converted to
 * integer cents on save. Totals (subtotal → tax → total) render live
 * via the same pure lib/invoice-totals.ts the server uses, so what you
 * see is exactly what the client's invoice will show.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

import { saveInvoiceContent } from "@/app/(app)/invoices/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { invoiceTotals } from "@/lib/invoice-totals";
import { formatMoney } from "@/lib/utils";
import type { InvoiceItem } from "@/lib/types/invoice";

/** Editable row: money/quantity held as raw input strings. */
interface LocalItem {
  id: string;
  description: string;
  quantity: string;
  unit_amount: string;
}

function toLocalItems(items: readonly InvoiceItem[]): LocalItem[] {
  return items.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: String(item.quantity),
    unit_amount: (item.unit_amount_cents / 100).toString(),
  }));
}

function centsFromDollars(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

function qtyFromInput(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return n >= 1 ? n : null;
}

function taxFromInput(s: string): number | null {
  const cleaned = s.replace(/[%\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d{0,2}(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return n >= 0 && n <= 100 ? n : null;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export function InvoiceComposer({
  invoiceId,
  initialTitle,
  initialClient,
  initialItems,
  initialTaxPercent,
  initialNotes,
  initialDueDate,
}: {
  invoiceId: string;
  initialTitle: string;
  initialClient: string;
  initialItems: InvoiceItem[];
  initialTaxPercent: number;
  initialNotes: string;
  initialDueDate: string | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [client, setClient] = useState(initialClient);
  const [items, setItems] = useState<LocalItem[]>(() =>
    toLocalItems(initialItems)
  );
  const [tax, setTax] = useState(
    initialTaxPercent > 0 ? String(initialTaxPercent) : ""
  );
  const [notes, setNotes] = useState(initialNotes);
  const [dueDate, setDueDate] = useState(initialDueDate ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the server re-renders with fresh data after save.
  useEffect(() => {
    setTitle(initialTitle);
    setClient(initialClient);
    setItems(toLocalItems(initialItems));
    setTax(initialTaxPercent > 0 ? String(initialTaxPercent) : "");
    setNotes(initialNotes);
    setDueDate(initialDueDate ?? "");
  }, [
    initialTitle,
    initialClient,
    initialItems,
    initialTaxPercent,
    initialNotes,
    initialDueDate,
  ]);

  const dirty =
    title !== initialTitle ||
    client !== initialClient ||
    JSON.stringify(items) !== JSON.stringify(toLocalItems(initialItems)) ||
    tax !== (initialTaxPercent > 0 ? String(initialTaxPercent) : "") ||
    notes !== initialNotes ||
    dueDate !== (initialDueDate ?? "");

  /** Best-effort parse for the live totals (invalid cells count as 0 —
   *  the full validation happens on save). */
  const liveTotals = useMemo(() => {
    const parsed: InvoiceItem[] = items
      // completely blank rows don't count yet
      .filter(
        (item) =>
          item.description.trim() !== "" ||
          item.quantity.trim() !== "" ||
          item.unit_amount.trim() !== ""
      )
      .map((item) => ({
        id: item.id,
        description: item.description,
        quantity: qtyFromInput(item.quantity) ?? 0,
        unit_amount_cents: centsFromDollars(item.unit_amount) ?? 0,
      }));
    return invoiceTotals(parsed, taxFromInput(tax) ?? 0);
  }, [items, tax]);

  function updateItem(index: number, patch: Partial<LocalItem>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      { id: crypto.randomUUID(), description: "", quantity: "1", unit_amount: "" },
    ]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);

    // Validate FIRST (nothing pending yet) so a validation error never
    // leaves the spinner up.
    const parsedItems: InvoiceItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isEmpty =
        item.description.trim() === "" &&
        item.quantity.trim() === "" &&
        item.unit_amount.trim() === "";
      if (isEmpty) continue; // blank row → dropped
      if (!item.description.trim()) {
        setError(`Line ${i + 1}: description is required.`);
        return;
      }
      const quantity = qtyFromInput(item.quantity);
      if (quantity === null) {
        setError(`Line ${i + 1}: quantity must be a whole number of 1 or more.`);
        return;
      }
      const unit_amount_cents = centsFromDollars(item.unit_amount);
      if (unit_amount_cents === null) {
        setError(`Line ${i + 1}: enter a non-negative amount, e.g. 1200.50.`);
        return;
      }
      parsedItems.push({
        id: item.id,
        description: item.description.trim(),
        quantity,
        unit_amount_cents,
      });
    }
    const taxPercent = taxFromInput(tax);
    if (taxPercent === null) {
      setError("Tax must be a number between 0 and 100.");
      return;
    }

    setPending(true);
    const result = await saveInvoiceContent({
      invoiceId,
      title,
      client_name: client,
      items: parsedItems,
      tax_percent: taxPercent,
      notes,
      due_date: dueDate || null,
    });

    setPending(false);
    if (result?.error) setError(result.error);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel>Title</FieldLabel>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Invoice title"
            aria-label="Title"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Client</FieldLabel>
          <Input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="Client name"
            aria-label="Client"
          />
        </div>
      </div>

      {/* ── Line items ── */}
      <div className="space-y-2">
        <div className="hidden items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[1fr_5.5rem_7.5rem_6rem_2rem]">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            No line items yet — add the first one below.
          </p>
        )}
        {items.map((item, i) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 md:grid md:grid-cols-[1fr_5.5rem_7.5rem_6rem_2rem] md:items-center"
          >
            <Input
              value={item.description}
              onChange={(e) => updateItem(i, { description: e.target.value })}
              placeholder="What is being billed?"
              aria-label={`Line ${i + 1} description`}
            />
            <Input
              value={item.quantity}
              onChange={(e) => updateItem(i, { quantity: e.target.value })}
              inputMode="numeric"
              className="text-right"
              aria-label={`Line ${i + 1} quantity`}
            />
            <Input
              value={item.unit_amount}
              onChange={(e) => updateItem(i, { unit_amount: e.target.value })}
              inputMode="decimal"
              placeholder="0.00"
              className="text-right"
              aria-label={`Line ${i + 1} unit price`}
            />
            <span className="truncate text-right text-sm text-muted-foreground">
              {centsFromDollars(item.unit_amount) !== null &&
              qtyFromInput(item.quantity) !== null
                ? formatMoney(
                    (centsFromDollars(item.unit_amount) ?? 0) *
                      (qtyFromInput(item.quantity) ?? 0)
                  )
                : "—"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="w-8 shrink-0"
              onClick={() => removeItem(i)}
              aria-label={`Remove line ${i + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={addItem}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add line item
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <FieldLabel>Tax %</FieldLabel>
          <Input
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            aria-label="Tax %"
            className="w-24"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>Due date</FieldLabel>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Due date"
            className="w-44"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-1" />
      </div>

      <div className="space-y-1.5">
        <FieldLabel>Notes (shown to the client)</FieldLabel>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Net 14 — please pay within 14 days of the due date."
          aria-label="Notes (shown to the client)"
          rows={3}
        />
      </div>

      {/* ── Live totals (same math as the saved/public views) ── */}
      <div className="space-y-1 border-t border-border pt-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatMoney(liveTotals.subtotal_cents)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Tax ({taxFromInput(tax) ?? 0}%)</span>
          <span>{formatMoney(liveTotals.tax_cents)}</span>
        </div>
        <div className="flex justify-between font-display text-base font-bold tracking-tight">
          <span>Total</span>
          <span>{formatMoney(liveTotals.total_cents)}</span>
        </div>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        {dirty ? (
          <Badge variant="secondary">Unsaved changes</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            All changes saved
          </span>
        )}
        <Button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
        >
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
