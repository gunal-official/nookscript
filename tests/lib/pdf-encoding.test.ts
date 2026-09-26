/**
 * Unit tests for lib/pdf/encoding.ts — the UTF-8 → WinAnsi boundary every
 * byte of drawn text crosses (PDF export).
 *
 * What matters here: the app's copy is full of typographic punctuation
 * (— · ’ “ ”) and client names are full of accents, so the mapping is the
 * difference between a professional invoice and mojibake. Built-in
 * node:test only (zero test deps, same as the rest of the suite).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  escapePdfString,
  toWinAnsi,
  winAnsiCodes,
} from "../../lib/pdf/encoding.ts";

describe("toWinAnsi", () => {
  test("ASCII passes through untouched", () => {
    assert.equal(toWinAnsi("Invoice INV-0002: $1,250.00"), "Invoice INV-0002: $1,250.00");
  });

  test("the CP1252 typographic block maps to its WinAnsi codes", () => {
    assert.deepEqual(winAnsiCodes("\u2014"), [151]); // em dash
    assert.deepEqual(winAnsiCodes("\u2013"), [150]); // en dash
    assert.deepEqual(winAnsiCodes("\u2019"), [146]); // right single quote
    assert.deepEqual(winAnsiCodes("\u201c\u201d"), [147, 148]);
    assert.deepEqual(winAnsiCodes("\u2026"), [133]); // ellipsis
    assert.deepEqual(winAnsiCodes("\u2022"), [149]); // bullet
    assert.deepEqual(winAnsiCodes("\u20ac"), [128]); // euro
    assert.deepEqual(winAnsiCodes("\u00b7"), [183]); // middle dot (the app's separator)
  });

  test("Latin-1 accents survive (client names are not ASCII)", () => {
    assert.deepEqual(winAnsiCodes("José"), [74, 111, 115, 233]);
    assert.deepEqual(winAnsiCodes("Müller & Søn"), [
      77, 252, 108, 108, 101, 114, 32, 38, 32, 83, 248, 110,
    ]);
  });

  test("characters with no glyph get an honest ASCII rendering", () => {
    assert.equal(toWinAnsi("\u20b91,200"), "Rs.1,200"); // ₹ has no base-14 glyph
    assert.equal(toWinAnsi("a\u2212b"), "a-b"); // minus sign → hyphen
    assert.equal(toWinAnsi("x\u2264y"), "x<=y");
    assert.equal(toWinAnsi("a\u00a0b"), "a b"); // nbsp → space
    assert.equal(toWinAnsi("a\u200bb"), "ab"); // zero-width space vanishes
  });

  test("accents outside Latin-1 decompose instead of becoming '?'", () => {
    assert.equal(toWinAnsi("Kalyāṇa"), "Kalyana");
    assert.equal(toWinAnsi("Łódź"), "?ódz"); // Ł has no decomposition; ó/ź do
  });

  test("characters with no rendering at all become a visible '?'", () => {
    assert.equal(toWinAnsi("東京"), "??");
    assert.equal(toWinAnsi("hi 👋"), "hi ?"); // one '?' for the surrogate pair
  });

  test("newlines are dropped (line breaking is the layout's job)", () => {
    assert.equal(toWinAnsi("a\nb\r\nc"), "abc");
  });

  test("long strings encode without blowing the call stack", () => {
    const long = "é".repeat(200_000);
    assert.equal(toWinAnsi(long).length, 200_000);
  });
});

describe("escapePdfString", () => {
  test("escapes backslash and both parentheses", () => {
    assert.equal(
      escapePdfString("Acme (EU) \\ partner)"),
      "Acme \\(EU\\) \\\\ partner\\)"
    );
  });

  test("control bytes go octal", () => {
    assert.equal(escapePdfString("a\u0007b"), "a\\007b");
  });

  test("high WinAnsi bytes are left as-is (they are literal bytes)", () => {
    assert.equal(escapePdfString(toWinAnsi("José")), "Jos\u00e9");
  });
});
