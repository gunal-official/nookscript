/**
 * Unit tests for lib/pdf/metrics.ts — the measurement layer (PDF export).
 *
 * Nothing in a PDF is laid out by a browser: if these numbers are wrong,
 * text runs off the page or money columns stop lining up. The width table
 * itself is generated from Adobe's AFMs, so the first test pins a few
 * published values (a regenerated table that disagrees fails here).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ellipsize,
  measureText,
  wrapParagraphs,
  wrapText,
} from "../../lib/pdf/metrics.ts";

describe("measureText", () => {
  test("matches Adobe's published Helvetica widths", () => {
    // space 278, A 667, W 944 (units/1000) — at 10pt that is 2.78 / 6.67 / 9.44.
    assert.equal(measureText(" ", "Helvetica", 10), 2.78);
    assert.equal(measureText("A", "Helvetica", 10), 6.67);
    assert.equal(measureText("W", "Helvetica", 10), 9.44);
    // Bold has its own table: "A" is 722 bold vs 667 regular.
    assert.equal(measureText("A", "Helvetica-Bold", 10), 7.22);
  });

  test("scales linearly with the font size", () => {
    const at10 = measureText("Invoice total", "Helvetica", 10);
    const at20 = measureText("Invoice total", "Helvetica", 20);
    assert.ok(Math.abs(at20 - at10 * 2) < 1e-9);
  });

  test("measures what will actually be PAINTED (post-transcoding)", () => {
    // ₹ is drawn as "Rs." — measuring the original would under-measure.
    assert.equal(
      measureText("\u20b9", "Helvetica", 10),
      measureText("Rs.", "Helvetica", 10)
    );
    // An unrenderable glyph costs exactly one "?".
    assert.equal(
      measureText("東", "Helvetica", 10),
      measureText("?", "Helvetica", 10)
    );
  });

  test("the empty string measures zero", () => {
    assert.equal(measureText("", "Helvetica", 12), 0);
  });
});

describe("wrapText", () => {
  test("every produced line fits the width", () => {
    const text =
      "Design system and component library, documented in Figma and handed over with design tokens.";
    const lines = wrapText(text, "Helvetica", 9.5, 200);
    assert.ok(lines.length > 1);
    for (const line of lines) {
      assert.ok(
        measureText(line, "Helvetica", 9.5) <= 200,
        `line overflows: ${line}`
      );
    }
    assert.equal(lines.join(" "), text);
  });

  test("greedy: it packs as many words as fit", () => {
    // "aaa bbb" measures 36.1pt, so 40pt fits two words per line but not three.
    assert.deepEqual(wrapText("aaa bbb ccc ddd", "Helvetica", 10, 40), [
      "aaa bbb",
      "ccc ddd",
    ]);
    assert.deepEqual(wrapText("aaa bbb ccc ddd", "Helvetica", 10, 20), [
      "aaa",
      "bbb",
      "ccc",
      "ddd",
    ]);
    assert.deepEqual(wrapText("aaa bbb ccc ddd", "Helvetica", 10, 1000), [
      "aaa bbb ccc ddd",
    ]);
  });

  test("an unbreakable run is hard-split instead of overflowing", () => {
    const url = "https://nookscript.app/invoice/00000000-0000-0000-0000-000000000070";
    const lines = wrapText(url, "Helvetica", 9.5, 120);
    assert.ok(lines.length > 1);
    for (const line of lines) {
      assert.ok(measureText(line, "Helvetica", 9.5) <= 120);
    }
    assert.equal(lines.join(""), url);
  });

  test("always returns at least one line", () => {
    assert.deepEqual(wrapText("", "Helvetica", 10, 100), [""]);
    assert.deepEqual(wrapText("   ", "Helvetica", 10, 100), [""]);
  });

  test("collapses runs of whitespace (a wrapped line has no double spaces)", () => {
    assert.deepEqual(wrapText("a    b", "Helvetica", 10, 500), ["a b"]);
  });
});

describe("wrapParagraphs", () => {
  test("explicit newlines break, blank lines survive as empty strings", () => {
    const lines = wrapParagraphs("First para.\n\nSecond para.", "Helvetica", 10, 500);
    assert.deepEqual(lines, ["First para.", "", "Second para."]);
  });

  test("CRLF input behaves like LF", () => {
    assert.deepEqual(
      wrapParagraphs("a\r\nb", "Helvetica", 10, 500),
      ["a", "b"]
    );
  });

  test("long paragraphs still wrap inside their own block", () => {
    const lines = wrapParagraphs(
      "one two three four five six seven\n\nlast",
      "Helvetica",
      10,
      60
    );
    assert.equal(lines[lines.length - 1], "last");
    assert.ok(lines.length > 3);
  });
});

describe("ellipsize", () => {
  test("short text is returned unchanged", () => {
    assert.equal(ellipsize("Aurora Labs", "Helvetica", 9.5, 200), "Aurora Labs");
  });

  test("long text is cut to fit, with an ellipsis", () => {
    const out = ellipsize(
      "Aurora Labs International Holdings Limited",
      "Helvetica",
      9.5,
      60
    );
    assert.ok(out.endsWith("\u2026"));
    assert.ok(measureText(out, "Helvetica", 9.5) <= 60);
    assert.ok(out.length > 1);
  });

  test("no trailing space before the ellipsis", () => {
    const out = ellipsize("aaaa bbbb cccc dddd", "Helvetica", 10, 40);
    assert.ok(!out.includes(" \u2026"));
  });

  test("a width too small for even the ellipsis yields nothing", () => {
    assert.equal(ellipsize("anything", "Helvetica", 10, 0.5), "");
  });
});
