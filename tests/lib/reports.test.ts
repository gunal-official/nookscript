/**
 * Unit tests for lib/reports.ts — the Reports page's pure aggregation
 * (money buckets, time keys, by_brief top-5, contract expiry). Dates in
 * fixtures are pinned relative to the run day so the suite is stable
 * across calendar boundaries (today is always inside its own month).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { computeReport } from "../../lib/reports.ts";
import { localToday } from "../../lib/utils.ts";

const offsetDays = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const today = localToday();

describe("computeReport — money", () => {
  test("buckets by status; void excluded from totals, counted alone", () => {
    const r = computeReport({
      invoices: [
        { id: "a", status: "draft", total_cents: 100 },
        { id: "b", status: "draft", total_cents: 50 },
        { id: "c", status: "sent", total_cents: 700 },
        { id: "d", status: "paid", total_cents: 2500 },
        { id: "e", status: "void", total_cents: 9999 },
      ],
      entries: [],
      contracts: [],
      briefs: [],
    } as never);
    assert.equal(r.money.draft_cents, 150);
    assert.equal(r.money.outstanding_cents, 700);
    assert.equal(r.money.collected_cents, 2500);
    assert.equal(r.money.draft_count, 2);
    assert.equal(r.money.sent_count, 1);
    assert.equal(r.money.paid_count, 1);
    assert.equal(r.money.void_count, 1);
  });
});

describe("computeReport — time", () => {
  test("worked_on keys today/month/all; by_brief = this month only", () => {
    const r = computeReport({
      invoices: [],
      entries: [
        { id: "t1", brief_id: "br-1", worked_on: today, duration_minutes: 60 },
        { id: "t2", brief_id: null, worked_on: today, duration_minutes: 30 },
        { id: "t3", brief_id: "br-1", worked_on: "2000-01-01", duration_minutes: 500 },
      ],
      contracts: [],
      briefs: [{ id: "br-1", title: "Kitchen fit-out" }],
    } as never);
    assert.equal(r.time.today_minutes, 90);
    assert.equal(r.time.month_minutes, 90);
    assert.equal(r.time.all_minutes, 590);
    // by_brief: br-1 (60) then General (30) — the 2000 entry is out of month.
    assert.deepEqual(r.time.by_brief, [
      { brief_id: "br-1", title: "Kitchen fit-out", minutes: 60, entry_count: 1 },
      { brief_id: null, title: "General — no brief", minutes: 30, entry_count: 1 },
    ]);
  });

  test("by_brief caps at top 5 and always keeps the General row", () => {
    const briefs = ["b1", "b2", "b3", "b4", "b5", "b6"].map((id) => ({
      id,
      title: `Brief ${id}`,
    }));
    const entries = [
      ...["b1", "b2", "b3", "b4", "b5", "b6"].map((id, i) => ({
        id: `e-${id}`,
        brief_id: id,
        worked_on: today,
        duration_minutes: (6 - i) * 10, // b1=60 … b6=10
      })),
      { id: "e-g", brief_id: null, worked_on: today, duration_minutes: 5 },
    ];
    const r = computeReport({ invoices: [], entries, contracts: [], briefs } as never);
    assert.equal(r.time.by_brief.length, 6, "top 5 + General");
    assert.equal(r.time.by_brief[0].minutes, 60);
    assert.equal(r.time.by_brief[4].brief_id, "b5");
    const general = r.time.by_brief[5];
    assert.equal(general.brief_id, null);
    assert.equal(general.minutes, 5);
  });

  test("zero/negative-minute rows drop out of by_brief; unknown brief titles read 'Unknown brief'", () => {
    const r = computeReport({
      invoices: [],
      entries: [
        { id: "z1", brief_id: "missing", worked_on: today, duration_minutes: 0 },
        { id: "z2", brief_id: "missing2", worked_on: today, duration_minutes: -15 },
      ],
      contracts: [],
      briefs: [],
    } as never);
    assert.deepEqual(r.time.by_brief, []);
  });
});

describe("computeReport — contracts", () => {
  test("status counts + expiry bands (void never counts as expired/expiring)", () => {
    const r = computeReport({
      invoices: [],
      entries: [],
      contracts: [
        { id: "c1", status: "draft", expires_on: null },
        { id: "c2", status: "sent", expires_on: null },
        { id: "c3", status: "signed", expires_on: offsetDays(10) },
        { id: "c4", status: "signed", expires_on: offsetDays(-1) },
        { id: "c5", status: "signed", expires_on: offsetDays(31) },
        { id: "c6", status: "void", expires_on: offsetDays(-99) },
      ],
      briefs: [],
    } as never);
    assert.equal(r.contracts.draft_count, 1);
    assert.equal(r.contracts.sent_count, 1);
    assert.equal(r.contracts.signed_count, 3);
    assert.equal(r.contracts.void_count, 1);
    assert.equal(r.contracts.expiring_soon_count, 1, "today+10 lands ≤ today+30");
    assert.equal(r.contracts.expired_count, 1, "today-1 expired; void past ignored");
  });

  test("empty input → zeroed report", () => {
    const r = computeReport({ invoices: [], entries: [], contracts: [], briefs: [] });
    assert.equal(r.money.draft_cents + r.money.outstanding_cents + r.money.collected_cents, 0);
    assert.equal(r.money.draft_count + r.money.sent_count + r.money.paid_count + r.money.void_count, 0);
    assert.equal(r.time.all_minutes, 0);
    assert.equal(r.contracts.expired_count, 0);
  });
});
