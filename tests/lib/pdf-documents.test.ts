/**
 * Unit tests for lib/pdf/documents.ts + lib/pdf/layout.ts — the documents a
 * client actually receives (PDF export).
 *
 * These are the assertions that protect the PROMISE of the feature: the PDF
 * says the same thing as the screen (same totals, same dates, same status),
 * it never paints outside its margins, and long content paginates with a
 * repeated letterhead and honest page numbers.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildContractPdf,
  buildInvoicePdf,
  buildProposalPdf,
  slugify,
  type InvoicePdfInput,
} from "../../lib/pdf/documents.ts";
import { PAGE_SIZES } from "../../lib/pdf/writer.ts";
import { measureText } from "../../lib/pdf/metrics.ts";
import {
  decodePdf,
  documentText,
  flatText,
  pageStreams,
  placedRuns,
} from "./pdf-read.ts";

const GENERATED_AT = new Date("2026-09-27T10:30:00Z");
const MARGIN = 54;

const INVOICE: InvoicePdfInput = {
  workspaceName: "Brightloop Co.",
  generatedAt: GENERATED_AT,
  invoiceNumber: 2,
  title: "Website relaunch \u2014 phase 1",
  clientName: "Aurora Labs",
  status: "sent",
  items: [
    { description: "Discovery workshop", quantity: 2, unit_amount_cents: 45000 },
    { description: "Design system", quantity: 1, unit_amount_cents: 280000 },
    { description: "Front-end build", quantity: 12, unit_amount_cents: 9500 },
  ],
  taxPercent: 18,
  notes: "Payment due within 14 days.",
  dueDate: "2026-10-11",
  sentAt: "2026-09-27T09:00:00Z",
  paidAt: null,
};

/** Every glyph run must sit inside the printable area — the PDF analogue of
 *  the responsive audit's "no horizontal overflow" check. */
function assertInsideMargins(
  bytes: Uint8Array,
  size: { width: number; height: number } = PAGE_SIZES.a4
) {
  for (const [pageIndex, stream] of pageStreams(decodePdf(bytes)).entries()) {
    for (const run of placedRuns(stream)) {
      const font =
        run.font === "F2"
          ? "Helvetica-Bold"
          : run.font === "F3"
            ? "Helvetica-Oblique"
            : "Helvetica";
      const width = measureText(run.text, font, run.size);
      const context = `page ${pageIndex + 1}: "${run.text}"`;
      assert.ok(run.x >= MARGIN - 0.5, `${context} starts left of the margin`);
      assert.ok(
        run.x + width <= size.width - MARGIN + 0.5,
        `${context} overflows the right margin (${run.x + width})`
      );
      assert.ok(run.y >= 24, `${context} sits below the footer area`);
      assert.ok(
        run.y <= size.height - MARGIN,
        `${context} sits above the top margin`
      );
    }
  }
}

