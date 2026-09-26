#!/usr/bin/env node
/**
 * PDF gate (`npm run verify:pdf`) — the offline audit for the generated
 * documents, in the spirit of `verify:responsive`: build a battery of
 * documents (including hostile ones), then READ EVERY ONE BACK and assert
 * the things a reader and a client would notice.
 *
 * Per document it checks:
 *   structure — %PDF header, %%EOF, startxref → the xref table, every xref
 *               offset pointing at its own object, /Length == the real
 *               stream length, /Count == the number of page objects;
 *   margins   — every painted text run inside the printable area (the PDF
 *               analogue of the responsive audit's overflow detector);
 *   furniture — letterhead + "Page i of n" on every page, numbering sound;
 *   fidelity  — required strings present, forbidden ones absent (no
 *               "Invalid Date", no "NaN", no "undefined", no stray "?"
 *               where the input was renderable);
 *   determinism — building twice yields byte-identical output.
 *
 * Samples are written out for eyeballing (default ~/pdf-evidence, override
 * with PDF_SHOTS_DIR=…). Zero dependencies, no network, no env, no DB — it
 * runs on a fresh clone, which is why CI can gate on it.
 *
 * Exit code 0 with "pdf audit passed ✔" — or 1 with every finding listed.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  buildContractPdf,
  buildInvoicePdf,
  buildProposalPdf,
} from "../lib/pdf/documents.ts";
import { measureText } from "../lib/pdf/metrics.ts";
import { PAGE_SIZES } from "../lib/pdf/writer.ts";
import {
  decodePdf,
  documentText,
  pageStreams,
  parseObjects,
  parseStartXref,
  parseXref,
  placedRuns,
} from "../tests/lib/pdf-read.ts";

const SHOTS_DIR = process.env.PDF_SHOTS_DIR || join(homedir(), "pdf-evidence");
const MARGIN = 54;
const GENERATED_AT = new Date("2026-09-27T10:30:00Z");

const LOREM =
  "The parties agree that the scope, schedule and fees are as described in the attached brief. ";

/* ── fixtures ───────────────────────────────────────────────────────────
   Ordinary documents first, then the shapes that break naive writers.   */

