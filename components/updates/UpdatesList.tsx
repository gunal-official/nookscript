"use client";

/**
 * Client side of /updates — status filter tabs + search over the list the
 * server page fetched. Mirrors components/plans/PlansList.tsx (Step 8);
 * updates originate from plans, so the empty state points to /plans
 * rather than offering an inline create.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Send } from "lucide-react";

import { UpdateStatusBadge } from "@/components/updates/UpdateStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { timeAgo } from "@/lib/utils";
import type { UpdateStatus, UpdateSummary } from "@/lib/types/update";

type StatusFilter = "all" | UpdateStatus;

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
];

function EmptyState({
  hasUpdates,
  onClearFilters,
}: {
  hasUpdates: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Send className="h-5 w-5 text-muted-foreground" />
      </span>
      {hasUpdates ? (
        <>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              No matching updates
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
              No updates yet
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Updates are composed from plans — open a plan and click
              “Compose update” to draft one for the client.
            </p>
          </div>
          <Button asChild>
            <Link href="/plans">Open plans</Link>
          </Button>
        </>
      )}
    </div>
  );
}

function UpdateCard({ update }: { update: UpdateSummary }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/updates/${update.id}`}
              className="font-display text-base font-semibold leading-snug underline-offset-2 hover:underline"
            >
              {update.title}
            </Link>
            {update.client_name && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {update.client_name}
              </p>
            )}
          </div>
          <UpdateStatusBadge status={update.status} className="shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 p-5">
        {update.excerpt ? (
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {update.excerpt}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No content yet.</p>
        )}
        <p className="text-right text-xs text-muted-foreground">
          Updated {timeAgo(update.updated_at)}
        </p>
      </CardContent>
    </Card>
  );
}

export function UpdatesList({ updates }: { updates: UpdateSummary[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: updates.length,
      draft: 0,
      sent: 0,
    };
    for (const update of updates) counts[update.status] += 1;
    return counts;
  }, [updates]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return updates.filter((update) => {
      if (statusFilter !== "all" && update.status !== statusFilter)
        return false;
      if (!q) return true;
      return (
        update.title.toLowerCase().includes(q) ||
        (update.client_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [updates, statusFilter, query]);

  return (
    <div>
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
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or client…"
            className="pl-8"
            aria-label="Search updates"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          hasUpdates={updates.length > 0}
          onClearFilters={() => {
            setStatusFilter("all");
            setQuery("");
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((update) => (
            <UpdateCard key={update.id} update={update} />
          ))}
        </div>
      )}
    </div>
  );
}
