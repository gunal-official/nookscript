/**
 * /proposals/:id — proposal detail: status flow, budget & timeline,
 * deliverables checklist, and a link back to the source brief.
 *
 * HOW TO TEST (locally — Supabase configured per README.md, seed loaded):
 *   1. From /proposals open the seeded "Brightloop Co." proposal.
 *   2. Status dropdown (Draft → Sent → Accepted / Declined): proposals.status
 *      updates; back on /proposals the card badge matches.
 *   3. "Source" row links to /briefs/<id> of the brief it was generated
 *      from; on that brief page, "Generate proposal" creates another draft
 *      and redirects here.
 *   4. Bogus or foreign-workspace ids render the "not found" state (RLS
 *      hides them identically — no cross-tenant leakage).
 */

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";

import { getProposalById } from "@/lib/data/proposals";
import { formatDate, isUuid, timeAgo } from "@/lib/utils";
import { GeneratePlanButton } from "@/components/proposals/GeneratePlanButton";
import { CanEdit } from "@/components/app-shell/CanEdit";
import { ProposalStatusBadge } from "@/components/proposals/ProposalStatusBadge";
import { ProposalStatusSelect } from "@/components/proposals/ProposalStatusSelect";
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

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/proposals"
          className="mb-3 inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5"  aria-hidden="true" />
          Proposals
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {proposal.title}
          </h1>
          <ProposalStatusBadge status={proposal.status} />
        </div>
        {proposal.client_name && (
          <p className="mt-1 text-sm text-muted-foreground">
            {proposal.client_name}
          </p>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* ── Left: proposal details ── */}
        <Card>
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <CardTitle className="text-base">Proposal details</CardTitle>
            <CardDescription>
              Copied from the source brief when the proposal was generated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <div className="space-y-1.5">
              <FieldLabel>Budget & timeline</FieldLabel>
              {proposal.budget_timeline ? (
                <p className="text-sm leading-relaxed">
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
                          <Check className="h-3 w-3" strokeWidth={3.5}  aria-hidden="true" />
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
          </CardContent>
        </Card>

        {/* ── Right: metadata / actions ── */}
        <Card>
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5 p-5">
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
            {proposal.brief && (
              <div className="border-t border-border pt-3.5">
                <Link
                  href={`/briefs/${proposal.brief.id}`}
                  className="inline-flex min-h-11 min-w-11 items-center group inline-flex items-center gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
                >
                  View source brief
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {proposal.brief.title}
                </p>
              </div>
            )}
            <div className="border-t border-border pt-4">
              <CanEdit>
                <GeneratePlanButton proposalId={proposal.id} />
              </CanEdit>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
