/**
 * Unit tests for lib/data/dashboard.ts — the Pipeline dashboard's clock
 * and week-strip math (Step 34(b)). Built-in node:test only.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { dashboardClock, weekMinutes } from "../../lib/data/dashboard.ts";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe("dashboardClock", () => {
  const clock = dashboardClock();

  test("today and soon are ISO dates, soon 30 days ahead", () => {
    assert.match(clock.today, ISO);
    assert.match(clock.soon, ISO);
    const today = Date.parse(clock.today);
    const soon = Date.parse(clock.soon);
    assert.equal(Math.round((soon - today) / 86400000), 30);
  });

  test("weekDays: 7 entries, ascending, oldest → today", () => {
    assert.equal(clock.weekDays.length, 7);
    const iso = clock.weekDays.map((d) => d.iso);
    for (const day of iso) assert.match(day, ISO);
    const sorted = [...iso].sort();
    assert.deepEqual(iso, sorted, "days must be strictly ascending");
    // Same captured instant inside one call → the last day IS today.
    assert.equal(iso[6], clock.today);
  });

  test("weekDays carry short weekday labels", () => {
    for (const d of clock.weekDays) {
      assert.ok(d.label.length >= 3 && d.label.length <= 4, d.label);
    }
  });
});

describe("weekMinutes", () => {
  const days = [
    { iso: "2026-09-20" },
    { iso: "2026-09-21" },
    { iso: "2026-09-22" },
    { iso: "2026-09-23" },
    { iso: "2026-09-24" },
    { iso: "2026-09-25" },
    { iso: "2026-09-26" },
  ];

  test("buckets entries onto their day and sums duplicates", () => {
    const out = weekMinutes(
      [
        { worked_on: "2026-09-21", duration_minutes: 30 },
        { worked_on: "2026-09-21", duration_minutes: 15 },
        { worked_on: "2026-09-26", duration_minutes: 240 },
      ],
      days
    );
    assert.deepEqual(out, [0, 45, 0, 0, 0, 0, 240]);
  });

  test("ignores entries outside the window and bad minutes", () => {
    const out = weekMinutes(
      [
        { worked_on: "2026-09-01", duration_minutes: 999 },
        { worked_on: "2026-09-20", duration_minutes: NaN },
        { worked_on: "2026-09-20", duration_minutes: -30 },
      ],
      days
    );
    assert.equal(out[0], -30, "sums as given — rendering scales, not the math");
    assert.equal(out.reduce((n, m) => n + m, 0), -30);
  });

  test("empty input → all zeros", () => {
    const out = weekMinutes([], days);
    assert.deepEqual(out, [0, 0, 0, 0, 0, 0, 0]);
  });
});
