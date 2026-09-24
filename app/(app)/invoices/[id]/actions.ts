"use server";

/**
 * Server actions for /invoices/[id].
 *
 * TESTING (local, after README setup + the invoices migration + seed):
 *   1. Open the seeded INV-0002 (sent). Edit a line's price → totals
 *      update live → Save: the row's items/tax update in the Table
 *      Editor; the list card's total matches after navigating back.
 *   2. Status select: Sent → Paid stamps invoices.paid_at; Paid → Sent
 *      CLEARS paid_at; → Void keeps the stamps (audit trail).
 *   3. Link panel: create → public URL; open it in incognito → the
 *      invoice renders; revoke → same URL shows "unavailable";
 *      regenerate → fresh token works, old one stays dead.
 *
 * STATUS STAMPING (locked in the Step 17 spec): sent_at is stamped the
 * first time an invoice becomes "sent" (never overwritten); paid_at is
 * stamped when it becomes "paid" and CLEARED when it leaves "paid".
 * There is no delete anywhere — void is the cancel.
 */

import { revalidatePath } from "next/cache";

import { requireEditor } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceItem, InvoiceStatus } from "@/lib/types/invoice";

export type ActionResult = { error?: string } | undefined;

const VALID_STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "void"];

async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return supabase;
}

/** Manual save from the composer — no autosave, explicit user action.
 *  The whole items array is written as jsonb (plans.tasks precedent). */
export async function saveInvoiceContent(input: {
  invoiceId: string;
  title: string;
  client_name: string;
  items: InvoiceItem[];
  tax_percent: number;
  notes: string;
  due_date: string | null;
}): Promise<ActionResult> {
  const title = input.title?.trim() ?? "";
  const clientName = input.client_name?.trim() ?? "";
  if (!title) return { error: "Title is required." };
  if (!clientName) return { error: "Client is required." };
  if (
    !Number.isFinite(input.tax_percent) ||
    input.tax_percent < 0 ||
    input.tax_percent > 100
  ) {
    return { error: "Tax must be between 0 and 100." };
  }
  for (const item of input.items ?? []) {
    if (!item.description?.trim()) return { error: "Every line needs a description." };
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return { error: "Line quantities must be whole numbers of 1 or more." };
    }
    if (!Number.isInteger(item.unit_amount_cents) || item.unit_amount_cents < 0) {
      return { error: "Line amounts must be non-negative." };
    }
  }

  const supabase = await requireSession();
  if (!supabase)
    return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  const { error } = await supabase
    .from("invoices")
    .update({
      title,
      client_name: clientName,
      items: input.items,
      tax_percent: input.tax_percent,
      notes: input.notes ?? "",
      due_date: input.due_date,
    })
    .eq("id", input.invoiceId);

  if (error) return { error: error.message };

  revalidatePath(`/invoices/${input.invoiceId}`);
  revalidatePath("/invoices");
  return { error: undefined };
}

/** Lifecycle transition. Stamps audit timestamps as part of the write:
 *  → sent: sent_at set once (first send kept);
 *  → paid: paid_at = now;
 *  leaving paid: paid_at cleared. */
export async function setInvoiceStatus(input: {
  invoiceId: string;
  status: InvoiceStatus;
}): Promise<ActionResult> {
  if (!VALID_STATUSES.includes(input.status)) {
    return { error: "Invalid status." };
  }

  const supabase = await requireSession();
  if (!supabase)
    return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // Read the current row (RLS-scoped; foreign invoices look absent) so
  // the stamps are computed from real state, not assumptions.
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("status, sent_at, paid_at")
    .eq("id", input.invoiceId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!invoice) return { error: "Invoice not found." };

  const now = new Date().toISOString();
  const patch: {
    status: InvoiceStatus;
    sent_at?: string | null;
    paid_at?: string | null;
  } = { status: input.status };

  if (input.status === "sent" && !invoice.sent_at) {
    patch.sent_at = now; // first send only — the original date is kept
  }
  if (input.status === "paid") {
    patch.paid_at = now;
  } else if (invoice.status === "paid") {
    // (input.status is known ≠ "paid" in this branch) leaving paid
    // clears the stamp; the original sent_at is untouched.
    patch.paid_at = null;
  }

  const { error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", input.invoiceId);

  if (error) return { error: error.message };

  revalidatePath(`/invoices/${input.invoiceId}`);
  revalidatePath("/invoices");
  return { error: undefined };
}

// ── Public links (Step 17) ─────────────────────────────────────────────
// Member actions only — invoice_links is fully member-gated; the public
// read path is the get_shared_invoice RPC, untouched by these.

export async function createInvoiceLink(input: {
  invoiceId: string;
}): Promise<ActionResult> {
  const supabase = await requireSession();
  if (!supabase)
    return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // The insert needs workspace_id; read it from the invoice (RLS-scoped,
  // so foreign invoices simply look absent).
  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("workspace_id")
    .eq("id", input.invoiceId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!invoice) return { error: "Invoice not found." };

  // token defaults to gen_random_uuid() at insert. unique(invoice_id)
  // turns a double-click race into a friendly error.
  const { error } = await supabase.from("invoice_links").insert({
    workspace_id: invoice.workspace_id,
    invoice_id: input.invoiceId,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A public link already exists for this invoice."
          : error.message,
    };
  }

  revalidatePath(`/invoices/${input.invoiceId}`);
  return { error: undefined };
}

export async function revokeInvoiceLink(input: {
  linkId: string;
  invoiceId: string;
}): Promise<ActionResult> {
  const supabase = await requireSession();
  if (!supabase)
    return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  const { error } = await supabase
    .from("invoice_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.linkId);

  if (error) return { error: error.message };

  revalidatePath(`/invoices/${input.invoiceId}`);
  return { error: undefined };
}

export async function regenerateInvoiceLink(input: {
  linkId: string;
  invoiceId: string;
}): Promise<ActionResult> {
  const supabase = await requireSession();
  if (!supabase)
    return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // Same row, fresh unguessable token (uuid v4 — the JS-side equivalent
  // of gen_random_uuid(), since PostgREST updates can't invoke SQL
  // defaults), and the link becomes active again.
  const { error } = await supabase
    .from("invoice_links")
    .update({ token: crypto.randomUUID(), revoked_at: null })
    .eq("id", input.linkId);

  if (error) return { error: error.message };

  revalidatePath(`/invoices/${input.invoiceId}`);
  return { error: undefined };
}
