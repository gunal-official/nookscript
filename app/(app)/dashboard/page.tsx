/**
 * / — the Pipeline dashboard (Step 34(b), the ui.webp hero): served at the
 * root URL for members via the proxy rewrite (lib/supabase/middleware.ts);
 * guests keep the marketing home. One screen over rows every list page
 * already fetches: pipeline flow with live counts, "needs you" alerts,
 * money + week-strip cards (money viewers), and a cross-module activity
 * timeline.
 *
 * HOW TO TEST (locally — Supabase configured per README.md, seed loaded):
 *   1. Log in and land on /: the shell sidebar's "Pipeline" is active and
 *      the stat row matches the seeded briefs/proposals/plans/updates.
 *   2. Pipeline flow counts deep-link into each list; the numbers match
 *      the lists' own tab counts.
 *   3. "Needs you" lists open questions / draft updates / expiring
 *      contracts / overdue invoices (owners & editors see money rows;
 *      viewers don't).
 *   4. Money card totals match /invoices; the week strip matches /time.
 *   5. Logged out, / is the marketing home again (no dashboard leak).
 */

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  ClipboardList,
  FileText,
  Hourglass,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  PenLine,
  Receipt,
  Timer,
  Wallet,
} from "lucide-react";

import { getBriefs } from "@/lib/data/briefs";
import { getContracts } from "@/lib/data/contracts";
import { dashboardClock, weekMinutes } from "@/lib/data/dashboard";
import { getInboxThreads } from "@/lib/data/inbox";
import { getInvoices } from "@/lib/data/invoices";
import { getPlans } from "@/lib/data/plans";
import { getProposals } from "@/lib/data/proposals";
import { getTimeEntries } from "@/lib/data/time";
import { getUpdates } from "@/lib/data/updates";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { formatDuration, formatMoney, timeAgo } from "@/lib/utils";
import {
  ActivityTimeline,
  ListStats,
  StackedBar,
  StatTile,
  type TimelineEvent,
} from "@/components/ui/doc-detail";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FLOW_STAGES = [
  { label: "Intake", href: "/intake/inbox", icon: Inbox },
  { label: "Briefs", href: "/briefs", icon: ClipboardList },
  { label: "Proposals", href: "/proposals", icon: FileText },
  { label: "Plans", href: "/plans", icon: ListChecks },
  { label: "Updates", href: "/updates", icon: MessageSquare },
] as const;

function RailCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="animate-rise-in">
      <CardHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-border px-5 py-3.5">
        <span className="icon-chip icon-chip-muted h-8 w-8">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5 p-5">{children}</CardContent>
    </Card>
  );
}

