/**
 * /plans/:id — plan detail: status flow, interactive task checklist,
 * client-side markdown export, and a link back to the source proposal.
 *
 * HOW TO TEST (locally — Supabase configured per README.md, ⚠ apply the
 * new plans migration + seed first):
 *   1. From /plans open the seeded "Brightloop Co." plan.
 *   2. Click a task checkbox: it flips immediately (optimistic), persists
 *      via toggleTask, and the "N of M done" counter + /plans card badge
 *      stay in sync.
 *   3. Status dropdown (Not started → In progress → Done): plans.status
 *      updates; list badge matches after navigating back.
 *   4. "Export as markdown" downloads <title>.md built in the browser.
 *   5. "View source proposal" links to /proposals/<id>; bogus or foreign
 *      ids render the "not found" state (RLS hides them identically).
 */

import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { getPlanById } from "@/lib/data/plans";
import { formatDate, isUuid, timeAgo } from "@/lib/utils";
import { ExportMarkdownButton } from "@/components/plans/ExportMarkdownButton";
import { PlanStatusBadge } from "@/components/plans/PlanStatusBadge";
import { PlanStatusSelect } from "@/components/plans/PlanStatusSelect";
import { TaskChecklist } from "@/components/plans/TaskChecklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <span className="text-right">{children}</span>
    </div>
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
        <Link href="/plans">Back to plans</Link>
      </Button>
    </div>
  );
}

export default async function PlanDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isUuid(params.id)) {
    return <NotFoundState />;
  }

  const plan = await getPlanById(params.id);
  if (!plan) {
    return <NotFoundState />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/plans"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Plans
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {plan.title}
          </h1>
          <PlanStatusBadge status={plan.status} />
        </div>
        {plan.client_name && (
          <p className="mt-1 text-sm text-muted-foreground">
            {plan.client_name}
          </p>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* ── Left: plan details + task checklist ── */}
        <Card>
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <CardTitle className="text-base">Task plan</CardTitle>
            <CardDescription>
              Tasks save automatically when you toggle them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <div className="space-y-1.5">
              <FieldLabel>Budget & timeline</FieldLabel>
              {plan.budget_timeline ? (
                <p className="text-sm leading-relaxed">
                  {plan.budget_timeline}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No budget or dates captured.
                </p>
              )}
            </div>

            <TaskChecklist planId={plan.id} tasks={plan.tasks} />
          </CardContent>
        </Card>

        {/* ── Right: metadata / actions ── */}
        <Card>
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5 p-5">
            <MetaRow label="Status">
              <PlanStatusSelect planId={plan.id} status={plan.status} />
            </MetaRow>
            {plan.client_name && (
              <MetaRow label="Client">{plan.client_name}</MetaRow>
            )}
            <MetaRow label="Created">{formatDate(plan.created_at)}</MetaRow>
            <MetaRow label="Updated">{timeAgo(plan.updated_at)}</MetaRow>
            {plan.proposal && (
              <div className="border-t border-border pt-3.5">
                <Link
                  href={`/proposals/${plan.proposal.id}`}
                  className="group inline-flex items-center gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
                >
                  View source proposal
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {plan.proposal.title}
                </p>
              </div>
            )}
            <div className="border-t border-border pt-4">
              <ExportMarkdownButton
                title={plan.title}
                clientName={plan.client_name}
                budgetTimeline={plan.budget_timeline}
                tasks={plan.tasks}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