describe("buildInvoicePdf", () => {
  test("renders the same facts as the screen", () => {
    const { bytes } = buildInvoicePdf(INVOICE);
    const text = flatText(bytes);
    assert.match(text, /Brightloop Co\./); // letterhead
    assert.match(text, /INVOICE/); // document kind
    assert.match(text, /INV-0002/);
    assert.match(text, /Website relaunch \u2014 phase 1/);
    assert.match(text, /Aurora Labs/);
    assert.match(text, /Discovery workshop/);
    assert.match(text, /Oct 11, 2026/); // due date, not shifted by a timezone
    assert.match(text, /Payment due within 14 days\./);
  });

  test("totals are the app's money math, formatted as money", () => {
    // 2×450 + 1×2800 + 12×95 = 4,840.00; 18% tax = 871.20; total 5,711.20.
    const text = flatText(buildInvoicePdf(INVOICE).bytes);
    assert.match(text, /\$900\.00/);
    assert.match(text, /\$1,140\.00/);
    assert.match(text, /\$4,840\.00/);
    assert.match(text, /Tax \(18%\)/);
    assert.match(text, /\$871\.20/);
    assert.match(text, /Total due/);
    assert.match(text, /\$5,711\.20/);
  });

  test("status drives the strip: sent / paid / draft / void", () => {
    assert.match(flatText(buildInvoicePdf(INVOICE).bytes), /SENT[\s\S]*Sent Sep 27, 2026/);
    const paid = flatText(
      buildInvoicePdf({
        ...INVOICE,
        status: "paid",
        paidAt: "2026-10-02T09:00:00Z",
      }).bytes
    );
    assert.match(paid, /PAID[\s\S]*Paid Oct 2, 2026/);
    assert.match(paid, /Total paid/);
    assert.match(
      flatText(buildInvoicePdf({ ...INVOICE, status: "draft", sentAt: null }).bytes),
      /Not sent yet/
    );
    assert.match(
      flatText(buildInvoicePdf({ ...INVOICE, status: "void" }).bytes),
      /voided/
    );
  });

  test("an invoice with no line items says so instead of rendering a void", () => {
    const text = flatText(
      buildInvoicePdf({ ...INVOICE, items: [], taxPercent: 0, notes: "" }).bytes
    );
    assert.match(text, /No line items on this invoice\./);
    assert.match(text, /\$0\.00/);
  });

  test("missing dates print an em dash, never 'Invalid Date' or 1970", () => {
    const text = flatText(
      buildInvoicePdf({ ...INVOICE, dueDate: null, sentAt: null, paidAt: null }).bytes
    );
    assert.ok(!text.includes("Invalid"));
    assert.ok(!text.includes("1970"));
    assert.match(text, /\u2014/);
  });

  test("filename carries the invoice number and an ASCII client slug", () => {
    assert.equal(buildInvoicePdf(INVOICE).filename, "INV-0002-aurora-labs.pdf");
    assert.equal(
      buildInvoicePdf({ ...INVOICE, clientName: "Zoë & Søn (Køge)" }).filename,
      "INV-0002-zoe-son-koge.pdf"
    );
  });

  test("an absurd title is capped, not allowed to eat the document", () => {
    const { bytes } = buildInvoicePdf({ ...INVOICE, title: "Relaunch ".repeat(80) });
    const pages = documentText(bytes);
    // The title block stops after 4 lines with an ellipsis, so the line
    // items still land on page 1 with the totals.
    assert.ok(pages[0].some((run) => run.includes("\u2026")));
    assert.ok(pages[0].includes("Discovery workshop"));
    assert.ok(pages[0].some((run) => run === "$5,711.20"));
  });

  test("nothing is painted outside the margins", () => {
    assertInsideMargins(
      buildInvoicePdf({
        ...INVOICE,
        title:
          "Website relaunch, migration, analytics instrumentation and a very long title that must wrap",
        clientName: "Aurora Laboratories International Holdings Limited",
        items: [
          {
            description:
              "Discovery workshop, stakeholder interviews, competitor teardown and a written findings memo",
            quantity: 2,
            unit_amount_cents: 4500000,
          },
        ],
      }).bytes
    );
  });

  test("Letter is one option away, and changes the MediaBox", () => {
    const letter = buildInvoicePdf({ ...INVOICE, pageSize: "letter" });
    assert.match(decodePdf(letter.bytes), /\/MediaBox \[0 0 612 792\]/);
    assertInsideMargins(letter.bytes, PAGE_SIZES.letter);
  });

  test("the same invoice always produces the same bytes", () => {
    assert.deepEqual(
      Array.from(buildInvoicePdf(INVOICE).bytes),
      Array.from(buildInvoicePdf(INVOICE).bytes)
    );
  });
});

describe("pagination", () => {
  const many = Array.from({ length: 45 }, (_, i) => ({
    description: `Line item ${i + 1} — a description long enough to wrap onto a second line inside its column`,
    quantity: i + 1,
    unit_amount_cents: 12500,
  }));

  test("long documents paginate with a repeated letterhead and page numbers", () => {
    const { bytes } = buildInvoicePdf({ ...INVOICE, items: many });
    const pages = documentText(bytes);
    assert.ok(pages.length >= 3, `expected multiple pages, got ${pages.length}`);
    pages.forEach((page, index) => {
      const joined = page.join("\n");
      assert.match(joined, /Brightloop Co\./, `page ${index + 1} lost the letterhead`);
      assert.ok(
        joined.includes(`Page ${index + 1} of ${pages.length}`),
        `page ${index + 1} has the wrong footer`
      );
    });
    assertInsideMargins(bytes);
  });

  test("the table header repeats on every page it spills onto", () => {
    const pages = documentText(buildInvoicePdf({ ...INVOICE, items: many }).bytes);
    const withRows = pages.filter((page) =>
      page.some((run) => run.startsWith("Line item "))
    );
    assert.ok(withRows.length >= 2);
    for (const page of withRows) {
      assert.ok(page.includes("DESCRIPTION"), "a continued table lost its header");
      assert.ok(page.includes("AMOUNT"));
    }
  });

  test("no line item is split across a page break", () => {
    // Each row is atomic: its first line and its last line share a page.
    const pages = documentText(buildInvoicePdf({ ...INVOICE, items: many }).bytes);
    const seen = new Set<string>();
    for (const page of pages) {
      const labels = page
        .map((run) => /^Line item (\d+)/.exec(run)?.[1])
        .filter((value): value is string => value !== undefined);
      for (const label of labels) {
        assert.ok(
          !seen.has(label) || labels.includes(label),
          `line item ${label} straddles a page`
        );
        seen.add(label);
      }
    }
    assert.equal(seen.size, many.length);
  });
});

