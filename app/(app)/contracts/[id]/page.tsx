/**
 * /contracts/:id — the contract composer: title, client, brief, terms,
 * expiry, signatory, and the draft/sent/signed/void lifecycle (audit
 * stamps included).
 *
 * Printing: the on-screen UI is the editor; the PRINTABLE document is
 * PrintContractDocument (hidden print:block) — with the (app) chrome
 * (topbar + sidebar) also print:hidden, browser print of this page
 * yields a clean contract. That is the v1 export story (D4: no public
 * surface, no PDF endpoint, no e-sign).
 *
 * HOW TO TEST (locally — ⚠ contracts migration + seed applied first):
 *   1. From /contracts open the seeded signed contract. Details show
 *      Sent + Signed dates (the audit stamps) and the signatory.
 *   2. Status: Signed → Draft CLEARS signed_at; → Sent keeps sent_at;
 *      → Signed re-stamps it; Void keeps every stamp.
 *   3. Edit terms/client/expiry/signatory → Save persists.
 *   4. Print (button or browser): a clean document renders — title,
 *      client, dates, signatory, terms — no app chrome.
 *   5. Bogus or foreign ids render the "not found" state (RLS hides
 *      them identically).
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getContractById } from "@/lib/data/contracts";
import { getBriefs } from "@/lib/data/briefs";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { formatDate, isUuid, timeAgo } from "@/lib/utils";
import { ContractComposer } from "@/components/contracts/ContractComposer";
import { CanEdit } from "@/components/app-shell/CanEdit";
import {
  ContractStatusBadge,
  ExpiredBadge,
} from "@/components/contracts/ContractStatusBadge";
import { ContractStatusSelect } from "@/components/contracts/ContractStatusSelect";
import { PrintContractDocument } from "@/components/contracts/PrintContractDocument";
import { PrintButton } from "@/components/invoices/PrintButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
          Contract not found
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This contract doesn’t exist — or it belongs to a workspace
          you’re not a member of.
        </p>
      </div>
      <Button asChild variant="secondary">
        <Link href="/contracts" className="inline-flex min-h-11 min-w-11 items-center">Back to contracts</Link>
      </Button>
    </div>
  );
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) {
    return <NotFoundState />;
  }

  const context = await getWorkspaceContext();
  const contract = await getContractById(id);
  if (!contract || !context) {
    return <NotFoundState />;
  }

  // Brief title for the card chip / print doc + the composer's picker.
  const briefs = await getBriefs(context.id);
  const briefTitles: Record<string, string> = {};
  for (const brief of briefs) briefTitles[brief.id] = brief.title;
  const briefTitle = contract.brief_id
    ? (briefTitles[contract.brief_id] ?? null)
    : null;

  const clientSuggestions = Array.from(
    new Set(briefs.map((b) => b.client_name).filter((c): c is string => !!c))
  );

  return (
    <div className="mx-auto max-w-6xl">
      {/* On-screen editor — hidden when printing. */}
      <div className="print:hidden">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/contracts"
            className="mb-3 inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5"  aria-hidden="true" />
            Contracts
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              {contract.title}
            </h1>
            <ContractStatusBadge status={contract.status} />
            <ExpiredBadge
              expiresOn={contract.expires_on}
              status={contract.status}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {contract.client_name}
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
          {/* ── Left: composer ── */}
          <Card>
            <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
              <CardTitle className="text-base">Composer</CardTitle>
              <CardDescription>
                Plain-text terms — the document you print and send.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <CanEdit>
                <ContractComposer
                  contract={contract}
                  briefTitles={briefTitles}
                  clientSuggestions={clientSuggestions}
                />
              </CanEdit>
            </CardContent>
          </Card>

          {/* ── Right: details ── */}
          <Card>
            <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5 p-5">
              <MetaRow label="Status">
                <CanEdit
                  fallback={<ContractStatusBadge status={contract.status} />}
                >
                  <ContractStatusSelect
                    contractId={contract.id}
                    status={contract.status}
                  />
                </CanEdit>
              </MetaRow>
              <MetaRow label="Client">{contract.client_name}</MetaRow>
              <MetaRow label="Brief">{briefTitle ?? "Standalone"}</MetaRow>
              <MetaRow label="Expires">
                {formatDate(contract.expires_on)}
              </MetaRow>
              {contract.sent_at && (
                <MetaRow label="Sent">{formatDate(contract.sent_at)}</MetaRow>
              )}
              {contract.signed_at && (
                <MetaRow label="Signed">{formatDate(contract.signed_at)}</MetaRow>
              )}
              {contract.signed_by && (
                <MetaRow label="Signed by">{contract.signed_by}</MetaRow>
              )}
              <MetaRow label="Created">{formatDate(contract.created_at)}</MetaRow>
              <MetaRow label="Updated">{timeAgo(contract.updated_at)}</MetaRow>
              <MetaRow label="Export">
                <PrintButton className="mt-1" />
              </MetaRow>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* The printable document (browser print = v1 export story). */}
      <PrintContractDocument
        contract={contract}
        briefTitle={briefTitle}
        workspaceName={context.name}
      />
    </div>
  );
}
