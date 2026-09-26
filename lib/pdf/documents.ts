/**
 * The three client-facing documents, as PDFs (PDF export, 2026-09-27):
 * invoice, contract, proposal.
 *
 * Each builder is PURE — plain data in (the same fields the screen renders),
 * bytes + a filename out. No Supabase, no session, no `new Date()`: the
 * route layer reads the row and passes `generatedAt`, which is what lets
 * tests/lib/pdf-documents.test.ts assert the exact document text.
 *
 * Content parity is deliberate: whatever the member page and the public
 * share page show, the PDF shows — including the money math, which is
 * computed with the SAME lib/invoice-totals.ts the app uses, so a
 * downloaded invoice can never disagree with the one on screen.
 */

import { invoiceTotals } from "../invoice-totals.ts";
import { createLayout, pdfDateLabel, COLORS } from "./layout.ts";
import type { PageSizeName } from "./writer.ts";

export interface PdfResult {
  bytes: Uint8Array;
  filename: string;
}

interface BaseInput {
  workspaceName: string;
  generatedAt: Date;
  pageSize?: PageSizeName;
}

export interface InvoicePdfItem {
  description: string;
  quantity: number;
  unit_amount_cents: number;
}

export interface InvoicePdfInput extends BaseInput {
  invoiceNumber: number;
  title: string;
  clientName: string;
  status: "draft" | "sent" | "paid" | "void";
  items: InvoicePdfItem[];
  taxPercent: number;
  notes: string;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
}

export interface ContractPdfInput extends BaseInput {
  title: string;
  clientName: string;
  status: "draft" | "sent" | "signed" | "void";
  terms: string;
  briefTitle: string | null;
  expiresOn: string | null;
  signedBy: string;
  sentAt: string | null;
  signedAt: string | null;
}

