import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isActive,
  MONEY_HREFS,
  NAV_GROUPS,
  visibleGroups,
} from "../../components/app-shell/nav-items.ts";

// Structural tests (built-in node:test — zero test deps) asserting the Step-33
// icon system + responsive nav contract against the real source files.
const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("Navigation (Step 33)", () => {
  it("one nav model carries every section with a semantic icon", () => {
    const src = read("components/app-shell/nav-items.ts");
    for (const label of ["Intake", "Inbox", "Briefs", "Proposals", "Plans", "Updates", "Invoices", "Time", "Contracts", "Reports", "Settings"]) {
      assert.ok(src.includes(`label: "${label}"`));
    }
    for (const icon of ["PenLine", "Inbox", "ClipboardList", "FileText", "ListChecks", "MessageSquare", "Receipt", "Clock", "FileSignature", "BarChart3", "Settings"]) {
      assert.ok(src.includes(`icon: ${icon}`));
    }
    assert.ok(src.includes("MONEY_HREFS")); // viewer money-hiding stays wired
  });

  it("mobile drawer shows every item as a 44px icon+label row and closes on choose", () => {
    const src = read("components/app-shell/MobileNav.tsx");
    assert.ok(src.includes("min-h-11"));
    assert.ok(src.includes("h-5 w-5")); // 20px nav icons
    assert.ok(src.includes("animate-slide-in"));
    assert.ok(src.includes("onClick={onClose}"));
    assert.ok(src.includes('aria-current={active ? "page" : undefined}'));
  });

  it("sidebar: 64px icon rail on tablet, 232px labeled nav on desktop", () => {
    const src = read("components/app-shell/Sidebar.tsx");
    assert.ok(src.includes('w-[64px]'));
    assert.ok(src.includes('desk:w-[232px]'));
    assert.ok(src.includes("max-desk:sr-only")); // labels collapse to the rail
    assert.ok(src.includes("title={label}")); // rail keeps a hover tooltip
  });

  it("topbar: hamburger for the drawer, Escape closes, search never clips", () => {
    const src = read("components/app-shell/Topbar.tsx");
    assert.ok(src.includes("tab:hidden")); // hamburger only below tab
    assert.ok(src.includes('aria-label="Open menu"'));
    assert.ok(src.includes('e.key === "Escape"'));
    assert.ok(src.includes("order-last w-full sm:order-none")); // full-width search row on mobile
  });

  it("shell bands are the user-specified 600/1024 breakpoints", () => {
    assert.ok(read("tailwind.config.ts").includes('tab: "600px"'));
    assert.ok(read("tailwind.config.ts").includes('desk: "1024px"'));
  });

  it("motion system respects prefers-reduced-motion", () => {
    const src = read("app/globals.css");
    assert.ok(src.includes("prefers-reduced-motion: reduce"));
    assert.ok(src.includes("stroke-width: 1.5")); // one icon stroke everywhere
  });
});


describe("Navigation behavior (Step 34 wrap)", () => {
  it("visibleGroups: viewers lose /invoices and /time, keep the rest", () => {
    const viewer = visibleGroups(false);
    const hrefs = viewer.flatMap((g) => g.items.map((i) => i.href));
    assert.ok(!hrefs.includes("/invoices"));
    assert.ok(!hrefs.includes("/time"));
    for (const kept of ["/", "/intake", "/briefs", "/contracts", "/reports", "/settings"]) {
      assert.ok(hrefs.includes(kept), kept);
    }
    // Money hiding is exactly the MONEY_HREFS set — nothing else drops.
    const owner = visibleGroups(true).flatMap((g) => g.items.map((i) => i.href));
    assert.equal(owner.length, hrefs.length + MONEY_HREFS.size);
  });

  it("visibleGroups never returns an empty group", () => {
    for (const canSeeMoney of [true, false]) {
      for (const group of visibleGroups(canSeeMoney)) {
        assert.ok(group.items.length > 0, group.label);
      }
    }
  });

  it("isActive: exact for /, prefix-with-slash for sections", () => {
    assert.ok(isActive("/", "/"));
    assert.ok(!isActive("/briefs", "/"));
    assert.ok(isActive("/briefs", "/briefs"));
    assert.ok(isActive("/briefs/abc-123", "/briefs"));
    assert.ok(!isActive("/briefsx", "/briefs"), "no fuzzy prefix matches");
    assert.ok(isActive("/intake/inbox", "/intake"), "nested pages light their section");
    assert.ok(isActive("/intake/inbox", "/intake/inbox"));
    assert.ok(!isActive("/intake", "/intake/inbox"));
  });

  it("NAV_GROUPS covers every destination exactly once", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    assert.equal(new Set(hrefs).size, hrefs.length, "duplicate hrefs");
    assert.equal(hrefs.length, 12, "7 workspace + 4 money + 1 account");
  });
});
