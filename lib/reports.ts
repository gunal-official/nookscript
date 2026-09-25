/**
 * Pure report computation (Step 20). No I/O, no Supabase — the server
 * page fetches the four datasets and hands them in; everything here is
 * arithmetic over rows, so nothing is stored that can drift (house
 * rule). Kept server-agnostic (no "server-only") so it stays trivially
 * testable.
 *
 * Semantics (locked in the Step 20 spec):
 *  * Money: Draft / Outstanding (sent) / Collected (paid); void is
 *    excluded from all three (counted separately).
 *  * Time: fixed windows — Today / This month / All time — keyed on
 *    worked_on (the day the work happened), plus a per-brief breakdown
 *    for THIS MONTH (top 5 + a "General" row for unlinked entries).
 *    Per-brief is HOURS ONLY: invoices are deliberately not
 *    brief-linked (Step 17 D1), so per-brief money is impossible by
 *    design.
 *  * Contracts: counts by status plus two derived states —
 *    "expiring soon" (expires_on within the next 30 days) and
 *    "expired" (past) — both ignoring void contracts.
 */

import { localToday } from "./utils.ts";
import type { BriefSummary } from "@/lib/types/brief";
import type { InvoiceSummary } from "@/lib/types/invoice";
import type { TimeEntry } from "@/lib/types/time";
import type { ContractSummary } from "@/lib/types/contract";

export interface ReportInput {
  invoices: InvoiceSummary[];
  entries: TimeEntry[];
  contracts: ContractSummary[];
  briefs: BriefSummary[];
}

export interface BriefBar {
  /** null = general (no brief). */
  brief_id: string | null;
  title: string;
  minutes: number;
  entry_count: number;
}

export interface Report {
  money: {
    draft_cents: number;
    outstanding_cents: number; // sent
    collected_cents: number; // paid
    draft_count: number;
    sent_count: number;
    paid_count: number;
    void_count: number;
  };
  time: {
    today_minutes: number;
    month_minutes: number;
    all_minutes: number;
    /** This month, per brief — top 5 by minutes + the General row. */
    by_brief: BriefBar[];
  };
  contracts: {
    draft_count: number;
    sent_count: number;
    signed_count: number;
    void_count: number;
    /** expires_on within the next 30 days (not void, not already past). */
    expiring_soon_count: number;
    /** expires_on in the past (not void). */
    expired_count: number;
  };
}

function dateOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computeReport(input: ReportInput): Report {
  const { invoices, entries, contracts, briefs } = input;
  const today = localToday();
  const monthPrefix = today.slice(0, 7); // "YYYY-MM"

  // ── Money (void excluded from every bucket, counted separately) ──
  const money = {
    draft_cents: 0,
    outstanding_cents: 0,
    collected_cents: 0,
    draft_count: 0,
    sent_count: 0,
    paid_count: 0,
    void_count: 0,
  };
  for (const invoice of invoices) {
    if (invoice.status === "void") {
      money.void_count += 1;
      continue;
    }
    if (invoice.status === "draft") {
      money.draft_cents += invoice.total_cents;
      money.draft_count += 1;
    } else if (invoice.status === "sent") {
      money.outstanding_cents += invoice.total_cents;
      money.sent_count += 1;
    } else {
      // paid
      money.collected_cents += invoice.total_cents;
      money.paid_count += 1;
    }
  }

  // ── Time (keyed on worked_on, never created_at) ──
  let todayMinutes = 0;
  let monthMinutes = 0;
  let allMinutes = 0;
  const monthByBrief = new Map<
    string,
    { minutes: number; entry_count: number }
  >(); // key: brief_id or "general"

  for (const entry of entries) {
    allMinutes += entry.duration_minutes;
    if (entry.worked_on === today) todayMinutes += entry.duration_minutes;
    if (entry.worked_on.startsWith(monthPrefix)) {
      monthMinutes += entry.duration_minutes;
      const key = entry.brief_id ?? "general";
      const bucket = monthByBrief.get(key) ?? { minutes: 0, entry_count: 0 };
      bucket.minutes += entry.duration_minutes;
      bucket.entry_count += 1;
      monthByBrief.set(key, bucket);
    }
  }

  const briefTitle = (id: string | null): string =>
    id === null
      ? "General — no brief"
      : (briefs.find((b) => b.id === id)?.title ?? "Unknown brief");

  const bars: BriefBar[] = [];
  // Map#forEach (not for..of) — the project targets pre-es2015
  // iteration support (same convention as lib/rate-limit.ts).
  monthByBrief.forEach((bucket, key) => {
    if (bucket.minutes <= 0) return;
    bars.push({
      brief_id: key === "general" ? null : key,
      title: briefTitle(key === "general" ? null : key),
      minutes: bucket.minutes,
      entry_count: bucket.entry_count,
    });
  });
  bars.sort((a, b) => b.minutes - a.minutes);
  const top = bars.slice(0, 5);
  const general = bars.find((b) => b.brief_id === null);
  // Top 5 + the General row (even if it falls outside the top 5).
  const byBrief =
    general && !top.some((b) => b.brief_id === null)
      ? [...top, general]
      : top;

  // ── Contracts ──
  const c = {
    draft_count: 0,
    sent_count: 0,
    signed_count: 0,
    void_count: 0,
    expiring_soon_count: 0,
    expired_count: 0,
  };
  const in30Days = dateOffsetDays(30);
  for (const contract of contracts) {
    if (contract.status === "draft") c.draft_count += 1;
    else if (contract.status === "sent") c.sent_count += 1;
    else if (contract.status === "signed") c.signed_count += 1;
    else c.void_count += 1;

    if (contract.status === "void" || !contract.expires_on) continue;
    if (contract.expires_on < today) c.expired_count += 1;
    else if (contract.expires_on <= in30Days) c.expiring_soon_count += 1;
  }

  return {
    money,
    time: {
      today_minutes: todayMinutes,
      month_minutes: monthMinutes,
      all_minutes: allMinutes,
      by_brief: byBrief,
    },
    contracts: c,
  };
}