export interface ProposalPdfInput extends BaseInput {
  title: string;
  clientName: string | null;
  status: "draft" | "sent" | "accepted" | "declined";
  deliverables: { text: string; checked: boolean }[];
  budgetTimeline: string | null;
  briefTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

const EM_DASH = "\u2014";

/** "INV-0001" — the app's invoice label (lib/utils.invoiceNumberLabel),
 *  duplicated here only to keep this module free of client-side imports. */
function invoiceLabel(invoiceNumber: number): string {
  return `INV-${String(invoiceNumber).padStart(4, "0")}`;
}

/** Locale-independent USD money (the app pins USD — lib/utils.formatMoney).
 *  Intl is avoided so a server with a different ICU build can't shift the
 *  grouping in a document a client keeps. */
function money(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const units = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${fraction}`;
}

/** Letters with no combining-mark decomposition — NFD leaves them alone, so
 *  a slug would silently drop them ("Søn" → "s-n"). */
const SLUG_FOLD: Record<string, string> = {
  "\u00f8": "o", "\u00d8": "o", // ø Ø
  "\u00e6": "ae", "\u00c6": "ae", // æ Æ
  "\u0153": "oe", "\u0152": "oe", // œ Œ
  "\u00df": "ss", // ß
  "\u0142": "l", "\u0141": "l", // ł Ł
  "\u0111": "d", "\u0110": "d", // đ Đ
  "\u00f0": "d", "\u00d0": "d", // ð Ð
  "\u00fe": "th", "\u00de": "th", // þ Þ
};

/** "Brightloop Co." → "brightloop-co" (filenames only). */
export function slugify(value: string): string {
  const folded = Array.from(value)
    .map((char) => SLUG_FOLD[char] ?? char)
    .join("");
  const slug = folded
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "document";
}

function titleCase(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function buildInvoicePdf(input: InvoicePdfInput): PdfResult {
  const label = invoiceLabel(input.invoiceNumber);
  const totals = invoiceTotals(input.items.map((item, i) => ({ id: String(i), ...item })), input.taxPercent);

  const doc = createLayout({
    pageSize: input.pageSize,
    workspaceName: input.workspaceName,
    documentKind: "Invoice",
    title: `${label} ${EM_DASH} ${input.title}`,
    subject: `Invoice for ${input.clientName}`,
    generatedAt: input.generatedAt,
  });

  doc.gap(6);
  doc.label(label);
  doc.titleBlock(input.title, input.clientName);
  doc.gap(14);

  const statusNote =
    input.status === "paid"
      ? `Paid ${pdfDateLabel(input.paidAt)}`
      : input.status === "sent"
        ? `Sent ${pdfDateLabel(input.sentAt)}`
        : input.status === "void"
          ? "This invoice has been voided"
          : "Not sent yet";
  doc.statusStrip(titleCase(input.status), statusNote);

  doc.gap(6);
  doc.metaGrid(
    [
      { label: "Billed to", value: input.clientName },
      { label: "Invoice", value: label },
      { label: "Due", value: pdfDateLabel(input.dueDate) },
      { label: "Issued", value: pdfDateLabel(input.sentAt) },
      { label: "Paid", value: pdfDateLabel(input.paidAt) },
      { label: "Amount due", value: money(totals.total_cents) },
    ],
    3
  );

  doc.gap(10);
  doc.table({
    columns: [
      { header: "Description", width: 6 },
      { header: "Qty", width: 1.2, align: "right", wrap: false },
      { header: "Unit", width: 2, align: "right", wrap: false },
      { header: "Amount", width: 2.2, align: "right", wrap: false },
    ],
    rows: input.items.map((item) => [
      item.description || EM_DASH,
      String(item.quantity),
      money(item.unit_amount_cents),
      money(item.quantity * item.unit_amount_cents),
    ]),
    emptyText: "No line items on this invoice.",
  });

  doc.gap(12);
  doc.totals([
    { label: "Subtotal", value: money(totals.subtotal_cents) },
    {
      label: `Tax (${input.taxPercent}%)`,
      value: money(totals.tax_cents),
    },
    {
      label: input.status === "paid" ? "Total paid" : "Total due",
      value: money(totals.total_cents),
      emphasis: true,
    },
  ]);

  if (input.notes.trim().length > 0) {
    doc.gap(18);
    doc.label("Notes");
    doc.paragraph(input.notes, { color: COLORS.ink });
  }

  return {
    bytes: doc.finish(),
    filename: `${label}-${slugify(input.clientName)}.pdf`,
  };
}

export function buildContractPdf(input: ContractPdfInput): PdfResult {
  const doc = createLayout({
    pageSize: input.pageSize,
    workspaceName: input.workspaceName,
    documentKind: "Contract",
    title: input.title,
    subject: `Engagement agreement with ${input.clientName}`,
    generatedAt: input.generatedAt,
  });

  doc.gap(6);
  doc.titleBlock(
    input.title,
    input.briefTitle
      ? `${input.clientName} ${EM_DASH} ${input.briefTitle}`
      : input.clientName
  );
  doc.gap(14);

  const statusNote =
    input.status === "signed"
      ? `Signed ${pdfDateLabel(input.signedAt)}`
      : input.status === "sent"
        ? `Sent ${pdfDateLabel(input.sentAt)}`
        : input.status === "void"
          ? "This agreement has been voided"
          : "Draft — not sent yet";
  doc.statusStrip(titleCase(input.status), statusNote);

  doc.gap(6);
  doc.metaGrid(
    [
      { label: "Client", value: input.clientName },
      { label: "Sent", value: pdfDateLabel(input.sentAt) },
      { label: "Signed", value: pdfDateLabel(input.signedAt) },
      { label: "Expires", value: pdfDateLabel(input.expiresOn) },
      {
        label: "Signed by",
        value: input.signedBy.trim().length > 0 ? input.signedBy : EM_DASH,
      },
      { label: "Prepared by", value: input.workspaceName },
    ],
    3
  );

  doc.rule(10, 14);
  doc.heading("Agreement terms");
  doc.gap(2);
  doc.paragraph(input.terms.trim().length > 0 ? input.terms : "No terms recorded.");

  doc.gap(24);
  doc.label("Signatures");
  doc.signatures(`${input.clientName} (client)`, input.workspaceName);

  return {
    bytes: doc.finish(),
    filename: `contract-${slugify(input.title)}.pdf`,
  };
}

export function buildProposalPdf(input: ProposalPdfInput): PdfResult {
  const client = input.clientName ?? "Client";
  const doc = createLayout({
    pageSize: input.pageSize,
    workspaceName: input.workspaceName,
    documentKind: "Proposal",
    title: input.title,
    subject: `Proposal for ${client}`,
    generatedAt: input.generatedAt,
  });

  doc.gap(6);
  doc.titleBlock(input.title, client);
  doc.gap(14);
  doc.statusStrip(
    titleCase(input.status),
    `Updated ${pdfDateLabel(input.updatedAt)}`
  );

  doc.gap(6);
  doc.metaGrid(
    [
      { label: "Client", value: client },
      { label: "Created", value: pdfDateLabel(input.createdAt) },
      { label: "Source brief", value: input.briefTitle ?? EM_DASH },
    ],
    3
  );

  doc.rule(10, 14);
  doc.heading("Deliverables");
  doc.gap(4);
  if (input.deliverables.length === 0) {
    doc.paragraph("No deliverables listed yet.", {
      color: COLORS.muted,
      italic: true,
    });
  } else {
    doc.checklist(
      input.deliverables.map((d) => ({ text: d.text, done: d.checked }))
    );
  }

  doc.gap(16);
  doc.heading("Budget & timeline");
  doc.gap(4);
  doc.paragraph(
    input.budgetTimeline && input.budgetTimeline.trim().length > 0
      ? input.budgetTimeline
      : "Not specified.",
    input.budgetTimeline ? {} : { color: COLORS.muted, italic: true }
  );

  return {
    bytes: doc.finish(),
    filename: `proposal-${slugify(input.title)}.pdf`,
  };
}
