/**
 * Types matching supabase/migrations/20260923090000_invoices_schema.sql.
 * Standalone, per-workspace, sequentially numbered invoices. Money is
 * integer cents; totals are never stored (computed from items + tax).
 */

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

/** One line of the invoice's items jsonb (composer owns the shape). */
export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_amount_cents: number;
}

export interface Invoice {
  id: string;
  workspace_id: string;
  /** Per-workspace sequence (1 = INV-0001); unique per workspace. */
  invoice_number: number;
  client_name: string;
  title: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  /** 0–100 (numeric(5,2) in the DB; PostgREST returns it as a string,
   *  so lib/data/invoices.ts casts to number at the boundary). */
  tax_percent: number;
  notes: string;
  due_date: string | null; // date → "YYYY-MM-DD"
  /** Auto-stamped by the status transitions (see [id]/actions.ts). */
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Summary row for the /invoices list (as returned by getInvoices).
 *  total_cents is computed in TS — the DB stores no totals. */
export interface InvoiceSummary {
  id: string;
  invoice_number: number;
  title: string;
  client_name: string;
  status: InvoiceStatus;
  total_cents: number;
  due_date: string | null;
  updated_at: string;
}

/** Full invoice_links row — only ever visible to workspace members. */
export interface InvoiceLink {
  id: string;
  workspace_id: string;
  /** The shared invoice (unique in the DB — one link per invoice). */
  invoice_id: string;
  /** Public address of the share: /invoice/<token>. */
  token: string;
  /** null while the link is active. */
  revoked_at: string | null;
  created_at: string;
}

/** The public-safe payload returned by the get_shared_invoice() RPC —
 *  display fields only, no ids of any kind (workspace_name is the
 *  seller identity shown on the shared form). */
export interface SharedInvoice {
  invoice_number: number;
  title: string;
  client_name: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  tax_percent: number;
  notes: string;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  workspace_name: string;
}
