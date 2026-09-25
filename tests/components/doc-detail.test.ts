/**
 * Structural tests for the Step-34 shared document vocabulary
 * (components/ui/doc-detail.tsx) — the design-language contracts every
 * detail page composes from. Source-string assertions, same convention
 * as nav.test.ts: the .tsx is JSX, so the zero-dep runner reads it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../../components/ui/doc-detail.tsx", import.meta.url),
  "utf8"
);

describe("doc-detail vocabulary (Step 34)", () => {
  it("exports the six shared pieces", () => {
    for (const name of [
      "DocHeader",
      "StatTile",
      "PaperCard",
      "ActivityTimeline",
      "ListStats",
      "StackedBar",
    ]) {
      assert.ok(src.includes(`export function ${name}`), name);
    }
  });

  it("DocHeader leads with the accent icon-chip page head", () => {
    assert.ok(src.includes('icon-chip icon-chip-accent h-10 w-10 shrink-0'));
  });

  it("StatTile tones map to the icon-chip vocabulary (error = plain chip)", () => {
    for (const cls of ['"icon-chip-accent"', '"icon-chip-success"', '"icon-chip-muted"']) {
      assert.ok(src.includes(cls), cls);
    }
    assert.ok(src.includes('tone === "error"'), "error tone exists");
    assert.ok(src.includes("delay = 0"), "rise-in delay prop");
  });

  it("PaperCard carries the letterhead contract", () => {
    assert.ok(src.includes("letterhead"));
    assert.ok(src.includes("letterLabel"));
  });

  it("ListStats has the 4-col and 3-col band grids", () => {
    assert.ok(src.includes("lg:grid-cols-4"));
    assert.ok(src.includes("sm:grid-cols-3"));
  });

  it("StackedBar draws the 8px pill track", () => {
    assert.ok(
      src.includes("flex h-2 w-full overflow-hidden rounded-full bg-muted")
    );
  });
});
