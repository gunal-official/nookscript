/**
 * /contracts/:id — engagement letter (Step 34(b) document treatment): the
 * agreement rendered as a paper letter with letterhead strip and a two-party
 * signature block, a signing-flow rail (Draft → Sent → Signed with audit
 * stamps), an activity timeline, and the composer below for editors.
 *
 * Printing: the on-screen UI is the editor + letter preview; the PRINTABLE
 * document is PrintContractDocument (hidden print:block) — with the (app)
 * chrome (topbar + sidebar) also print:hidden, browser print of this page
 * yields a clean contract. That is the v1 export story (D4: no public
 * surface, no PDF endpoint, no e-sign).
 *
 * HOW TO TEST (locally — ⚠ contracts migration + seed applied first):
 *   1. From /contracts open the seeded signed contract. Details show
 *      Sent + Signed dates (the audit stamps) and the signatory.
 *   2. Status: Signed → Draft CLEARS signed_at; → Sent keeps sent_at;
 *      → Signed re-stamps it; Void keeps every stamp.
 *   3. Edit terms/client/expiry/signatory in the composer → Save persists;
 *      the letter above reflects it after save.
 *   4. Print (button or browser): a clean document renders — title,
 *      client, dates, signatory, terms — no app chrome.
 *   5. Bogus or foreign ids render the "not found" state (RLS hides
 *      them identically).
 */

import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  BookOpen,
  Clock,
  FilePlus2,
  FileSignature,
  Hourglass,
  PenLine,
  Send,
} from "lucide-react";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActivityTimeline,
  DocHeader,
  PaperCard,
  StatTile,
  type TimelineEvent,
} from "@/components/ui/doc-detail";
import type { ContractStatus } from "@/lib/types/contract";

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

const FLOW_STEPS: {
  key: ContractStatus;
  label: string;
  icon: typeof Send;
}[] = [
  { key: "draft", label: "Draft", icon: FilePlus2 },
  { key: "sent", label: "Sent", icon: Send },
  { key: "signed", label: "Signed", icon: PenLine },
];