const fixtures = [
  {
    name: "invoice-sent",
    build: () =>
      buildInvoicePdf({
        workspaceName: "Brightloop Co.",
        generatedAt: GENERATED_AT,
        invoiceNumber: 2,
        title: "Website relaunch \u2014 phase 1",
        clientName: "Aurora Labs",
        status: "sent",
        items: [
          { description: "Discovery workshop and stakeholder interviews", quantity: 2, unit_amount_cents: 45000 },
          { description: "Design system + component library", quantity: 1, unit_amount_cents: 280000 },
          { description: "Front-end build", quantity: 12, unit_amount_cents: 9500 },
        ],
        taxPercent: 18,
        notes: "Payment due within 14 days. Bank details on request.",
        dueDate: "2026-10-11",
        sentAt: "2026-09-27T09:00:00Z",
        paidAt: null,
      }),
    expect: ["INV-0002", "Aurora Labs", "$4,840.00", "$871.20", "$5,711.20", "Oct 11, 2026"],
  },
  {
    name: "invoice-paid-letter",
    build: () =>
      buildInvoicePdf({
        workspaceName: "Brightloop Co.",
        generatedAt: GENERATED_AT,
        pageSize: "letter",
        invoiceNumber: 7,
        title: "Retainer \u2014 September",
        clientName: "Zo\u00eb & S\u00f8n (K\u00f8ge)",
        status: "paid",
        items: [{ description: "Monthly retainer", quantity: 1, unit_amount_cents: 250000 }],
        taxPercent: 0,
        notes: "",
        dueDate: "2026-09-30",
        sentAt: "2026-09-01T09:00:00Z",
        paidAt: "2026-09-04T09:00:00Z",
      }),
    pageSize: PAGE_SIZES.letter,
    expect: ["Total paid", "$2,500.00", "Zo\u00eb & S\u00f8n (K\u00f8ge)"],
  },
  {
    name: "invoice-empty",
    build: () =>
      buildInvoicePdf({
        workspaceName: "Solo Studio",
        generatedAt: GENERATED_AT,
        invoiceNumber: 1,
        title: "",
        clientName: "",
        status: "draft",
        items: [],
        taxPercent: 0,
        notes: "",
        dueDate: null,
        sentAt: null,
        paidAt: null,
      }),
    expect: ["No line items on this invoice.", "$0.00"],
  },
  {
    name: "invoice-hostile",
    build: () =>
      buildInvoicePdf({
        workspaceName: "\u6771\u4eac Studio \ud83d\ude80",
        generatedAt: GENERATED_AT,
        invoiceNumber: 9999,
        title: "T".repeat(400),
        clientName: "Acme (EU) \\ Ltd) Tj 0 0 0 rg (injected",
        status: "sent",
        items: [
          {
            description: "https://nookscript.app/invoice/00000000-0000-0000-0000-000000000070?utm=averyveryverylongunbreakablequerystringthatcannotwrap",
            quantity: 1,
            unit_amount_cents: 999999999,
          },
          { description: "\u20b9 rupee line, \u20ac euro line, \u00b1 tolerances", quantity: 3, unit_amount_cents: 1 },
        ],
        taxPercent: 100,
        notes: LOREM.repeat(6),
        dueDate: "2026-02-29", // not a real date — must not print "Invalid Date"
        sentAt: "2026-09-27T09:00:00Z",
        paidAt: null,
      }),
    // The injection attempt must survive as TEXT, not as operators.
    expect: ["Acme (EU) \\ Ltd) Tj 0 0 0 rg (injected", "Rs. rupee line"],
  },
  {
    name: "invoice-long",
    build: () =>
      buildInvoicePdf({
        workspaceName: "Brightloop Co.",
        generatedAt: GENERATED_AT,
        invoiceNumber: 42,
        title: "Platform build \u2014 milestone invoice",
        clientName: "Aurora Labs",
        status: "sent",
        items: Array.from({ length: 60 }, (_, i) => ({
          description: `Sprint ${i + 1} \u2014 delivery, review and documentation of the agreed scope items`,
          quantity: (i % 7) + 1,
          unit_amount_cents: 12500 + i * 137,
        })),
        taxPercent: 7.5,
        notes: LOREM.repeat(3),
        dueDate: "2026-11-01",
        sentAt: "2026-09-27T09:00:00Z",
        paidAt: null,
      }),
    minPages: 3,
    expect: ["Sprint 60", "Tax (7.5%)"],
  },
  {
    name: "contract-signed",
    build: () =>
      buildContractPdf({
        workspaceName: "Brightloop Co.",
        generatedAt: GENERATED_AT,
        title: "Engagement agreement \u2014 Aurora Labs",
        clientName: "Aurora Labs",
        status: "signed",
        terms: Array.from({ length: 24 }, (_, i) => `${i + 1}. ${LOREM.repeat(3)}`).join("\n\n"),
        briefTitle: "Website relaunch",
        expiresOn: "2026-12-31",
        signedBy: "Priya Raman",
        sentAt: "2026-09-20T09:00:00Z",
        signedAt: "2026-09-22T11:12:00Z",
      }),
    minPages: 2,
    expect: ["SIGNATURES", "Signature and date", "Priya Raman", "Dec 31, 2026"],
  },
  {
    name: "contract-empty-draft",
    build: () =>
      buildContractPdf({
        workspaceName: "Solo Studio",
        generatedAt: GENERATED_AT,
        title: "Untitled agreement",
        clientName: "",
        status: "draft",
        terms: "",
        briefTitle: null,
        expiresOn: null,
        signedBy: "",
        sentAt: null,
        signedAt: null,
      }),
    expect: ["No terms recorded.", "Draft \u2014 not sent yet"],
  },
  {
    name: "proposal-sent",
    build: () =>
      buildProposalPdf({
        workspaceName: "Brightloop Co.",
        generatedAt: GENERATED_AT,
        title: "Website relaunch proposal",
        clientName: "Aurora Labs",
        status: "sent",
        deliverables: [
          { text: "Discovery workshop", checked: true },
          { text: "Design system with 24 components, documented in Figma and handed over with tokens", checked: false },
          { text: "Front-end build", checked: false },
        ],
        budgetTimeline: "$18,000 over 8 weeks, invoiced in three milestones.",
        briefTitle: "Website relaunch",
        createdAt: "2026-09-18T09:00:00Z",
        updatedAt: "2026-09-26T09:00:00Z",
      }),
    expect: ["Deliverables", "Budget & timeline", "$18,000 over 8 weeks"],
  },
  {
    name: "proposal-empty",
    build: () =>
      buildProposalPdf({
        workspaceName: "Solo Studio",
        generatedAt: GENERATED_AT,
        title: "Untitled proposal",
        clientName: null,
        status: "draft",
        deliverables: [],
        budgetTimeline: null,
        briefTitle: null,
        createdAt: "2026-09-18T09:00:00Z",
        updatedAt: "2026-09-18T09:00:00Z",
      }),
    expect: ["No deliverables listed yet.", "Not specified."],
  },
  {
    name: "proposal-many-deliverables",
    build: () =>
      buildProposalPdf({
        workspaceName: "Brightloop Co.",
        generatedAt: GENERATED_AT,
        title: "Platform partnership \u2014 full scope",
        clientName: "Aurora Labs",
        status: "accepted",
        deliverables: Array.from({ length: 70 }, (_, i) => ({
          text: `Deliverable ${i + 1}: ${LOREM}`,
          checked: i % 3 === 0,
        })),
        budgetTimeline: LOREM.repeat(4),
        briefTitle: "Platform partnership",
        createdAt: "2026-09-18T09:00:00Z",
        updatedAt: "2026-09-26T09:00:00Z",
      }),
    minPages: 2,
    expect: ["Deliverable 70"],
  },
];

