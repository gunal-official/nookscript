/**
 * GET /api/pdf/<kind>/<id> — download a workspace document as a PDF
 * (PDF export, 2026-09-27). Kinds: invoice · contract · proposal.
 *
 * AUTH: session cookie only. Every read goes through the ordinary
 * RLS-scoped data layer (lib/data/*), so a member of another workspace
 * gets exactly what they get in the UI — nothing — and the route answers
 * 404 rather than 403 (same "indistinguishable" posture as the pages).
 * Invoices additionally require `canSeeMoney`: viewers never see money in
 * the app (docs/roles-spec.md) and must not be able to export it either.
 *
 * The bytes are built by the pure builders in lib/pdf/documents.ts — this
 * file only resolves rows → input objects → an attachment response.
 *
 * HOW TO TEST (locally, signed in, seed applied):
 *   1. /invoices/<id> → "PDF" downloads INV-0002-<client>.pdf; open it:
 *      letterhead, line items, subtotal → tax → total identical to screen.
 *   2. /contracts/<id> and /proposals/<id> → same button, same parity.
 *   3. Append ?size=letter for US Letter instead of the A4 default.
 *   4. Signed out (or a foreign / bogus id) → 404 "Not found". Deliberately
 *      NOT a /login redirect: this is a file endpoint, not a page, and one
 *      answer for "no session", "not yours" and "doesn't exist" leaks the
 *      least (same posture as the public token surfaces).
 */

import { getContractById } from "@/lib/data/contracts";
import { getBriefById } from "@/lib/data/briefs";
import { getInvoiceById } from "@/lib/data/invoices";
import { getProposalById } from "@/lib/data/proposals";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import {
  buildContractPdf,
  buildInvoicePdf,
  buildProposalPdf,
  type PdfResult,
} from "@/lib/pdf/documents";
import { pdfResponse, requestedPageSize } from "@/lib/pdf/response";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isUuid } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KINDS = ["invoice", "contract", "proposal"] as const;
type Kind = (typeof KINDS)[number];

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;
  if (!KINDS.includes(kind as Kind) || !isUuid(id)) return notFound();
  // Fail closed, never 500, when the app has no Supabase configured — the
  // same posture the proxy takes for protected pages.
  if (!isSupabaseConfigured()) return notFound();

  const context = await getWorkspaceContext();
  if (!context) return notFound();

  const pageSize = requestedPageSize(request);
  const generatedAt = new Date();
  let result: PdfResult;

  if (kind === "invoice") {
    // Viewers don't see money anywhere in the product — including here.
    if (!context.canSeeMoney) return notFound();
    const invoice = await getInvoiceById(id);
    if (!invoice) return notFound();
    result = buildInvoicePdf({
      workspaceName: context.name,
      generatedAt,
      pageSize,
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
  } else if (kind === "contract") {
    const contract = await getContractById(id);
    if (!contract) return notFound();
    const brief = contract.brief_id ? await getBriefById(contract.brief_id) : null;
    result = buildContractPdf({
      workspaceName: context.name,
      generatedAt,
      pageSize,
      title: contract.title,
      clientName: contract.client_name,
      status: contract.status,
      terms: contract.terms ?? "",
      briefTitle: brief?.title ?? null,
      expiresOn: contract.expires_on,
      signedBy: contract.signed_by ?? "",
      sentAt: contract.sent_at,
      signedAt: contract.signed_at,
    });
  } else {
    const proposal = await getProposalById(id);
    if (!proposal) return notFound();
    result = buildProposalPdf({
      workspaceName: context.name,
      generatedAt,
      pageSize,
      title: proposal.title,
      clientName: proposal.client_name,
      status: proposal.status,
      deliverables: (proposal.deliverables ?? []).map((d) => ({
        text: d.text,
        checked: d.checked,
      })),
      budgetTimeline: proposal.budget_timeline,
      briefTitle: proposal.brief?.title ?? null,
      createdAt: proposal.created_at,
      updatedAt: proposal.updated_at,
    });
  }

  return pdfResponse(result);
}
