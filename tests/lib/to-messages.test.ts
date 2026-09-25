/**
 * Unit tests for lib/to-messages.ts — the source-text → bubbles split
 * shared by every source rendering.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { toMessages } from "../../lib/to-messages.ts";

describe("toMessages", () => {
  test("blank-line paragraphs become separate bubbles", () => {
    assert.deepEqual(toMessages("First para.\n\nSecond para.\n\n\nThird."), [
      "First para.",
      "Second para.",
      "Third.",
    ]);
  });

  test("trims edges and drops empty/whitespace-only paragraphs", () => {
    assert.deepEqual(toMessages("  hello  \n\n   \n\n\tworld\t"), ["hello", "world"]);
    assert.deepEqual(toMessages(""), []);
  });

  test("single newlines stay inside one bubble (soft wraps)", () => {
    assert.deepEqual(toMessages("line one\nline two"), ["line one\nline two"]);
  });

  test("CRLF blank lines split too — Windows-pasted emails are paragraphs", () => {
    assert.deepEqual(toMessages("Para one.\r\n\r\nPara two.\r\n\r\nPara three."), [
      "Para one.",
      "Para two.",
      "Para three.",
    ]);
  });
});
