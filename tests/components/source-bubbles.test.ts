/**
 * Structural tests for components/intake/SourceBubbles.tsx — the shared
 * chat-style source rendering (preview, inbox threads, brief Sources).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../../components/intake/SourceBubbles.tsx", import.meta.url),
  "utf8"
);

describe("SourceBubbles (Step 34)", () => {
  it("splits paragraphs via the shared lib/to-messages helper", () => {
    assert.ok(src.includes("to-messages"), "imports lib/to-messages");
  });

  it("bubbles keep soft wraps and carry the accent MessageSquare chip", () => {
    assert.ok(src.includes("whitespace-pre-wrap"));
    assert.ok(src.includes("icon-chip icon-chip-accent"));
    assert.ok(src.includes("MessageSquare"));
  });
});
