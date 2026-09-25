/**
 * /proposals/:id — proposal detail (Step 34(b) document treatment): the
 * generated proposal rendered as a paper document with a letterhead strip,
 * stat tiles (deliverables / budget / source), a "next step" CTA card that
 * turns the proposal into a delivery plan, and an activity timeline.
 *
 * HOW TO TEST (locally — Supabase configured per README.md, seed loaded):
 *   1. From /proposals open the seeded "Brightloop Co." proposal.
 *   2. Status dropdown (Draft → Sent → Accepted / Declined): proposals.status
 *      updates; back on /proposals the card badge matches.
 *   3. "Source" card links to /briefs/<id> of the brief it was generated
 *      from; on that brief page, "Generate proposal" creates another draft
 *      and redirects here.
 *   4. "Generate delivery plan" (editors only) creates the plan and
 *      redirects to /plans/<id>.
 *   5. Bogus or foreign-workspace ids render the "not found" state (RLS
 *      hides them identically — no cross-tenant leakage).
 */

import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock,
  FilePlus2,
  FileText,
  ListChecks,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";

import { getProposalById } from "@/lib/data/proposals";
import { formatDate, isUuid, timeAgo } from "@/lib/utils";
import { GeneratePlanButton } from "@/components/proposals/GeneratePlanButton";
import { CanEdit } from "@/components/app-shell/CanEdit";
import { ProposalStatusBadge } from "@/components/proposals/ProposalStatusBadge";
import { ProposalStatusSelect } from "@/components/proposals/ProposalStatusSelect";
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
      <span className="text-right">{children}</span>
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
          Proposal not found
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This proposal doesn’t exist — or it belongs to a workspace you’re
          not a member of.
        </p>
      </div>
      <Button asChild variant="secondary">
        <Link href="/proposals" className="inline-flex min-h-11 min-w-11 items-center">Back to proposals</Link>
      </Button>
    </div>
  );
}

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) {
    return <NotFoundState />;
  }

  const proposal = await getProposalById(id);
  if (!proposal) {
    return <NotFoundState />;
  }

  const doneCount = proposal.deliverables.filter((d) => d.checked).length;
  const budgetCaptured = !!proposal.budget_timeline?.trim();
  const decided =
    proposal.status === "accepted" ? "accepted" : proposal.status === "declined" ? "declined" : null;

  const events: TimelineEvent[] = [
    {
      icon: FilePlus2,
      title: "Generated from brief",
      detail: proposal.brief ? proposal.brief.title : undefined,
      at: formatDate(proposal.created_at),
      tone: "accent",
    },
    ...(decided
      ? [
          {
            icon: decided === "accepted" ? Check : X,
            title: decided === "accepted" ? "Accepted" : "Declined",
            detail: "Recorded on the proposal",
            at: formatDate(proposal.updated_at),
            tone: decided === "accepted" ? "success" : "error",
          } as TimelineEvent,
        ]
      : []),
    {
      icon: Clock,
      title: "Last updated",
      at: timeAgo(proposal.updated_at),
      tone: "muted",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/proposals"
        className="mb-3 inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Proposals
      </Link>

      <DocHeader
        icon={FileText}
        title={proposal.title}
        badges={<ProposalStatusBadge status={proposal.status} />}
        subtitle={proposal.client_name ?? undefined}
      />

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          icon={ListChecks}
          label="Deliverables"
          value={`${doneCount} of ${proposal.deliverables.length} done`}
          hint={
            proposal.deliverables.length > 0
              ? "Agreed scope items"
              : "None captured"
          }
          tone={doneCount > 0 ? "accent" : "muted"}
        />
        <StatTile
          icon={Wallet}
          label="Budget & timeline"
          value={budgetCaptured ? "Captured" : "Not captured"}
          hint={
            budgetCaptured
              ? proposal.budget_timeline!.slice(0, 64) +
                (proposal.budget_timeline!.length > 64 ? "…" : "")
              : "Add when generating from the brief"
          }
          tone={budgetCaptured ? "success" : "muted"}
        />
        <StatTile
          icon={BookOpen}
          label="Source brief"
          value={proposal.brief ? proposal.brief.title : "—"}
          hint={proposal.brief ? "View the brief it came from" : undefined}
          href={proposal.brief ? `/briefs/${proposal.brief.id}` : undefined}
          delay={80}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* ── Left: the proposal document ── */}
        <PaperCard
          letterLabel="Proposal"
          letterhead={proposal.client_name ?? "Proposal"}
          meta={formatDate(proposal.created_at)}
          footer={
            proposal.brief ? (
              <p className="text-xs text-muted-foreground">
                Generated from the brief{" "}
                <Link
                  href={`/briefs/${proposal.brief.id}`}
                  className="inline-block min-h-11 min-w-11 break-words px-0.5 py-3 text-accent underline-offset-2 hover:underline"
                >
                  {proposal.brief.title}
                </Link>
              </p>
            ) : undefined
          }
        >
          <div className="space-y-6">
            <div className="space-y-1.5">
              <FieldLabel>Budget & timeline</FieldLabel>
              {budgetCaptured ? (
                <p className="text-[15px] leading-relaxed">
                  {proposal.budget_timeline}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No budget or dates captured.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FieldLabel>Deliverables</FieldLabel>
                <span className="text-xs text-muted-foreground">
                  {doneCount} of {proposal.deliverables.length} done
                </span>
              </div>
              <ul className="space-y-1 rounded-md border border-border bg-muted/40 p-2">
                {proposal.deliverables.length === 0 ? (
                  <li className="px-1.5 py-1 text-sm text-muted-foreground">
                    No deliverables captured.
                  </li>
                ) : (
                  proposal.deliverables.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-start gap-2.5 rounded-md px-1.5 py-1.5"
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                          d.checked
                            ? "border-accent bg-accent text-white"
                            : "border-border bg-card"
                        }`}
                      >
                        {d.checked && (
                          <Check className="h-3 w-3" strokeWidth={3.5} aria-hidden="true" />
                        )}
                      </span>
                      <span
                        className={
                          d.checked
                            ? "text-sm text-muted-foreground line-through"
                            : "text-sm"
                        }
                      >
                        {d.text}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </PaperCard>

        {/* ── Right: action + metadata rail ── */}
        <div className="space-y-4">
          <Card className="animate-rise-in" style={{ animationDelay: "40ms" }}>
            <CardHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-border px-5 py-3.5">
              <span className="icon-chip icon-chip-accent h-8 w-8">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <CardTitle className="text-base">Next step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-muted-foreground">
                Turn this proposal into a delivery plan with tasks your
                client can follow.
              </p>
              <CanEdit>
                <GeneratePlanButton proposalId={proposal.id} />
              </CanEdit>
            </CardContent>
          </Card>

          <RailCard icon={FileText} title="Details">
            <MetaRow label="Status">
              <CanEdit
                fallback={<ProposalStatusBadge status={proposal.status} />}
              >
                <ProposalStatusSelect
                  proposalId={proposal.id}
                  status={proposal.status}
                />
              </CanEdit>
            </MetaRow>
            {proposal.client_name && (
              <MetaRow label="Client">{proposal.client_name}</MetaRow>
            )}
            <MetaRow label="Created">{formatDate(proposal.created_at)}</MetaRow>
            <MetaRow label="Updated">{timeAgo(proposal.updated_at)}</MetaRow>
          </RailCard>

          {proposal.brief && (
            <RailCard icon={BookOpen} title="Source">
              <p className="text-sm">{proposal.brief.title}</p>
              <Link
                href={`/briefs/${proposal.brief.id}`}
                className="inline-flex min-h-11 min-w-11 items-center group gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
              >
                View source brief
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
