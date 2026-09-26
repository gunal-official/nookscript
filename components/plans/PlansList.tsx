"use client";

/**
 * Client side of /plans — status filter tabs + search over the list the
 * server page fetched. Mirrors components/proposals/ProposalsList.tsx
 * (Step 7); plans originate from proposals, so the empty state points to
 * /proposals rather than offering an inline create.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListTodo, Search, Timer, CheckCircle2, ListChecks } from "lucide-react";

import { PlanStatusBadge } from "@/components/plans/PlanStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { timeAgo } from "@/lib/utils";
import { ListStats, StatTile, StackedBar } from "@/components/ui/doc-detail";
import type { PlanStatus, PlanSummary } from "@/lib/types/plan";

type StatusFilter = "all" | PlanStatus;

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

function EmptyState({
  hasPlans,
  onClearFilters,
}: {
  hasPlans: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16 text-center">
      <span className="icon-chip icon-chip-accent">
        <ListTodo className="h-5 w-5" />
      </span>
      {hasPlans ? (
        <>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              No matching plans
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search or status filter.
            </p>
          </div>
          <Button variant="secondary" onClick={onClearFilters}>
            Clear filters
          </Button>
        </>
      ) : (
        <>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              No plans yet
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Plans are generated from proposals — open a proposal and click
              “Generate plan” to turn its deliverables into a task list.
            </p>
          </div>
          <Button asChild>
            <Link href="/proposals" className="inline-flex min-h-11 min-w-11 items-center">Open proposals</Link>
          </Button>
        </>
      )}
    </div>
  );
}

function PlanCard({ plan }: { plan: PlanSummary }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/plans/${plan.id}`}
              className="inline-flex min-h-11 min-w-11 items-center font-display text-base font-semibold leading-snug underline-offset-2 hover:underline"
            >
              {plan.title}
            </Link>
            {plan.client_name && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {plan.client_name}
              </p>
            )}
          </div>
          <PlanStatusBadge status={plan.status} className="shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 p-5">
        {plan.tasksTotal > 0 ? (
          <Badge variant="secondary">
            {plan.tasksDone}/{plan.tasksTotal} task
            {plan.tasksTotal === 1 ? "" : "s"} done
          </Badge>
        ) : (
          <span />
        )}
        <span className="text-xs text-muted-foreground">
          Updated {timeAgo(plan.updated_at)}
        </span>
      </CardContent>
    </Card>
  );
}

export function PlansList({ plans }: { plans: PlanSummary[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: plans.length,
      not_started: 0,
      in_progress: 0,
      done: 0,
    };
    for (const plan of plans) counts[plan.status] += 1;
    return counts;
  }, [plans]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((plan) => {
      if (statusFilter !== "all" && plan.status !== statusFilter) return false;
      if (!q) return true;
      return (
        plan.title.toLowerCase().includes(q) ||
        (plan.client_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [plans, statusFilter, query]);

  const inProgress = plans.filter((p) => p.status === "in_progress").length;
  const donePlans = plans.filter((p) => p.status === "done").length;
  const tasksDone = plans.reduce((n, p) => n + p.tasksDone, 0);
  const tasksTotal = plans.reduce((n, p) => n + p.tasksTotal, 0);

  return (
    <div>
      <ListStats cols={4}>
        <StatTile icon={ListTodo} label="Total plans" value={plans.length} hint="All time" />
        <StatTile
          icon={Timer}
          label="In progress"
          value={inProgress}
          hint="Actively moving"
          tone={inProgress > 0 ? "accent" : "muted"}
          delay={40}
        />
        <StatTile
          icon={CheckCircle2}
          label="Delivered"
          value={donePlans}
          hint="Plans done"
          tone={donePlans > 0 ? "success" : "muted"}
          delay={80}
        />
        <StatTile
          icon={ListChecks}
          label="Tasks done"
          value={`${tasksDone}/${tasksTotal}`}
          hint="Across all plans"
          delay={120}
        />
      </ListStats>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <TabsList>
            {FILTER_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {statusCounts[tab.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"  aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or client…"
            className="pl-8"
            aria-label="Search plans"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          hasPlans={plans.length > 0}
          onClearFilters={() => {
            setStatusFilter("all");
            setQuery("");
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