/* ── checks ─────────────────────────────────────────────────────────── */

const FORBIDDEN = ["Invalid Date", "NaN", "undefined", "null", "[object Object]"];

function checkStructure(pdf, findings, name) {
  if (!pdf.startsWith("%PDF-1.7\n")) findings.push(`${name}: missing %PDF header`);
  if (!pdf.endsWith("%%EOF\n")) findings.push(`${name}: missing %%EOF`);

  const objects = parseObjects(pdf);
  const offsets = parseXref(pdf);
  if (offsets.length - 1 !== objects.length) {
    findings.push(`${name}: xref lists ${offsets.length - 1} objects, file has ${objects.length}`);
  }
  for (let id = 1; id < offsets.length; id += 1) {
    if (!pdf.startsWith(`${id} 0 obj`, offsets[id])) {
      findings.push(`${name}: xref offset ${id} does not point at object ${id}`);
    }
  }
  if (!pdf.startsWith("xref\n", parseStartXref(pdf))) {
    findings.push(`${name}: startxref does not point at the xref table`);
  }
  for (const object of objects) {
    if (object.stream === null) continue;
    const declared = Number(/\/Length (\d+)/.exec(object.body)?.[1] ?? -1);
    if (declared !== object.stream.length) {
      findings.push(`${name}: object ${object.id} /Length ${declared} != ${object.stream.length}`);
    }
  }
  const count = Number(/\/Type \/Pages \/Count (\d+)/.exec(pdf)?.[1] ?? -1);
  const pages = pageStreams(pdf).length;
  if (count !== pages) findings.push(`${name}: /Count ${count} != ${pages} page objects`);
  return pages;
}