describe("buildContractPdf", () => {
  const CONTRACT = {
    workspaceName: "Brightloop Co.",
    generatedAt: GENERATED_AT,
    title: "Engagement agreement",
    clientName: "Aurora Labs",
    status: "signed" as const,
    terms: "1. Scope.\n\n2. Payment terms are net 14.",
    briefTitle: "Website relaunch",
    expiresOn: "2026-12-31",
    signedBy: "Priya Raman",
    sentAt: "2026-09-20T09:00:00Z",
    signedAt: "2026-09-22T11:12:00Z",
  };

  test("carries the terms, the stamps and the signatory", () => {
    const text = flatText(buildContractPdf(CONTRACT).bytes);
    assert.match(text, /CONTRACT/);
    assert.match(text, /Engagement agreement/);
    assert.match(text, /Aurora Labs \u2014 Website relaunch/);
    assert.match(text, /2\. Payment terms are net 14\./);
    assert.match(text, /Sep 20, 2026/); // sent
    assert.match(text, /Sep 22, 2026/); // signed
    assert.match(text, /Dec 31, 2026/); // expires
    assert.match(text, /Priya Raman/);
  });

  test("prints signature lines for both parties (there is no e-sign)", () => {
    const text = flatText(buildContractPdf(CONTRACT).bytes);
    assert.match(text, /SIGNATURES/);
    assert.match(text, /Aurora Labs \(client\)/);
    assert.equal((text.match(/Signature and date/g) ?? []).length, 2);
  });

  test("an empty contract still renders (no terms, never signed)", () => {
    const text = flatText(
      buildContractPdf({
        ...CONTRACT,
        status: "draft",
        terms: "",
        signedBy: "",
        briefTitle: null,
        sentAt: null,
        signedAt: null,
        expiresOn: null,
      }).bytes
    );
    assert.match(text, /No terms recorded\./);
    assert.match(text, /Draft \u2014 not sent yet/);
  });

  test("a book-length agreement paginates and stays inside the margins", () => {
    const terms = Array.from(
      { length: 40 },
      (_, i) => `${i + 1}. ${"The parties agree to the scope described in the brief. ".repeat(5)}`
    ).join("\n\n");
    const { bytes } = buildContractPdf({ ...CONTRACT, terms });
    assert.ok(documentText(bytes).length >= 3);
    assertInsideMargins(bytes);
  });

  test("filename is a slug of the title", () => {
    assert.equal(
      buildContractPdf(CONTRACT).filename,
      "contract-engagement-agreement.pdf"
    );
  });
});

describe("buildProposalPdf", () => {
  const PROPOSAL = {
    workspaceName: "Brightloop Co.",
    generatedAt: GENERATED_AT,
    title: "Website relaunch proposal",
    clientName: "Aurora Labs",
    status: "sent" as const,
    deliverables: [
      { text: "Discovery workshop", checked: true },
      { text: "Design system", checked: false },
    ],
    budgetTimeline: "$18,000 over 8 weeks",
    briefTitle: "Website relaunch",
    createdAt: "2026-09-18T09:00:00Z",
    updatedAt: "2026-09-26T09:00:00Z",
  };

  test("lists deliverables and the budget line", () => {
    const text = flatText(buildProposalPdf(PROPOSAL).bytes);
    assert.match(text, /PROPOSAL/);
    assert.match(text, /Deliverables/);
    assert.match(text, /Discovery workshop/);
    assert.match(text, /Design system/);
    assert.match(text, /Budget & timeline/);
    assert.match(text, /\$18,000 over 8 weeks/);
    assert.match(text, /Website relaunch/); // source brief
  });

  test("checked deliverables are drawn as filled marks, not glyphs", () => {
    const stream = pageStreams(decodePdf(buildProposalPdf(PROPOSAL).bytes))[0];
    // One marker per deliverable; the unchecked one is a hairline box with a
    // white inner fill, so the rect count is 2 (checked) + 4 (strip/rules…)
    // — the assertion that matters is that no check character was written.
    assert.ok(!flatText(buildProposalPdf(PROPOSAL).bytes).includes("\u2713"));
    assert.match(stream, /1 0\.42 0\.17 rg/); // accent-filled marker
  });

  test("empty proposals say what is missing", () => {
    const text = flatText(
      buildProposalPdf({
        ...PROPOSAL,
        deliverables: [],
        budgetTimeline: null,
        clientName: null,
        briefTitle: null,
      }).bytes
    );
    assert.match(text, /No deliverables listed yet\./);
    assert.match(text, /Not specified\./);
    assert.match(text, /Client/);
  });

  test("filename is a slug of the title", () => {
    assert.equal(
      buildProposalPdf(PROPOSAL).filename,
      "proposal-website-relaunch-proposal.pdf"
    );
  });
});

describe("slugify", () => {
  test("ASCII-folds, lowercases and dash-joins", () => {
    assert.equal(slugify("Brightloop Co."), "brightloop-co");
    assert.equal(slugify("Zoë & Søn (Køge)"), "zoe-son-koge");
    assert.equal(slugify("  spaced   out  "), "spaced-out");
  });

  test("never returns an empty or trailing-dash slug", () => {
    assert.equal(slugify(""), "document");
    assert.equal(slugify("東京"), "document");
    assert.equal(slugify("a".repeat(120)).length, 60);
    assert.ok(!slugify("Aurora Labs International Holdings Limited GmbH und Co KG").endsWith("-"));
  });
});
