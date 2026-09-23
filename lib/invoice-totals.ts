/**
 * Pure, isomorphic money math for invoices (Step 17).
 *
 * The DB stores ONLY line items (integer cents) + tax_percent — totals
 * are computed here everywhere they are shown, so nothing stored can
 * ever drift from the line items. Used by the list (server), the
 * composer (client), and the public invoice view (server).
 */

import type { InvoiceItem } from "@/lib/types/invoice";

export interface InvoiceTotals {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

/** subtotal → tax (rounded to the cent) → total. Defensive: non-positive
 *  or non-finite line values count as 0 (the composer validates before
 *  saving; the public view must never crash on odd stored shapes). */
export function invoiceTotals(
  items: readonly InvoiceItem[] | null | undefined,
  taxPercent: number
): InvoiceTotals {
  const subtotal_cents = (items ?? []).reduce((sum, item) => {
    const quantity = Number.isFinite(item.quantity) ? Math.max(0, Math.trunc(item.quantity)) : 0;
    const unit = Number.isFinite(item.unit_amount_cents)
      ? Math.max(0, Math.trunc(item.unit_amount_cents))
      : 0;
    return sum + quantity * unit;
  }, 0);
  const pct = Number.isFinite(taxPercent) ? Math.min(100, Math.max(0, taxPercent)) : 0;
  const tax_cents = Math.round((subtotal_cents * pct) / 100);
  return { subtotal_cents, tax_cents, total_cents: subtotal_cents + tax_cents };
}