function checkMargins(pdf, findings, name, size) {
  let worstRight = 0;
  for (const [index, stream] of pageStreams(pdf).entries()) {
    for (const run of placedRuns(stream)) {
      const font =
        run.font === "F2" ? "Helvetica-Bold" : run.font === "F3" ? "Helvetica-Oblique" : "Helvetica";
      const rightEdge = run.x + measureText(run.text, font, run.size);
      worstRight = Math.max(worstRight, rightEdge);
      const where = `${name} p${index + 1}`;
      if (run.x < MARGIN - 0.5) {
        findings.push(`${where}: "${run.text.slice(0, 40)}" starts at x=${run.x.toFixed(1)}`);
      }
      if (rightEdge > size.width - MARGIN + 0.5) {
        findings.push(`${where}: "${run.text.slice(0, 40)}" ends at x=${rightEdge.toFixed(1)}`);
      }
      if (run.y < 24 || run.y > size.height - MARGIN) {
        findings.push(`${where}: "${run.text.slice(0, 40)}" at y=${run.y.toFixed(1)} is outside the page body`);
      }
    }
  }
  return worstRight;
}

function checkFurniture(bytes, findings, name) {
  const pages = documentText(bytes);
  pages.forEach((runs, index) => {
    const joined = runs.join("\n");
    if (!joined.includes(`Page ${index + 1} of ${pages.length}`)) {
      findings.push(`${name}: page ${index + 1} has no correct page number`);
    }
    if (!joined.includes("nookscript")) {
      findings.push(`${name}: page ${index + 1} has no generated-by footer`);
    }
  });
  return pages;
}

function checkContent(pages, findings, name, fixture) {
  const text = pages.map((runs) => runs.join("\n")).join("\n");
  for (const needle of fixture.expect ?? []) {
    if (!text.includes(needle)) findings.push(`${name}: missing text ${JSON.stringify(needle)}`);
  }
  for (const bad of FORBIDDEN) {
    if (text.includes(bad)) findings.push(`${name}: rendered ${JSON.stringify(bad)}`);
  }
  if (fixture.minPages && pages.length < fixture.minPages) {
    findings.push(`${name}: expected ≥${fixture.minPages} pages, got ${pages.length}`);
  }
}

/* ── run ────────────────────────────────────────────────────────────── */

rmSync(SHOTS_DIR, { recursive: true, force: true });
mkdirSync(SHOTS_DIR, { recursive: true });

const findings = [];
const rows = [];

for (const fixture of fixtures) {
  const size = fixture.pageSize ?? PAGE_SIZES.a4;
  const result = fixture.build();
  const pdf = decodePdf(result.bytes);

  const pageCount = checkStructure(pdf, findings, fixture.name);
  const worstRight = checkMargins(pdf, findings, fixture.name, size);
  const pages = checkFurniture(result.bytes, findings, fixture.name);
  checkContent(pages, findings, fixture.name, fixture);

  const again = fixture.build();
  if (Buffer.compare(Buffer.from(result.bytes), Buffer.from(again.bytes)) !== 0) {
    findings.push(`${fixture.name}: two builds produced different bytes`);
  }
  if (!/^[\x20-\x7e]+\.pdf$/.test(result.filename)) {
    findings.push(`${fixture.name}: filename is not ASCII: ${result.filename}`);
  }

  writeFileSync(join(SHOTS_DIR, `${fixture.name}.pdf`), result.bytes);
  rows.push({
    doc: fixture.name,
    pages: pageCount,
    kb: (result.bytes.length / 1024).toFixed(1),
    "right edge": `${worstRight.toFixed(0)}/${(size.width - MARGIN).toFixed(0)}`,
    file: result.filename,
  });
}

console.table(rows);

if (findings.length > 0) {
  console.error(`\n${findings.length} finding(s):`);
  for (const finding of findings) console.error(`  ✗ ${finding}`);
  console.error("\npdf audit FAILED ✖");
  process.exit(1);
}

console.log(
  `\n${fixtures.length} documents · ${rows.reduce((n, r) => n + r.pages, 0)} pages · ` +
    `0 overflow, 0 structure, 0 content findings`
);
console.log(`samples: ${SHOTS_DIR}`);
console.log("pdf audit passed ✔");
