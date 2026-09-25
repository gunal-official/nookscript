/**
 * Dashboard aggregation (Step 34(b)) — pure math over summary rows the
 * page already fetched, plus the wall-clock read isolated here in the data
 * layer so components stay pure per the React rules (react-hooks).
 */

export interface DashboardClock {
  /** Local date label for the page head ("Friday, 26 September 2026"). */
  todayLabel: string;
  /** Date-string cutoffs for derived windows (YYYY-MM-DD, UTC day). */
  today: string;
  soon: string;
  /** Last 7 days, oldest → today, for the week strip. */
  weekDays: { iso: string; label: string }[];
}

export function dashboardClock(): DashboardClock {
  const now = new Date();
  const dayMs = 86400000;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    todayLabel: now.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    today: iso(now),
    soon: iso(new Date(now.getTime() + 30 * dayMs)),
    weekDays: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - (6 - i) * dayMs);
      return {
        iso: iso(d),
        label: d.toLocaleDateString("en-GB", { weekday: "short" }),
      };
    }),
  };
}

/** Minutes per weekday (index 0 = oldest of the 7 days). */
export function weekMinutes(
  entries: readonly { worked_on: string; duration_minutes: number }[],
  weekDays: readonly { iso: string }[]
): number[] {
  return weekDays.map((day) =>
    entries
      .filter((e) => e.worked_on === day.iso)
      .reduce((n, e) => n + (e.duration_minutes || 0), 0)
  );
}
