/**
 * Unit tests for lib/pdf/writer.ts — the file format itself (PDF export).
 *
 * A PDF is only openable if its cross-reference offsets are byte-exact, so
 * these tests parse the produced bytes back (tests/lib/pdf-read.ts) and
 * check the structure a reader checks: header, one xref entry per object
 * pointing AT that object, /Length matching the stream, and only the fonts
 * that were actually used declared as resources.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  createPage,
  drawLine,
  drawRect,
  drawText,
  PAGE_SIZES,
  pdfDate,
  renderPdf,
} from "../../lib/pdf/writer.ts";
import {
  decodePdf,
  documentText,
  pageStreams,
  parseObjects,
  parseStartXref,
  parseXref,
  placedRuns,
  rects,
} from "./pdf-read.ts";

const META = {
  title: "Test document",
  author: "Brightloop Co.",
  createdAt: new Date("2026-09-27T10:30:00Z"),
};

function onePage() {
  const page = createPage(PAGE_SIZES.a4);
  drawText(page, 54, 700, "Hello invoice", { font: "Helvetica", size: 12 });
  return page;
}

describe("renderPdf — file structure", () => {
  test("starts with a PDF header and ends with %%EOF", () => {
    const pdf = decodePdf(renderPdf([onePage()], META));
    assert.ok(pdf.startsWith("%PDF-1.7\n"));
    assert.ok(pdf.endsWith("%%EOF\n"));
  });

  test("every xref offset points at its own object", () => {
    const page2 = createPage(PAGE_SIZES.a4);
    drawText(page2, 54, 700, "Second page", { font: "Helvetica-Bold", size: 10 });
    const pdf = decodePdf(renderPdf([onePage(), page2], META));

    const offsets = parseXref(pdf);
    // Entry 0 is the mandatory free head; objects start at 1.
    assert.equal(offsets[0], 0);
    for (let id = 1; id < offsets.length; id += 1) {
      assert.ok(
        pdf.startsWith(`${id} 0 obj`, offsets[id]),
        `xref[${id}] = ${offsets[id]} does not point at object ${id}`
      );
    }
    assert.equal(offsets.length - 1, parseObjects(pdf).length);
  });

  test("startxref points at the xref table", () => {
    const pdf = decodePdf(renderPdf([onePage()], META));
    assert.ok(pdf.startsWith("xref\n", parseStartXref(pdf)));
  });

  test("/Size and /Count agree with what was written", () => {
    const pdf = decodePdf(renderPdf([onePage(), onePage(), onePage()], META));
    const objects = parseObjects(pdf);
    assert.match(pdf, new RegExp(`/Size ${objects.length + 1}\\b`));
    assert.match(pdf, /\/Type \/Pages \/Count 3\b/);
    assert.equal(pageStreams(pdf).length, 3);
  });

  test("each content stream's /Length is its real byte length", () => {
    const pdf = decodePdf(renderPdf([onePage(), onePage()], META));
    for (const object of parseObjects(pdf)) {
      if (!object.stream) continue;
      const declared = /\/Length (\d+)/.exec(object.body);
      assert.ok(declared);
      assert.equal(Number(declared[1]), object.stream.length);
    }
  });

  test("only the fonts actually used are declared", () => {
    const page = createPage(PAGE_SIZES.a4);
    drawText(page, 54, 700, "regular", { font: "Helvetica", size: 10 });
    drawText(page, 54, 680, "bold", { font: "Helvetica-Bold", size: 10 });
    const pdf = decodePdf(renderPdf([page], META));
    assert.match(pdf, /\/BaseFont \/Helvetica /);
    assert.match(pdf, /\/BaseFont \/Helvetica-Bold /);
    assert.ok(!pdf.includes("/BaseFont /Helvetica-Oblique"));
    // …and every font declares the encoding the metrics assume.
    assert.equal((pdf.match(/\/Encoding \/WinAnsiEncoding/g) ?? []).length, 2);
  });

  test("a page with no text still resources one font (valid Resources)", () => {
    const page = createPage(PAGE_SIZES.a4);
    drawLine(page, 0, 0, 10, 10, { r: 0, g: 0, b: 0 });
    const pdf = decodePdf(renderPdf([page], META));
    assert.match(pdf, /\/BaseFont \/Helvetica /);
  });

  test("page size lands in the MediaBox (A4 and Letter)", () => {
    const a4 = decodePdf(renderPdf([createPage(PAGE_SIZES.a4)], META));
    assert.match(a4, /\/MediaBox \[0 0 595\.28 841\.89\]/);
    const letter = decodePdf(renderPdf([createPage(PAGE_SIZES.letter)], META));
    assert.match(letter, /\/MediaBox \[0 0 612 792\]/);
  });

  test("throws rather than writing a zero-page file", () => {
    assert.throws(() => renderPdf([], META), /no pages/);
  });
});

describe("renderPdf — metadata", () => {
  test("ASCII metadata is a literal string; non-ASCII becomes UTF-16BE", () => {
    const pdf = decodePdf(
      renderPdf([onePage()], { ...META, title: "Plain title" })
    );
    assert.ok(pdf.includes("/Title (Plain title)"));

    const unicode = decodePdf(
      renderPdf([onePage()], { ...META, title: "INV-0002 \u2014 Aurora" })
    );
    // FEFF BOM + UTF-16BE code units ("I" = 0049) — what readers show in
    // their title bar instead of PDFDocEncoding mojibake.
    assert.match(unicode, /\/Title <FEFF0049004E0056/);
  });

  test("the creation date is the injected one, in UTC", () => {
    assert.equal(pdfDate(new Date("2026-09-27T10:30:00Z")), "D:20260927103000Z");
    const pdf = decodePdf(renderPdf([onePage()], META));
    assert.ok(pdf.includes("/CreationDate (D:20260927103000Z)"));
    assert.ok(pdf.includes("/Producer (nookscript pdf writer)"));
  });

  test("identical input produces byte-identical output", () => {
    const a = renderPdf([onePage()], META);
    const b = renderPdf([onePage()], META);
    assert.deepEqual(Array.from(a), Array.from(b));
  });
});

describe("drawing primitives", () => {
  test("text is placed with a text matrix at the requested point", () => {
    const page = createPage(PAGE_SIZES.a4);
    drawText(page, 54.5, 700.25, "Placed", { font: "Helvetica", size: 11 });
    const [run] = placedRuns(pageStreams(decodePdf(renderPdf([page], META)))[0]);
    assert.equal(run.text, "Placed");
    assert.equal(run.x, 54.5);
    assert.equal(run.y, 700.25);
    assert.equal(run.size, 11);
    assert.equal(run.font, "F1");
  });

  test("client text is escaped, not injected, into the stream", () => {
    const page = createPage(PAGE_SIZES.a4);
    drawText(page, 10, 10, "Acme (EU) \\ Ltd) Tj 0 0 0 rg (pwned", {
      font: "Helvetica",
      size: 10,
    });
    const [[text]] = documentText(renderPdf([page], META));
    assert.equal(text, "Acme (EU) \\ Ltd) Tj 0 0 0 rg (pwned");
  });

  test("empty text draws nothing at all", () => {
    const page = createPage(PAGE_SIZES.a4);
    drawText(page, 10, 10, "", { font: "Helvetica", size: 10 });
    assert.deepEqual(documentText(renderPdf([page], META)), [[]]);
  });

  test("rectangles and lines round-trip their geometry", () => {
    const page = createPage(PAGE_SIZES.a4);
    drawRect(page, 54, 100, 487.28, 1.6, { r: 1, g: 0.416, b: 0.169 });
    drawLine(page, 54, 90, 541, 90, { r: 0.9, g: 0.9, b: 0.9 }, 0.7);
    const stream = pageStreams(decodePdf(renderPdf([page], META)))[0];
    assert.deepEqual(rects(stream), [[54, 100, 487.28, 1.6]]);
    assert.match(stream, /1 0\.42 0\.17 rg/); // accent, 2dp
    assert.match(stream, /0\.7 w/);
    assert.match(stream, /54 90 m/);
  });
});
