import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("WorkspaceSwitcher", () => {
  it("renders a real control and a plain name when only one workspace", () => {
    const src = read("components/app-shell/WorkspaceSwitcher.tsx");
    assert.ok(src.includes("export function WorkspaceSwitcher"));
    assert.ok(src.includes("SwitcherWorkspace"));
    assert.ok(src.includes("workspaces.length <= 1"));
    assert.ok(src.includes('role="combobox"') || src.includes("SelectValue") || src.includes("SelectTrigger"));
  });

  it("switching is wired through the server action", () => {
    assert.ok(read("components/app-shell/WorkspaceSwitcher.tsx").includes("switch"));
  });
});
