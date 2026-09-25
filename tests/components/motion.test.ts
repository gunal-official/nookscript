import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("Motion system (Step 33)", () => {
  it("route transitions live in segment templates", () => {
    for (const rel of ["app/(app)/template.tsx", "app/(marketing)/template.tsx", "app/(auth)/template.tsx"]) {
      assert.ok(read(rel).includes("animate-route-in"));
    }
  });

  it("dialog animates both entrance and exit with a blurred backdrop", () => {
    const src = read("components/ui/dialog.tsx");
    assert.ok(src.includes("data-[state=open]:animate-in"));
    assert.ok(src.includes("data-[state=closed]:animate-out"));
    assert.ok(src.includes("zoom-in-95"));
    assert.ok(src.includes("zoom-out-95"));
    assert.ok(src.includes("backdrop-blur"));
  });

  it("list rows rise in and collapse where they stood on removal", () => {
    const src = read("components/ui/motion-rows.tsx");
    assert.ok(src.includes("useMotionItems"));
    const css = read("app/globals.css");
    assert.ok(css.includes("animate-row-out"));
    assert.ok(css.includes("row-out"));
    const composer = read("components/invoices/InvoiceComposer.tsx");
    assert.ok(composer.includes("useMotionItems(items)"));
    assert.ok(composer.includes("animate-rise-in"));
  });

  it("toasts announce politely and animate in/out — wired to invite + invoice", () => {
    const src = read("components/ui/toast.tsx");
    assert.ok(src.includes('aria-live="polite"'));
    assert.ok(src.includes("animate-rise-in"));
    assert.ok(src.includes("animate-toast-out"));
    assert.ok(read("components/settings/TeamCard.tsx").includes('toast("Invite created")'));
    assert.ok(read("components/settings/TeamCard.tsx").includes('toast("Invite link copied")'));
    assert.ok(read("components/invoices/InvoiceComposer.tsx").includes('toast("Invoice saved")'));
    assert.ok(read("app/(app)/layout.tsx").includes("ToastProvider"));
  });

  it("loading skeletons shimmer instead of blank screens", () => {
    const src = read("app/(app)/loading.tsx");
    assert.ok(src.includes("skeleton"));
    assert.ok(read("app/globals.css").includes("shimmer"));
  });

  it("every animation is killed under prefers-reduced-motion", () => {
    const css = read("app/globals.css");
    assert.ok(css.includes("prefers-reduced-motion: reduce"));
    for (const cls of [".animate-route-in", ".animate-toast-out", ".animate-row-out", ".skeleton"]) {
      assert.ok(css.includes(cls));
    }
  });
});
