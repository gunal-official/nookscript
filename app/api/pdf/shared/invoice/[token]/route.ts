/**
 * GET /api/pdf/shared/invoice/<token> — the CLIENT-side PDF download
 * (PDF export, 2026-09-27): the same invoice document the recipient sees at
 * /invoice/<token>, as a file they can file, forward or pay against.
 *
 * NO AUTH, by design — the token IS the credential, exactly as on the page:
 *   - data comes ONLY from the get_shared_invoice SECURITY DEFINER RPC
 *     (lib/data/invoices.getSharedInvoiceByToken), which returns zero rows,
 *     indistinguishably, for an invalid token, a revoked link, and a
 *     draft/void invoice;
 *   - the shape check runs first, so a non-UUID never reaches Postgres;
 *   - the RPC payload carries display fields only (no ids), so this route
 *     cannot leak more than the page already shows;
 *   - the path prefix is in RATE_LIMITED_PREFIXES (lib/rate-limit.ts), so
 *     the proxy caps it per IP like every other public token surface.
 *
 * HOW TO TEST (locally, seed applied, INCOGNITO window):
 *   1. /invoice/00000000-0000-0000-0000-000000000070 → "Download PDF"
 *      saves the invoice; its totals match the page exactly.
 *   2. Revoke the link in the app → the same URL now answers 404.
 *   3. The draft invoice's seeded link (…0069) answers 404 too — drafts are
 *      never shared, and the visitor can't tell the two cases apart.
 */

import { getSharedInvoiceByToken } from "@/lib/data/invoices";
import { buildInvoicePdf } from "@/lib/pdf/documents";
import { pdfResponse, requestedPageSize } from "@/lib/pdf/response";
import { isUuid } from "@/lib/utils";

export const dynamic = "force-dynamic";

function unavailable() {
  return new Response("This link is invalid or has been revoked.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!isUuid(token)) return unavailable();

  let invoice = null;
  try {
    invoice = await getSharedInvoiceByToken(token);
  } catch {
    // An RPC/DB failure answers exactly like a bad token — no internals
    // leak to an unauthenticated caller (the /invoice/<token> page does
    // the same thing).
    return unavailable();
  }
  if (!invoice) return unavailable();

  const result = buildInvoicePdf({
    workspaceName: invoice.workspace_name,
    generatedAt: new Date(),
    pageSize: requestedPageSize(request),
    invoiceNumber: invoice.invoice_number,
    title: invoice.title,
    clientName: invoice.client_name,
    status: invoice.status,
    items: invoice.items ?? [],
    taxPercent: invoice.tax_percent,
    notes: invoice.notes ?? "",
    dueDate: invoice.due_date,
    sentAt: invoice.sent_at,
    paidAt: invoice.paid_at,
  });

  return pdfResponse(result);
}
