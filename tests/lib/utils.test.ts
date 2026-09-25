/**
 * Unit tests for lib/utils.ts — the shared formatting/guard layer used on
 * every surface. Built-in node:test only. Assertions lock the documented
 * contracts of each helper's doc comment.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  cn,
  formatDate,
  formatDuration,
  formatMoney,
  getInitials,
  invoiceNumberLabel,
  isUuid,
  localToday,
  timeAgo,
} from "../../lib/utils.ts";

describe("cn", () => {
  test("merges tailwind conflicts (last wins) and skips falsy", () => {
    assert.equal(cn("p-2", "p-4"), "p-4");
    assert.equal(cn("text-sm", undefined, null, false, "font-medium"), "text-sm font-medium");
  });
});

describe("getInitials", () => {
  test("documented shapes", () => {
    assert.equal(getInitials("Ada Lovelace"), "AL");
    assert.equal(getInitials("ada"), "A");
    assert.equal(getInitials("ada@x.com"), "A");
    assert.equal(getInitials(null), "U");
    assert.equal(getInitials("   "), "U");
    assert.equal(getInitials("Grace Brewster Murray"), "GM");
  });
});

describe("formatDate / timeAgo", () => {
  test("formatDate renders \"Sep 18, 2026\"; empty → em dash", () => {
    assert.equal(formatDate("2026-09-18"), "Sep 18, 2026");
    assert.equal(formatDate(null), "—");
  });

  test("timeAgo bands: just now / Nh ago / Nd ago / date", () => {
    const now = Date.now();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
    assert.equal(timeAgo(null), "—");
    assert.equal(timeAgo(iso(30_000)), "just now");
    assert.equal(timeAgo(iso(3 * 3600_000)), "3h ago");
    assert.equal(timeAgo(iso(5 * 86400_000)), "5d ago");
    const old = timeAgo(iso(40 * 86400_000));
    assert.ok(!old.includes("ago"), "30d+ falls back to the date");
    assert.match(old, /[A-Z][a-z]{2} \d{1,2}, \d{4}/);
  });
});

describe("isUuid (the redirect guard)", () => {
  test("accepts canonical uuid, rejects near-misses", () => {
    assert.ok(isUuid("123e4567-e89b-42d3-a456-426614174000"));
    assert.ok(isUuid("123E4567-E89B-42D3-A456-426614174000"), "case-insensitive");
    assert.ok(!isUuid("123e4567e89b42d3a456426614174000"));
    assert.ok(!isUuid("'; DROP TABLE profiles;--"));
    assert.ok(!isUuid(""));
    assert.ok(!isUuid("123e4567-e89b-42d3-a456-426614174000-extra"));
  });
});

describe("money + labels", () => {
  test("formatMoney: 123456 → $1,234.56 (USD pinned, Step 17)", () => {
    assert.equal(formatMoney(123456), "$1,234.56");
    assert.equal(formatMoney(0), "$0.00");
    assert.equal(formatMoney(5), "$0.05");
  });

  test("invoiceNumberLabel zero-pads to 4", () => {
    assert.equal(invoiceNumberLabel(1), "INV-0001");
    assert.equal(invoiceNumberLabel(42), "INV-0042");
    assert.equal(invoiceNumberLabel(12345), "INV-12345");
  });
});

describe("formatDuration / localToday", () => {
  test("documented minute shapes", () => {
    assert.equal(formatDuration(95), "1h 35m");
    assert.equal(formatDuration(45), "45m");
    assert.equal(formatDuration(120), "2h");
    assert.equal(formatDuration(0), "0m");
    assert.equal(formatDuration(60), "1h");
  });

  test("localToday is a zero-padded local YYYY-MM-DD", () => {
    assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/);
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    assert.equal(localToday(), expected);
  });
});
