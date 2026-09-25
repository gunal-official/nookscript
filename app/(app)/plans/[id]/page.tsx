/**
 * /plans/:id — the delivery plan document (Step 34(b)): the plan rendered
 * as a paper document whose body IS the interactive task checklist, stat
 * tiles (tasks / status / source proposal), a "send an update" CTA card,
 * markdown export, and an activity timeline.
 *
 * HOW TO TEST (locally — Supabase configured per README.md, ⚠ apply the
 * new plans migration + seed first):
 *   1. From /plans open the seeded "Brightloop Co." plan.
 *   2. Click a task checkbox: it flips immediately (optimistic), persists
 *      via toggleTask, and the "N of M done" counter + tiles + /plans card
 *      badge stay in sync.
 *   3. Status dropdown (Not started → In progress → Done): plans.status
 *      updates; list badge matches after navigating back.
 *   4. "Compose update" creates a draft client update from this plan.
 *   5. "Export as markdown" downloads <title>.md built in the browser.
 *   6. "View source proposal" links to /proposals/<id>; bogus or foreign
 *      ids render the "not found" state (RLS hides them identically).
 */

import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  FilePlus2,
  Flag,
  ListChecks,
  Send,
} from "lucide-react";

import { getPlanById } from "@/lib/data/plans";
import { formatDate, isUuid, timeAgo } from "@/lib/utils";
import { ComposeUpdateButton } from "@/components/plans/ComposeUpdateButton";
import { CanEdit } from "@/components/app-shell/CanEdit";
import { ExportMarkdownButton } from "@/components/plans/ExportMarkdownButton";
import { PlanStatusBadge } from "@/components/plans/PlanStatusBadge";
import { PlanStatusSelect } from "@/components/plans/PlanStatusSelect";
import { TaskChecklist } from "@/components/plans/TaskChecklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActivityTimeline,
  DocHeader,
  PaperCard,
  StatTile,
  type TimelineEvent,
} from "@/components/ui/doc-detail";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right">{children}</span>
    </div>
  );
}

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

function NotFoundState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Badge variant="secondary">Not found</Badge>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Plan not found
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This plan doesn’t exist — or it belongs to a workspace you’re not
          a member of.
        </p>
      </div>
      <Button asChild variant="secondary">
        <Link href="/plans" className="inline-flex min-h-11 min-w-11 items-center">Back to plans</Link>
      </Button>
    </div>
  );
}

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) {
    return <NotFoundState />;
  }

  const plan = await getPlanById(id);
  if (!plan) {
    return <NotFoundState />;
  }

  const doneCount = plan.tasks.filter((t) => t.checked).length;

  const events: TimelineEvent[] = [
    {
      icon: FilePlus2,
      title: "Created",
      detail: plan.proposal ? `From “${plan.proposal.title}”` : undefined,
      at: formatDate(plan.created_at),
      tone: "accent",
    },
    ...(plan.status === "done"
      ? [
          {
            icon: CheckCircle2,
            title: "All tasks done",
            detail: `${doneCount} of ${plan.tasks.length} completed`,
            at: formatDate(plan.updated_at),
            tone: "success",
          } as TimelineEvent,
        ]
      : []),
    {
      icon: Clock,
      title: "Last updated",
      at: timeAgo(plan.updated_at),
      tone: "muted",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/plans"
        className="mb-3 inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Plans
      </Link>

      <DocHeader
        icon={ClipboardList}
        title={plan.title}
        badges={<PlanStatusBadge status={plan.status} />}
        subtitle={plan.client_name ?? undefined}
      />

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          icon={ListChecks}
          label="Tasks"
          value={`${doneCount} of ${plan.tasks.length} done`}
          hint={
            plan.tasks.length > 0
              ? "Toggles save automatically"
              : "No tasks yet"
          }
          tone={doneCount > 0 ? "accent" : "muted"}
        />
        <StatTile
          icon={Flag}
          label="Status"
          value={<PlanStatusBadge status={plan.status} />}
          hint="Moves as the work does"
          tone={plan.status === "done" ? "success" : "muted"}
        />
        <StatTile
          icon={BookOpen}
          label="Source proposal"
          value={plan.proposal ? plan.proposal.title : "—"}
          hint={plan.proposal ? "View the proposal it came from" : "Standalone plan"}
          href={plan.proposal ? `/proposals/${plan.proposal.id}` : undefined}
          delay={80}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* ── Left: the plan document (checklist body) ── */}
        <PaperCard
          letterLabel="Delivery plan"
          letterhead={plan.client_name ?? "Delivery plan"}
          meta={formatDate(plan.created_at)}
        >
          <div className="space-y-6">
            <div className="space-y-1.5">
              <FieldLabel>Budget & timeline</FieldLabel>
              {plan.budget_timeline ? (
                <p className="text-[15px] leading-relaxed">
                  {plan.budget_timeline}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No budget or dates captured.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FieldLabel>Tasks</FieldLabel>
                <span className="text-xs text-muted-foreground">
                  {doneCount} of {plan.tasks.length} done
                </span>
              </div>
              <CanEdit
                fallback={<TaskChecklist planId={plan.id} tasks={plan.tasks} readOnly />}
              >
                <TaskChecklist planId={plan.id} tasks={plan.tasks} />
              </CanEdit>
            </div>
          </div>
        </PaperCard>

        {/* ── Right: action + metadata rail ── */}
        <div className="space-y-4">
          <Card className="animate-rise-in" style={{ animationDelay: "40ms" }}>
            <CardHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-border px-5 py-3.5">
              <span className="icon-chip icon-chip-accent h-8 w-8">
                <Send className="h-4 w-4" aria-hidden="true" />
              </span>
              <CardTitle className="text-base">Client update</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-muted-foreground">
                Keep {plan.client_name ?? "the client"} in the loop — draft
                this week’s update from the plan.
              </p>
              <CanEdit>
                <ComposeUpdateButton planId={plan.id} />
              </CanEdit>
            </CardContent>
          </Card>

          <RailCard icon={ClipboardList} title="Details">
            <MetaRow label="Status">
              <CanEdit fallback={<PlanStatusBadge status={plan.status} />}>
                <PlanStatusSelect planId={plan.id} status={plan.status} />
              </CanEdit>
            </MetaRow>
            {plan.client_name && (
              <MetaRow label="Client">{plan.client_name}</MetaRow>
            )}
            <MetaRow label="Created">{formatDate(plan.created_at)}</MetaRow>
            <MetaRow label="Updated">{timeAgo(plan.updated_at)}</MetaRow>
            <div className="border-t border-border pt-3.5">
              <ExportMarkdownButton
                title={plan.title}
                clientName={plan.client_name}
                budgetTimeline={plan.budget_timeline}
                tasks={plan.tasks}
              />
            </div>
          </RailCard>

          {plan.proposal && (
            <RailCard icon={BookOpen} title="Source">
              <p className="text-sm">{plan.proposal.title}</p>
              <Link
                href={`/proposals/${plan.proposal.id}`}
                className="inline-flex min-h-11 min-w-11 items-center group gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
              >
                View source proposal
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </RailCard>
          )}

          <RailCard icon={Clock} title="Activity">
            <ActivityTimeline events={events} />
          </RailCard>
        </div>
      </div>
    </div>
  );
}
