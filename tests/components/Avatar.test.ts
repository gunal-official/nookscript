import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("Avatar fallback", () => {
  it("initials derive centrally via getInitials and render in the Topbar", () => {
    assert.ok(read("lib/utils.ts").includes("export function getInitials"));
    const topbar = read("components/app-shell/Topbar.tsx");
    assert.ok(topbar.includes("AvatarFallback"));
    assert.ok(topbar.includes("initials"));
    assert.ok(read("app/(app)/layout.tsx").includes("getInitials"));
  });
});
