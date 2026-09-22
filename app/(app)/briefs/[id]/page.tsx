/**
 * /briefs/:id — brief detail view with tabs-style panels, question
 * resolution, and status changes.
 *
 * HOW TO TEST (locally — Supabase configured per README.md):
 *   1. Apply migrations + run supabase/seed.sql, log in, then open:
 *      /briefs/00000000-0000-0000-0000-000000000010
 *      ("Brightloop Co. — Brand Identity Refresh" — 1 open, 2 resolved
 *      questions, source email, 2 history rows)
 *   2. Status dropdown (Draft → In review → Approved): briefs.status
 *      updates and a 'status_changed' row appears in the History card
 *      (DB trigger writes it).
 *   3. Click Resolve on the open question → answer + answered_by → the
 *      question moves to the Resolved group with its answer, and the
 *      History card gains a 'question_resolved' entry.
 *   4. Unknown or foreign-workspace ids render the "not found" state
 *      (RLS hides them identically — no cross-tenant leakage).
 */

import Link from "next/link";
import { ArrowLeft, Check, FileText } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getBriefById } from "@/lib/data/briefs";
import { formatDate, getInitials, isUuid, timeAgo } from "@/lib/utils";
import { ResolveQuestionDialog } from "@/components/briefs/ResolveQuestionDialog";
import { StatusBadge } from "@/components/briefs/StatusBadge";
import { StatusSelect } from "@/components/briefs/StatusSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BriefQuestion } from "@/lib/types/brief";

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
          Brief not found
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This brief doesn’t exist — or it belongs to a workspace you’re not a
          member of.
        </p>
      </div>
      <Button asChild variant="secondary">
        <Link href="/briefs">Back to briefs</Link>
      </Button>
    </div>
  );
}

export default async function BriefDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isUuid(params.id)) {
    return <NotFoundState />;
  }

  const brief = await getBriefById(params.id);
  if (!brief) {
    return <NotFoundState />;
  }

  // For the "Answered by" default and history attribution ("You").
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const userName = profile?.full_name ?? null;

  const openQuestions = brief.questions.filter((q) => q.status === "open");
  const resolvedQuestions = brief.questions.filter(
    (q) => q.status === "resolved"
  );
  const doneCount = brief.deliverables.filter((d) => d.checked).length;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/briefs"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Briefs
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {brief.title}
          </h1>
          <StatusBadge status={brief.status} />
        </div>
        {brief.client_name && (
          <p className="mt-1 text-sm text-muted-foreground">
            {brief.client_name}
          </p>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* ── Left: brief details + questions ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
              <CardTitle className="text-base">Brief details</CardTitle>
              <CardDescription>
                Structured output from the intake source.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <div className="space-y-1.5">
                <FieldLabel>Objective</FieldLabel>
                {brief.objective ? (
                  <p className="text-sm leading-relaxed">{brief.objective}</p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No objective captured.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FieldLabel>Deliverables</FieldLabel>
                  <span className="text-xs text-muted-foreground">
                    {doneCount} of {brief.deliverables.length} done
                  </span>
                </div>
                <ul className="space-y-1 rounded-md border border-border bg-muted/40 p-2">
                  {brief.deliverables.length === 0 ? (
                    <li className="px-1.5 py-1 text-sm text-muted-foreground">
                      No deliverables captured.
                    </li>
                  ) : (
                    brief.deliverables.map((d) => (
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
                            <Check className="h-3 w-3" strokeWidth={3.5} />
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

              <div className="space-y-1.5">
                <FieldLabel>Budget & timeline</FieldLabel>
                {brief.budget_timeline ? (
                  <p className="text-sm leading-relaxed">
                    {brief.budget_timeline}
                  </p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No budget or dates captured.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Clarifying questions
                </CardTitle>
                <div className="flex gap-1.5">
                  <Badge className="border-accent bg-accent-soft text-accent">
                    {openQuestions.length} open
                  </Badge>
                  <Badge variant="secondary">
                    {resolvedQuestions.length} resolved
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-5">
              <section>
                <FieldLabel>Open</FieldLabel>
                {openQuestions.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nothing left to clarify — all questions are resolved.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {openQuestions.map((q: BriefQuestion) => (
                      <li
                        key={q.id}
                        className="rounded-md border border-accent bg-accent-soft p-3.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-snug">
                              {q.question_text}
                            </p>
                            {q.context_note && (
                              <p className="mt-1 text-xs italic leading-snug text-muted-foreground">
                                {q.context_note}
                              </p>
                            )}
                          </div>
                          <ResolveQuestionDialog
                            briefId={brief.id}
                            questionId={q.id}
                            questionText={q.question_text}
                            defaultAnsweredBy={
                              userName ? `${userName} (you)` : ""
                            }
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <FieldLabel>Resolved</FieldLabel>
                {resolvedQuestions.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No resolved questions yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {resolvedQuestions.map((q) => (
                      <li
                        key={q.id}
                        className="rounded-md border border-border bg-muted/40 p-3.5"
                      >
                        <p className="text-sm font-medium leading-snug">
                          {q.question_text}
                        </p>
                        <p className="mt-1.5 text-sm leading-snug text-text">
                          {q.answer_text}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {q.answered_by}
                          {q.resolved_at
                            ? ` · ${timeAgo(q.resolved_at)}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: metadata / actions, sources, history ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5 p-5">
              <MetaRow label="Status">
                <StatusSelect briefId={brief.id} status={brief.status} />
              </MetaRow>
              {brief.client_name && (
                <MetaRow label="Client">{brief.client_name}</MetaRow>
              )}
              <MetaRow label="Created">{formatDate(brief.created_at)}</MetaRow>
              <MetaRow label="Updated">{timeAgo(brief.updated_at)}</MetaRow>
              <MetaRow label="Owner">
                {brief.owner_id && user && brief.owner_id === user.id
                  ? `You${userName ? ` (${userName})` : ""}`
                  : "Team"}
              </MetaRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Sources</CardTitle>
                <Badge variant="secondary">{brief.sources.length}</Badge>
              </div>
              <CardDescription>Original text, stored verbatim.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {brief.sources.map((s) => (
                <div key={s.id}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{s.source_type}</Badge>
                    {typeof s.metadata.from === "string" && (
                      <span className="text-xs text-muted-foreground">
                        {String(s.metadata.from)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(s.created_at)}
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
                    <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-text">
                      {s.raw_content}
                    </pre>
                  </div>
                </div>
              ))}
              {brief.sources.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No sources attached.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <ul className="space-y-0">
                {brief.edit_history.map((entry, i) => (
                  <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      {i < brief.edit_history.length - 1 && (
                        <span className="mt-1 w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div className="min-w-0 pb-1">
                      <p className="text-sm leading-snug">{entry.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.user_id === null
                          ? "AI / system"
                          : user && entry.user_id === user.id
                            ? "You"
                            : "Teammate"}
                        {" · "}
                        {timeAgo(entry.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {brief.edit_history.length === 0 && (
                <p className="text-sm text-muted-foreground">No history yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