function SigningFlow({ status }: { status: ContractStatus }) {
  const stepIndex = FLOW_STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center gap-1.5">
      {FLOW_STEPS.map((step, i) => {
        const active = i === stepIndex;
        const done = status !== "void" && i < stepIndex;
        return (
          <span
            key={step.key}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm ${
              active
                ? "border-accent bg-accent-soft text-accent"
                : done
                  ? "border-border bg-muted/60 text-success"
                  : "border-border text-muted-foreground"
            }`}
          >
            <step.icon className="h-4 w-4" aria-hidden="true" />
            {step.label}
          </span>
        );
      })}
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

  const isExpired =
    !!contract.expires_on &&
    contract.status !== "signed" &&
    contract.status !== "void" &&
    contract.expires_on < new Date().toISOString().slice(0, 10);

  const events: TimelineEvent[] = [
    {
      icon: FilePlus2,
      title: "Created",
      at: formatDate(contract.created_at),
      tone: "muted",
    },
    ...(contract.sent_at
      ? [
          {
            icon: Send,
            title: "Sent to client",
            detail: contract.client_name,
            at: formatDate(contract.sent_at),
            tone: "accent",
          } as TimelineEvent,
        ]
      : []),
    ...(contract.signed_at
      ? [
          {
            icon: PenLine,
            title: "Signed",
            detail: contract.signed_by || undefined,
            at: formatDate(contract.signed_at),
            tone: "success",
          } as TimelineEvent,
        ]
      : []),
    ...(contract.status === "void"
      ? [
          {
            icon: Ban,
            title: "Voided",
            detail: "Keeps every audit stamp",
            at: timeAgo(contract.updated_at),
            tone: "error",
          } as TimelineEvent,
        ]
      : []),
    ...(contract.expires_on
      ? [
          {
            icon: Hourglass,
            title: isExpired ? "Expired" : "Offer expires",
            detail: isExpired
              ? "The offer window has passed"
              : "Last day to accept",
            at: formatDate(contract.expires_on),
            tone: isExpired ? "error" : "muted",
          } as TimelineEvent,
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      {/* On-screen editor + letter — hidden when printing. */}
      <div className="print:hidden">
        <Link
          href="/contracts"
          className="mb-3 inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Contracts
        </Link>

        <DocHeader
          icon={FileSignature}
          title={contract.title}
          badges={
            <>
              <ContractStatusBadge status={contract.status} />
              <ExpiredBadge
                expiresOn={contract.expires_on}
                status={contract.status}
              />
            </>
          }
          subtitle={`${contract.client_name}${briefTitle ? ` — ${briefTitle}` : ""}`}
          actions={<PrintButton />}
        />

        {/* Stat tiles */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            icon={Send}
            label="Sent"
            value={contract.sent_at ? formatDate(contract.sent_at) : "Not sent"}
            hint={contract.sent_at ? "Audit stamp — never overwritten" : "Draft stage"}
            tone={contract.sent_at ? "accent" : "muted"}
          />
          <StatTile
            icon={PenLine}
            label="Signed"
            value={
              contract.signed_at ? formatDate(contract.signed_at) : "Awaiting"
            }
            hint={
              contract.signed_by
                ? contract.signed_by
                : "No signatory recorded"
            }
            tone={contract.signed_at ? "success" : "muted"}
          />
          <StatTile
            icon={Clock}
            label="Expires"
            value={
              contract.expires_on ? formatDate(contract.expires_on) : "No expiry"
            }
            hint={
              isExpired
                ? "Expired offer"
                : contract.expires_on
                  ? "Last day to accept"
                  : "Open-ended offer"
            }
            tone={isExpired ? "error" : "muted"}
          />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
          {/* ── Left: the engagement letter + composer ── */}
          <div className="space-y-6">
            <PaperCard
              letterLabel="Engagement letter"
              letterhead={context.name}
              meta={formatDate(contract.created_at)}
              footer={
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div>
                    <FieldLabel>For the studio</FieldLabel>
                    <p className="mt-1 font-display text-xl italic tracking-tight">
                      {context.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(contract.created_at)}
                    </p>
                  </div>
                  <div>
                    <FieldLabel>For the client</FieldLabel>
                    {contract.signed_at ? (
                      <>
                        <p className="mt-1 font-display text-xl italic tracking-tight">
                          {contract.signed_by || contract.client_name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Signed {formatDate(contract.signed_at)}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 min-h-8 border-b border-dashed border-border">
                          {contract.signed_by && (
                            <span className="font-display text-xl italic tracking-tight">
                              {contract.signed_by}
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {contract.status === "void"
                            ? "Void — signature line retired"
                            : "Awaiting signature"}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              }
            >
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold tracking-tight">
                  {contract.title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Between {context.name} and {contract.client_name}
                  {briefTitle ? ` — ${briefTitle}` : ""}
                </p>
              </div>
              <pre className="mt-6 whitespace-pre-wrap font-sans text-[15px] leading-relaxed">
                {contract.terms || "—"}
              </pre>
            </PaperCard>

            <CanEdit>
              <Card className="animate-rise-in">
                <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
                  <CardTitle className="text-base">Edit terms</CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  <ContractComposer
                    contract={contract}
                    briefTitles={briefTitles}
                    clientSuggestions={clientSuggestions}
                  />
                </CardContent>
              </Card>
            </CanEdit>
          </div>

          {/* ── Right: signing + metadata rail ── */}
          <div className="space-y-4">
            <RailCard icon={FileSignature} title="Signing">
              <SigningFlow status={contract.status} />
              {contract.status === "void" && (
                <p className="flex items-center gap-1.5 text-sm text-error">
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  Void — this agreement is closed out.
                </p>
              )}
              <div className="border-t border-border pt-3.5">
                <MetaRow label="Move to">
                  <CanEdit
                    fallback={<ContractStatusBadge status={contract.status} />}
                  >
                    <ContractStatusSelect
                      contractId={contract.id}
                      status={contract.status}
                    />
                  </CanEdit>
                </MetaRow>
              </div>
            </RailCard>

            <RailCard icon={BookOpen} title="Details">
              <MetaRow label="Client">{contract.client_name}</MetaRow>
              <MetaRow label="Brief">
                {contract.brief_id ? (
                  <Link
                    href={`/briefs/${contract.brief_id}`}
                    className="inline-block min-h-11 min-w-11 break-words px-0.5 py-3 text-accent underline-offset-2 hover:underline"
                  >
                    {briefTitle ?? "View brief"}
                  </Link>
                ) : (
                  "Standalone"
                )}
              </MetaRow>
              {contract.sent_at && (
                <MetaRow label="Sent">{formatDate(contract.sent_at)}</MetaRow>
              )}
              {contract.signed_at && (
                <MetaRow label="Signed">
                  {formatDate(contract.signed_at)}
                </MetaRow>
              )}
              {contract.signed_by && (
                <MetaRow label="Signed by">{contract.signed_by}</MetaRow>
              )}
              <MetaRow label="Created">
                {formatDate(contract.created_at)}
              </MetaRow>
              <MetaRow label="Updated">{timeAgo(contract.updated_at)}</MetaRow>
              <div className="border-t border-border pt-3.5">
                <PrintButton />
              </div>
            </RailCard>

            <RailCard icon={Clock} title="Activity">
              <ActivityTimeline events={events} />
            </RailCard>
          </div>
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
