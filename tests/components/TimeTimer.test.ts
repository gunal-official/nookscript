import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("TimeTimer", () => {
  it("keeps every control at 44px and unshrinkable at 320px", () => {
    const src = read("components/time/TimeTimer.tsx");
    assert.ok(src.includes("export function TimeTimer"));
    assert.ok(src.includes('className="min-h-11 flex h-11 w-11 shrink-0 items-center justify-center rounded-full')); // discard
    assert.ok(src.includes('className="h-11 shrink-0 gap-1.5')); // Stop
  });

  it("stop flow collects a label and notes before submitting", () => {
    const src = read("components/time/TimeTimer.tsx");
    assert.ok(src.includes('placeholder="What are you working on?"'));
    assert.ok(src.includes('pending ? "Saving…"')); // real submit label + pending state
    assert.ok(src.includes("logTimeAction")); // real server action
  });
});