function AttentionRow({
  icon: Icon,
  text,
  href,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  href: string;
  tone: "accent" | "error" | "muted";
}) {
  const chipTone =
    tone === "accent"
      ? "icon-chip-accent"
      : tone === "error"
        ? "icon-chip"
        : "icon-chip-muted";
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-muted/60"
    >
      <span className={`icon-chip h-8 w-8 shrink-0 ${chipTone}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-sm">{text}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export default async function DashboardPage() {
  const context = await getWorkspaceContext();
  const clock = dashboardClock();

  const [briefs, proposals, plans, updates, contracts, threads] = context
    ? await Promise.all([
        getBriefs(context.id),
        getProposals(context.id),
        getPlans(context.id),
        getUpdates(context.id),
        getContracts(context.id),
        getInboxThreads(),
      ])
    : [[], [], [], [], [], null];

  const canSeeMoney = context?.canSeeMoney ?? false;
  const [invoices, timeEntries] =
    canSeeMoney && context
      ? await Promise.all([getInvoices(context.id), getTimeEntries(context.id)])
      : [[], []];

  // ── Pipeline counts ──
  const briefsInReview = briefs.filter((b) => b.status === "in_review").length;
  const openQuestions = briefs.reduce((n, b) => n + b.openQuestionCount, 0);
  const proposalsInPlay = proposals.filter(
    (p) => p.status === "draft" || p.status === "sent"
  ).length;
  const plansMoving = plans.filter((p) => p.status === "in_progress").length;
  const updatesDrafts = updates.filter((u) => u.status === "draft").length;
  const flowCounts = [
    (threads ?? []).length,
    briefs.length,
    proposals.length,
    plans.length,
    updates.length,
  ];

  // ── Proposal dispositions (the business chart) ──
  const propInPlay = proposalsInPlay;
  const propAccepted = proposals.filter((p) => p.status === "accepted").length;
  const propDeclined = proposals.filter((p) => p.status === "declined").length;

  // ── Needs you (derived windows from the data-layer clock) ──
  const expiring = contracts.filter(
    (c) =>
      c.expires_on &&
      c.status !== "signed" &&
      c.status !== "void" &&
      c.expires_on >= clock.today &&
      c.expires_on <= clock.soon
  ).length;
  const overdue = invoices.filter(
    (i) => i.status === "sent" && i.due_date && i.due_date < clock.today
  ).length;
  type Attention = {
    icon: typeof Clock;
    text: string;
    href: string;
    tone: "accent" | "error" | "muted";
  };
  const attention = [
    openQuestions > 0 && {
      icon: Bell,
      text: `${openQuestions} open question${openQuestions === 1 ? "" : "s"} across ${briefs.filter((b) => b.openQuestionCount > 0).length} brief${briefs.filter((b) => b.openQuestionCount > 0).length === 1 ? "" : "s"}`,
      href: "/briefs",
      tone: "accent",
    },
    updatesDrafts > 0 && {
      icon: MessageSquare,
      text: `${updatesDrafts} update draft${updatesDrafts === 1 ? "" : "s"} not sent yet`,
      href: "/updates",
      tone: "muted",
    },
    expiring > 0 && {
      icon: Hourglass,
      text: `${expiring} contract offer${expiring === 1 ? "" : "s"} expiring within 30 days`,
      href: "/contracts",
      tone: "error",
    },
    canSeeMoney &&
      overdue > 0 && {
        icon: Clock,
        text: `${overdue} invoice${overdue === 1 ? "" : "s"} past the due date`,
        href: "/invoices",
        tone: "error",
      },
  ].filter(Boolean) as Attention[];

  // ── Money + week strip ──
  const outstandingCents = invoices
    .filter((i) => i.status === "sent")
    .reduce((n, i) => n + i.total_cents, 0);
  const paidCents = invoices
    .filter((i) => i.status === "paid")
    .reduce((n, i) => n + i.total_cents, 0);
  const minutes = weekMinutes(timeEntries, clock.weekDays);
  const weekTotal = minutes.reduce((n, m) => n + m, 0);
  const maxMinutes = Math.max(...minutes, 60);

  // ── Recent activity across every module ──
  const events: TimelineEvent[] = [
    ...briefs.map((b) => ({
      icon: ClipboardList,
      title: b.title,
      detail: b.client_name ?? "Brief updated",
      at: timeAgo(b.updated_at),
      tone: "muted" as const,
    })),
    ...proposals.map((p) => ({
      icon: FileText,
      title: p.title,
      detail: p.client_name ?? "Proposal updated",
      at: timeAgo(p.updated_at),
      tone: "muted" as const,
    })),
    ...plans.map((p) => ({
      icon: ListChecks,
      title: p.title,
      detail: p.client_name ?? "Plan updated",
      at: timeAgo(p.updated_at),
      tone: "muted" as const,
    })),
    ...updates.map((u) => ({
      icon: MessageSquare,
      title: u.title,
      detail: u.status === "sent" ? "Update sent" : "Update draft",
      at: timeAgo(u.updated_at),
      tone: u.status === "sent" ? ("success" as const) : ("muted" as const),
    })),
  ].slice(0, 7);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-chip icon-chip-accent h-10 w-10 shrink-0">
            <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Pipeline
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {context ? `${context.name} · ` : ""}
              {clock.todayLabel}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/intake" className="inline-flex min-h-11 min-w-11 items-center">
            <PenLine className="h-4 w-4" aria-hidden="true" />
            New brief
          </Link>
        </Button>
      </div>

      {/* Stat row */}
      <ListStats
        cols={4}
        bar={
          proposals.length > 0 ? (
            <StackedBar
              segments={[
                { label: "In play", weight: propInPlay, className: "bg-accent" },
                { label: "Accepted", weight: propAccepted, className: "bg-success" },
                { label: "Declined", weight: propDeclined, className: "bg-error/60" },
              ]}
            />
          ) : undefined
        }
      >
        <StatTile
          icon={ClipboardList}
          label="Briefs"
          value={briefs.length}
          hint={`${briefsInReview} in review · ${openQuestions} open question${openQuestions === 1 ? "" : "s"}`}
          tone={openQuestions > 0 ? "accent" : "muted"}
        />
        <StatTile
          icon={FileText}
          label="Proposals in play"
          value={proposalsInPlay}
          hint={`${propAccepted} accepted`}
          tone={proposalsInPlay > 0 ? "accent" : "muted"}
          delay={40}
        />
        <StatTile
          icon={Timer}
          label="Plans moving"
          value={plansMoving}
          hint={`${plans.length} total plan${plans.length === 1 ? "" : "s"}`}
          tone={plansMoving > 0 ? "accent" : "muted"}
          delay={80}
        />
        {canSeeMoney ? (
          <StatTile
            icon={Wallet}
            label="Outstanding"
            value={formatMoney(outstandingCents)}
            hint={`${formatMoney(paidCents)} paid to date`}
            tone={outstandingCents > 0 ? "accent" : "muted"}
            delay={120}
          />
        ) : (
          <StatTile
            icon={MessageSquare}
            label="Update drafts"
            value={updatesDrafts}
            hint="Not sent yet"
            tone={updatesDrafts > 0 ? "accent" : "muted"}
            delay={120}
          />
        )}
      </ListStats>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* ── Left: flow + attention ── */}
        <div className="space-y-6">
          <Card className="animate-rise-in">
            <CardHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-border px-5 py-3.5">
              <span className="icon-chip icon-chip-accent h-8 w-8">
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
              <CardTitle className="text-base">How the work flows</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-stretch gap-2">
                {FLOW_STAGES.map((stage, i) => (
                  <div key={stage.href} className="flex items-center gap-2">
                    <Link
                      href={stage.href}
                      className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm transition-colors hover:border-accent hover:text-accent"
                    >
                      <span className="icon-chip icon-chip-muted h-7 w-7">
                        <stage.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      {stage.label}
                      <span className="font-display font-bold">{flowCounts[i]}</span>
                    </Link>
                    {i < FLOW_STAGES.length - 1 && (
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground max-sm:hidden" aria-hidden="true" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="animate-rise-in" style={{ animationDelay: "40ms" }}>
            <CardHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-border px-5 py-3.5">
              <span className="icon-chip icon-chip-accent h-8 w-8">
                <Bell className="h-4 w-4" aria-hidden="true" />
              </span>
              <CardTitle className="text-base">Needs you</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {attention.length === 0 ? (
                <p className="flex min-h-11 items-center gap-2 px-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  Nothing pressing — everything is moving on schedule.
                </p>
              ) : (
                attention.map((row) => (
                  <AttentionRow
                    key={row.text}
                    icon={row.icon}
                    text={row.text}
                    href={row.href}
                    tone={row.tone}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: money + week + activity ── */}
        <div className="space-y-4">
          {canSeeMoney && (
            <>
              <RailCard icon={Receipt} title="Money">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display text-2xl font-bold">
                    {formatMoney(outstandingCents)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    outstanding
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CircleDollarSign className="h-4 w-4 text-success" aria-hidden="true" />
                  {formatMoney(paidCents)} paid
                  {overdue > 0 && (
                    <span className="ml-auto rounded-full bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
                      {overdue} overdue
                    </span>
                  )}
                </div>
                <Link
                  href="/invoices"
                  className="inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
                >
                  Open invoices
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </RailCard>

              <RailCard icon={Clock} title="This week">
                <div className="flex h-16 items-end gap-1.5" role="img" aria-label={`Time this week: ${formatDuration(weekTotal)} total`}>
                  {minutes.map((m, i) => (
                    <div key={clock.weekDays[i].iso} className="flex h-full flex-1 flex-col justify-end">
                      <div
                        className="w-full rounded-t bg-accent"
                        style={{ height: `${Math.round((m / maxMinutes) * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  {clock.weekDays.map((d) => (
                    <span key={d.iso} className="flex-1 text-center text-[11px] text-muted-foreground">
                      {d.label}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  <Timer className="mr-1 inline h-4 w-4" aria-hidden="true" />
                  {formatDuration(weekTotal)} logged
                </p>
              </RailCard>
            </>
          )}

          <RailCard icon={BookOpen} title="Recent activity">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet — start with a client brief.
              </p>
            ) : (
              <ActivityTimeline events={events} />
            )}
          </RailCard>
        </div>
      </div>
    </div>
  );
}
