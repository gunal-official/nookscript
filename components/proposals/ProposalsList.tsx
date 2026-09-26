"use client";

/**
 * Client side of /proposals — status filter tabs + search over the list the
 * server page fetched. Mirrors components/briefs/BriefsList.tsx (Step 6);
 * proposals originate from briefs, so the empty state points to /briefs
 * rather than offering an inline create.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileSignature, Search, Hourglass, CheckCircle2, ListChecks } from "lucide-react";

import { ProposalStatusBadge } from "@/components/proposals/ProposalStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { timeAgo } from "@/lib/utils";
import { ListStats, StatTile, StackedBar } from "@/components/ui/doc-detail";
import type { ProposalStatus, ProposalSummary } from "@/lib/types/proposal";

type StatusFilter = "all" | ProposalStatus;

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
];

function EmptyState({
  hasProposals,
  onClearFilters,
}: {
  hasProposals: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16 text-center">
      <span className="icon-chip icon-chip-accent">
        <FileSignature className="h-5 w-5" />
      </span>
      {hasProposals ? (
        <>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              No matching proposals
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
              No proposals yet
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Proposals are generated from briefs — open a brief and click
              “Generate proposal” to draft one.
            </p>
          </div>
          <Button asChild>
            <Link href="/briefs" className="inline-flex min-h-11 min-w-11 items-center">Open briefs</Link>
          </Button>
        </>
      )}
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: ProposalSummary }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/proposals/${proposal.id}`}
              className="inline-flex min-h-11 min-w-11 items-center font-display text-base font-semibold leading-snug underline-offset-2 hover:underline"
            >
              {proposal.title}
            </Link>
            {proposal.client_name && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {proposal.client_name}
              </p>
            )}
          </div>
          <ProposalStatusBadge
            status={proposal.status}
            className="shrink-0"
          />
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 p-5">
        {proposal.deliverablesTotal > 0 ? (
          <Badge variant="secondary">
            {proposal.deliverablesDone}/{proposal.deliverablesTotal}{" "}
            deliverable{proposal.deliverablesTotal === 1 ? "" : "s"} done
          </Badge>
        ) : (
          <span />
        )}
        <span className="text-xs text-muted-foreground">
          Updated {timeAgo(proposal.updated_at)}
        </span>
      </CardContent>
    </Card>
  );
}

export function ProposalsList({ proposals }: { proposals: ProposalSummary[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: proposals.length,
      draft: 0,
      sent: 0,
      accepted: 0,
      declined: 0,
    };
    for (const proposal of proposals) counts[proposal.status] += 1;
    return counts;
  }, [proposals]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return proposals.filter((proposal) => {
      if (statusFilter !== "all" && proposal.status !== statusFilter)
        return false;
      if (!q) return true;
      return (
        proposal.title.toLowerCase().includes(q) ||
        (proposal.client_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [proposals, statusFilter, query]);

  const inPlay = proposals.filter((p) => p.status === "draft" || p.status === "sent").length;
  const accepted = proposals.filter((p) => p.status === "accepted").length;
  const deliverablesDone = proposals.reduce((n, p) => n + p.deliverablesDone, 0);
  const deliverablesTotal = proposals.reduce((n, p) => n + p.deliverablesTotal, 0);

  return (
    <div>
      <ListStats cols={4}>
        <StatTile icon={FileSignature} label="Total proposals" value={proposals.length} hint="All time" />
        <StatTile
          icon={Hourglass}
          label="In play"
          value={inPlay}
          hint="Draft or sent"
          tone={inPlay > 0 ? "accent" : "muted"}
          delay={40}
        />
        <StatTile
          icon={CheckCircle2}
          label="Accepted"
          value={accepted}
          hint="Won work"
          tone={accepted > 0 ? "success" : "muted"}
          delay={80}
        />
        <StatTile
          icon={ListChecks}
          label="Scope done"
          value={`${deliverablesDone}/${deliverablesTotal}`}
          hint="Deliverables checked"
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
            aria-label="Search proposals"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          hasProposals={proposals.length > 0}
          onClearFilters={() => {
            setStatusFilter("all");
            setQuery("");
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}
