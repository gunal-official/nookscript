/**
 * Unit tests for lib/invoice-totals.ts — the money math (Step 17): every
 * stored shape the composer can save and the public view must render.
 * Built-in node:test only (zero test deps, same as the rest of the suite).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { invoiceTotals } from "../../lib/invoice-totals.ts";

describe("invoiceTotals (money math)", () => {
  test("subtotal → tax (rounded) → total", () => {
    const t = invoiceTotals(
      [
        { id: "a", description: "Work", quantity: 2, unit_amount_cents: 4500 },
        { id: "b", description: "More", quantity: 1, unit_amount_cents: 1200 },
      ],
      20
    );
    assert.equal(t.subtotal_cents, 10200);
    assert.equal(t.tax_cents, 2040);
    assert.equal(t.total_cents, 12240);
  });

  test("tax rounds to the cent (half-cent rounds up)", () => {
    // 999 × 5% = 49.95 → 50
    const t = invoiceTotals(
      [{ id: "a", description: "x", quantity: 1, unit_amount_cents: 999 }],
      5
    );
    assert.equal(t.tax_cents, 50);
    assert.equal(t.total_cents, 1049);
  });

  test("zero items and zero tax → all zeros", () => {
    const t = invoiceTotals([], 0);
    assert.deepEqual(t, {
      subtotal_cents: 0,
      tax_cents: 0,
      total_cents: 0,
    });
  });

  test("defensive: null items never crash", () => {
    const t = invoiceTotals(null, 20);
    assert.equal(t.total_cents, 0);
  });

  test("defensive: negative / fractional / NaN values count as 0 or floor", () => {
    const t = invoiceTotals(
      [
        { id: "a", description: "neg qty", quantity: -3, unit_amount_cents: 500 },
        { id: "b", description: "neg unit", quantity: 1, unit_amount_cents: -500 },
        { id: "c", description: "frac unit", quantity: 1, unit_amount_cents: 12.7 },
        { id: "d", description: "NaN unit", quantity: 1, unit_amount_cents: NaN },
        { id: "e", description: "NaN qty", quantity: NaN, unit_amount_cents: 500 },
      ],
      0
    );
    // Only the fractional unit contributes: Math.trunc(12.7) = 12.
    assert.equal(t.subtotal_cents, 12);
    assert.equal(t.total_cents, 12);
  });

  test("defensive: tax percent clamps to 0–100", () => {
    const items = [
      { id: "a", description: "x", quantity: 1, unit_amount_cents: 1000 },
    ];
    assert.equal(invoiceTotals(items, -10).tax_cents, 0);
    assert.equal(invoiceTotals(items, 250).tax_cents, 1000);
  });

  test("quantity truncates to whole units (the composer's contract)", () => {
    const t = invoiceTotals(
      [{ id: "a", description: "x", quantity: 2.9, unit_amount_cents: 100 }],
      0
    );
    assert.equal(t.subtotal_cents, 200);
  });
});
