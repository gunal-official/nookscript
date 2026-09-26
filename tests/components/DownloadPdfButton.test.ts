/**
 * Source-contract tests for the PDF download affordance (PDF export) —
 * the same style as the other component tests: assert the properties the
 * design system treats as law, on every surface that carries the button.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("DownloadPdfButton", () => {
  const src = read("components/ui/DownloadPdfButton.tsx");

  it("is a real link, so it needs no client JavaScript", () => {
    assert.ok(!src.includes('"use client"'), "must stay a server component");
    assert.ok(/<a href={href} download>/.test(src));
    assert.ok(src.includes("asChild"));
  });

  it("obeys the icon + tap-target rules", () => {
    // size="sm" is the 44px pill (h-11 in components/ui/button.tsx).
    assert.ok(src.includes('size="sm"'));
    assert.ok(src.includes('aria-hidden="true"'), "decorative icon must be hidden");
    assert.ok(src.includes("h-4 w-4"), "16px icon, per docs/icon-audit.md");
  });

  it("never prints itself (matching PrintButton)", () => {
    assert.ok(src.includes("print:hidden"));
  });
});

describe("document surfaces wire the download", () => {
  const cases: [string, RegExp][] = [
    ["app/(app)/invoices/[id]/page.tsx", /\/api\/pdf\/invoice\/\$\{invoice\.id\}/],
    ["app/(app)/contracts/[id]/page.tsx", /\/api\/pdf\/contract\/\$\{contract\.id\}/],
    ["app/(app)/proposals/[id]/page.tsx", /\/api\/pdf\/proposal\/\$\{proposal\.id\}/],
    ["app/invoice/[token]/page.tsx", /\/api\/pdf\/shared\/invoice\/\$\{token\}/],
  ];

  for (const [file, href] of cases) {
    it(`${file} points at the right route`, () => {
      const src = read(file);
      assert.ok(src.includes("DownloadPdfButton"), "button not mounted");
      assert.match(src, href);
    });
  }

  it("the public page only offers the download once the token resolved", () => {
    const src = read("app/invoice/[token]/page.tsx");
    // The unavailable state renders <Brand /> with no token — a visitor
    // must never be handed a link that 404s.
    assert.ok(src.includes("{token && ("), "download must be conditional");
  });

  it("every actions row can wrap (320px is a supported width)", () => {
    // Detail pages hand the button to DocHeader, whose actions row is the
    // shared wrap-safe container…
    assert.match(
      read("components/ui/doc-detail.tsx"),
      /\{actions && <div className="flex flex-wrap items-center gap-2">/
    );
    // …the two hand-rolled rows (contract rail card, public invoice chrome)
    // carry flex-wrap themselves.
    assert.match(
      read("app/(app)/contracts/[id]/page.tsx"),
      /flex flex-wrap gap-2 border-t/
    );
    assert.match(
      read("app/invoice/[token]/page.tsx"),
      /flex flex-wrap items-center gap-2">\s*<Badge variant="outline">Shared invoice/
    );
  });
});
