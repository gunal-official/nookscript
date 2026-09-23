"use client";

/**
 * Client side of /contracts — status filter tabs + search over the list
 * the server page fetched, plus create-on-list (the invoices precedent:
 * creation lives on the list page). The card leads with title + client
 * and the status badge (plus the derived "Expired" chip when
 * expires_on has passed).
 *
 * The create form's client_name input is backed by a <datalist> of
 * client names seen on this workspace's briefs — a suggestion, never a
 * constraint (D1: free-text client, optional brief link).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";

import { createContract } from "@/app/(app)/contracts/actions";
import {
  ContractStatusBadge,
  ExpiredBadge,
} from "@/components/contracts/ContractStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, timeAgo } from "@/lib/utils";
import type {
  ContractStatus,
  ContractSummary,
} from "@/lib/types/contract";

type StatusFilter = "all" | ContractStatus;

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "signed", label: "Signed" },
  { value: "void", label: "Void" },
];

const STANDALONE = "standalone";

function EmptyState({
  hasContracts,
  onClearFilters,
  onNewContract,
}: {
  hasContracts: boolean;
  onClearFilters: () => void;
  onNewContract: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16 text-center">
      {hasContracts ? (
        <>
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              No matching contracts
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
              No contracts yet
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create your first contract — it starts as a draft, and you
              add the terms right after.
            </p>
          </div>
          <Button onClick={onNewContract}>
            <Plus className="mr-2 h-4 w-4" />
            New contract
          </Button>
        </>
      )}
    </div>
  );
}

function ContractCard({
  contract,
  briefTitle,
}: {
  contract: ContractSummary;
  briefTitle: string | null;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/contracts/${contract.id}`}
              className="font-display text-base font-semibold leading-snug underline-offset-2 hover:underline"
            >
              {contract.title}
            </Link>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {contract.client_name}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <ContractStatusBadge status={contract.status} />
            <ExpiredBadge
              expiresOn={contract.expires_on}
              status={contract.status}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 p-5">
        <p className="text-sm text-muted-foreground">
          {briefTitle ?? "Standalone — no brief"}
        </p>
        <p className="text-xs text-muted-foreground">
          {contract.expires_on
            ? `Expires ${formatDate(contract.expires_on)} · `
            : ""}
          Updated {timeAgo(contract.updated_at)}
        </p>
      </CardContent>
    </Card>
  );
}

export function ContractsList({
  contracts,
  briefTitles,
  clientSuggestions,
}: {
  contracts: ContractSummary[];
  /** brief id → title, for the card chip + the create form's picker. */
  briefTitles: Record<string, string>;
  clientSuggestions: string[];
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBrief, setNewBrief] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [creatingPending, setCreatingPending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: contracts.length,
      draft: 0,
      sent: 0,
      signed: 0,
      void: 0,
    };
    for (const contract of contracts) counts[contract.status] += 1;
    return counts;
  }, [contracts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts.filter((contract) => {
      if (statusFilter !== "all" && contract.status !== statusFilter)
        return false;
      if (!q) return true;
      return (
        contract.title.toLowerCase().includes(q) ||
        contract.client_name.toLowerCase().includes(q)
      );
    });
  }, [contracts, statusFilter, query]);

  async function handleCreate() {
    setCreatingPending(true);
    setCreateError(null);
    const result = await createContract({
      client_name: newClient,
      title: newTitle,
      brief_id: newBrief || null,
      expires_on: newExpiry || null,
    });
    setCreatingPending(false);
    if (result?.error) {
      setCreateError(result.error);
      return;
    }
    // Creation succeeded → compose the new contract (add terms).
    if (result?.id) router.push(`/contracts/${result.id}`);
  }

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
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or client…"
              className="pl-8"
              aria-label="Search contracts"
            />
          </div>
          {!creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New contract
            </Button>
          )}
        </div>
      </div>

      {creating && (
        <Card className="mb-5">
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <h2 className="font-display text-base font-semibold tracking-tight">
              New contract
            </h2>
            <p className="text-xs text-muted-foreground">
              Starts as a draft — add the terms after saving. The client
              name is free text; suggestions come from this workspace’s
              briefs.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="new-contract-client"
                  className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Client
                </label>
                <Input
                  id="new-contract-client"
                  list="contract-client-suggestions"
                  value={newClient}
                  onChange={(e) => setNewClient(e.target.value)}
                  placeholder="e.g. Brightloop Co."
                />
                <datalist id="contract-client-suggestions">
                  {clientSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="new-contract-title"
                  className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Title
                </label>
                <Input
                  id="new-contract-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Brand refresh — engagement agreement"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Brief (optional)
                </label>
                <Select
                  value={newBrief || STANDALONE}
                  onValueChange={(value) =>
                    setNewBrief(value === STANDALONE ? "" : value)
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STANDALONE}>
                      Standalone (no brief)
                    </SelectItem>
                    {Object.entries(briefTitles).map(([id, title]) => (
                      <SelectItem key={id} value={id}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="new-contract-expires"
                  className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Expiry (optional)
                </label>
                <Input
                  id="new-contract-expires"
                  type="date"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  className="w-48"
                />
              </div>
            </div>
            {createError && (
              <p className="text-xs text-error">{createError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleCreate}
                disabled={creatingPending}
              >
                {creatingPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create draft
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewClient("");
                  setNewTitle("");
                  setNewBrief("");
                  setNewExpiry("");
                  setCreateError(null);
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {visible.length === 0 ? (
        <EmptyState
          hasContracts={contracts.length > 0}
          onClearFilters={() => {
            setStatusFilter("all");
            setQuery("");
          }}
          onNewContract={() => setCreating(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((contract) => (
            <ContractCard
              key={contract.id}
              contract={contract}
              briefTitle={contract.brief_id ? briefTitles[contract.brief_id] ?? null : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
