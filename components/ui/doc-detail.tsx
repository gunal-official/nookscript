/**
 * Shared "document detail" vocabulary (Step 34(b)) — the detail pages for
 * proposals, engagement letters, invoices, plans and updates all speak this
 * language: an icon-chip page head, a stat-tile row, a paper document card
 * with a letterhead strip, and an activity timeline rail.
 *
 * Pure presentational (no hooks) so server pages can compose these directly.
 * Icons follow the Step-33 system: lucide at 16/20px, single stroke
 * (lucide default), currentColor, decorative icons aria-hidden.
 */

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/* ── Page head: icon chip + display title + status badges + actions ── */

export function DocHeader({
  icon: Icon,
  title,
  subtitle,
  badges,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="icon-chip icon-chip-accent h-10 w-10 shrink-0">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              {title}
            </h1>
            {badges}
          </div>
          {subtitle && (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Stat tiles: the ui.webp "stat card" row ── */

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "muted",
  href,
  children,
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "accent" | "success" | "muted" | "error";
  /** Whole tile becomes a 44px+ link target when set. */
  href?: string;
  children?: React.ReactNode;
  delay?: number;
}) {
  const chipTone =
    tone === "accent"
      ? "icon-chip-accent"
      : tone === "success"
        ? "icon-chip-success"
        : tone === "error"
          ? "icon-chip"
          : "icon-chip-muted";
  const valueTone =
    tone === "accent"
      ? "text-accent"
      : tone === "success"
        ? "text-success"
        : tone === "error"
          ? "text-error"
          : "text-text";

  const body = (
    <>
      <span className={cn("icon-chip h-8 w-8 shrink-0", chipTone)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "mt-0.5 block truncate font-display text-lg font-bold",
            valueTone
          )}
        >
          {value}
        </span>
        {hint && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {hint}
          </span>
        )}
        {children}
      </span>
    </>
  );

  const cls =
    "flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-card animate-rise-in";

  return (
    <div style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {" "}
      {href ? (
        <Link href={href} className={cn(cls, "min-h-11 transition-shadow hover:shadow-md")}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </div>
  );
}

/* ── Paper document card with a letterhead strip ── */

export function PaperCard({
  letterLabel,
  letterhead,
  meta,
  children,
  footer,
}: {
  /** Right-hand letterhead label, e.g. "ENGAGEMENT LETTER". */
  letterLabel: string;
  /** Left-hand letterhead identity, e.g. the workspace name. */
  letterhead?: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card animate-rise-in">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-6 py-3">
        <span className="font-display text-sm font-bold tracking-tight">
          {letterhead}
        </span>
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {meta && <span>{meta}</span>}
          <span className="rounded-full border border-border bg-card px-2.5 py-0.5">
            {letterLabel}
          </span>
        </span>
      </div>
      <div className="p-6 sm:p-8">{children}</div>
      {footer && (
        <div className="border-t border-border bg-muted/30 px-6 py-5 sm:px-8">
          {footer}
        </div>
      )}
    </div>
  );
}

/* ── Activity timeline rail ── */

export type TimelineEvent = {
  icon: LucideIcon;
  title: string;
  detail?: React.ReactNode;
  at: string;
  tone?: "accent" | "success" | "muted" | "error";
};

export function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ul className="relative space-y-5 pl-0 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
      {events.map((e, i) => {
        const chipTone =
          e.tone === "accent"
            ? "icon-chip-accent"
            : e.tone === "success"
              ? "icon-chip-success"
              : e.tone === "error"
                ? "icon-chip"
                : "icon-chip-muted";
        return (
          <li key={i} className="relative flex items-start gap-3">
            <span
              className={cn(
                "icon-chip relative z-10 h-8 w-8 shrink-0 ring-4 ring-card",
                chipTone
              )}
            >
              <e.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-sm font-medium">{e.title}</span>
              {e.detail && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {e.detail}
                </span>
              )}
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {e.at}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── List stats: stat-card rows + distribution bars for the list pages ── */

export function ListStats({
  cols = 3,
  bar,
  children,
}: {
  cols?: 3 | 4;
  /** Optional chart card under the tiles (e.g. a StackedBar breakdown). */
  bar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 animate-rise-in">
      <div
        className={
          cols === 4
            ? "grid grid-cols-2 gap-4 lg:grid-cols-4"
            : "grid grid-cols-1 gap-4 sm:grid-cols-3"
        }
      >
        {children}
      </div>
      {bar && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4 shadow-card">
          {bar}
        </div>
      )}
    </div>
  );
}

/** Distribution bar (chart vocabulary, no dependency): proportional
 *  segments with a text legend. The bar itself carries no text (audit). */
export function StackedBar({
  segments,
}: {
  segments: {
    label: string;
    /** Numeric weight for the segment's width. */
    weight: number;
    /** Legend display (e.g. formatted money); defaults to `weight`. */
    display?: React.ReactNode;
    className: string;
  }[];
}) {
  const total = segments.reduce((n, s) => n + Math.max(0, s.weight), 0);
  if (!total) return null;
  return (
    <div>
      <div
        role="img"
        aria-label={segments
          .map((s) => `${s.label}: ${s.display ?? s.weight}`)
          .join(", ")}
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        {segments.map(
          (s) =>
            s.weight > 0 && (
              <div
                key={s.label}
                className={cn("h-full", s.className)}
                style={{ width: `${(Math.max(0, s.weight) / total) * 100}%` }}
              />
            )
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span
            key={s.label}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className={cn("h-2 w-2 rounded-full", s.className)}
              aria-hidden="true"
            />
            {s.label}{" "}
            <span className="font-medium text-text">{s.display ?? s.weight}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
