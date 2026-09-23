"use server";

/**
 * Server actions for the /invoices list — create-on-list (the
 * settings/createTemplate precedent: creation happens where the list
 * lives, not on a detail route). After creating, the client redirects
 * to the new invoice's composer to add line items.
 *
 * TESTING (local, after the invoices migration + seed):
 *   1. /invoices shows the two seeded invoices (INV-0001 draft,
 *      INV-0002 sent). "New invoice" opens an inline form; client name
 *      gets datalist suggestions from the workspace's briefs.
 *   2. Saving creates a draft with the next per-workspace number and
 *      redirects to its composer.
 *   3. Double-clicking Create races the number: the second insert hits
 *      unique(workspace_id, invoice_number) → friendly 23505 message
 *      (share_links precedent), no corrupt sequence.
 */

import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { getNextInvoiceNumber } from "@/lib/data/invoices";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { error?: string; id?: string } | undefined;

export async function createInvoice(input: {
  client_name: string;
  title: string;
  due_date: string | null;
}): Promise<ActionResult> {
  const clientName = input.client_name?.trim() ?? "";
  const title = input.title?.trim() ?? "";
  if (!clientName) return { error: "Client name is required." };
  if (!title) return { error: "Title is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };

  // Create on the ACTIVE workspace (Step 16 resolver).
  const context = await getWorkspaceContext();
  if (!context) {
    return { error: "Your session has expired. Please log in again." };
  }

  const invoiceNumber = await getNextInvoiceNumber(context.id);

  // due_date: "YYYY-MM-DD" from the date input; "" → null (no due date).
  const dueDate = input.due_date?.trim() || null;

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      workspace_id: context.id,
      invoice_number: invoiceNumber,
      client_name: clientName,
      title,
      status: "draft",
      due_date: dueDate,
    })
    .select("id")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "That invoice number was just taken — refresh the list and try again."
          : error.message,
    };
  }

  revalidatePath("/invoices");
  return { error: undefined, id: (data as { id: string }).id };
}
