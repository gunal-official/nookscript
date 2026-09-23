import "server-only";

import { createClient } from "@/lib/supabase/server";
import { invoiceTotals } from "@/lib/invoice-totals";
import type {
  Invoice,
  InvoiceLink,
  InvoiceSummary,
  InvoiceItem,
  InvoiceStatus,
  SharedInvoice,
} from "@/lib/types/invoice";

/**
 * Server-side data access for invoices (Step 17). Same conventions as
 * lib/data/updates.ts: cookie-authenticated server client. List reads
 * pin the caller's ACTIVE workspace explicitly (Step 16 — RLS is the
 * security gate; the filter keeps multi-workspace users' lists
 * unmerged). Call only with an active session, except the public
 * token-gated reader (which works with no session, via the definer
 * RPC — the app never queries invoice_links directly for that).
 *
 * PostgREST note: tax_percent is numeric(5,2) in the DB and comes back
 * as a STRING; it is cast to number at this boundary so the rest of the
 * app deals in real numbers.
 */

interface InvoiceRow {
  id: string;
  workspace_id: string;
  invoice_number: number;
  client_name: string;
  title: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  tax_percent: number | string;
  notes: string;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Summary rows for the /invoices list, most recently created first
 *  (the (workspace_id, created_at desc) index backs this). */
export async function getInvoices(workspaceId: string): Promise<InvoiceSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, title, client_name, status, items, tax_percent, due_date, updated_at"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    invoice_number: number;
    title: string;
    client_name: string;
    status: InvoiceStatus;
    items: InvoiceItem[];
    tax_percent: number | string;
    due_date: string | null;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    title: row.title,
    client_name: row.client_name,
    status: row.status,
    total_cents: invoiceTotals(row.items, Number(row.tax_percent)).total_cents,
    due_date: row.due_date,
    updated_at: row.updated_at,
  }));
}

/** A single full invoice. Returns null when not found (or not visible
 *  via RLS — foreign-workspace invoices look absent by design). */
export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) throw error;
  const row = (data ?? null) as InvoiceRow | null;
  if (!row) return null;
  return { ...row, tax_percent: Number(row.tax_percent) };
}

/** Next per-workspace invoice number (max + 1, so 1 on the first
 *  invoice). The unique(workspace_id, invoice_number) constraint turns
 *  a double-click race into a friendly 23505 in the server action. */
export async function getNextInvoiceNumber(
  workspaceId: string
): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("workspace_id", workspaceId)
    .order("invoice_number", { ascending: false })
    .limit(1);

  if (error) throw error;
  const top = (data ?? []) as Array<{ invoice_number: number }>;
  return (top[0]?.invoice_number ?? 0) + 1;
}

/** The member-facing view of an invoice's public link, if one exists
 *  (one link per invoice — maybeSingle by design). */
export async function getInvoiceLinkForInvoice(
  invoiceId: string
): Promise<InvoiceLink | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoice_links")
    .select("*")
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as InvoiceLink | null;
}

/** Public, token-gated fetch of a shared invoice. Works with no session
 *  (the client runs as anon). Access goes through the get_shared_invoice
 *  SECURITY DEFINER RPC, which returns zero rows — indistinguishably —
 *  for invalid OR revoked tokens AND for draft/void invoices. */
export async function getSharedInvoiceByToken(
  token: string
): Promise<SharedInvoice | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_shared_invoice", {
    p_token: token,
  });

  if (error) throw error;

  const rows = (data ?? []) as Array<SharedInvoice & { tax_percent: number | string }>;
  const row = rows[0];
  if (!row) return null;
  return { ...row, tax_percent: Number(row.tax_percent) };
}
