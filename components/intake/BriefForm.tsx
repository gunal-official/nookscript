"use client";

/**
 * Right panel of /intake — the editable generated brief.
 * States: "empty" (nothing generated yet), "loading" (skeleton while the
 * generator runs), "form" (editable draft + Open Questions + Save).
 *
 * How to test: see the comment at the top of app/(app)/intake/page.tsx.
 */

import Link from "next/link";
import { Check, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BriefDeliverable, BriefQuestion } from "@/lib/types/brief";

export interface BriefDraftFields {
  title: string;
  clientName: string;
  objective: string;
  budgetTimeline: string;
  deliverables: BriefDeliverable[];
}

function SkeletonRow({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className ?? ""}`} />;
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
    >
      {children}
    </label>
  );
}

function QuestionsBox({ questions }: { questions: BriefQuestion[] }) {
  const open = questions.filter((q) => q.status === "open");

  return (
    <div className="rounded-lg border border-accent bg-accent-soft p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold tracking-tight">
          Open questions
        </h3>
        <Badge className="border-transparent bg-accent text-white">
          {open.length} open
        </Badge>
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open questions — this source was unusually clear.
        </p>
      ) : (
        <ul className="space-y-3">
          {open.map((q) => (
            <li key={q.id} className="border-l-2 border-accent pl-3">
              <p className="text-sm font-medium leading-snug text-text">
                {q.question_text}
              </p>
              {q.context_note && (
                <p className="mt-0.5 text-xs italic leading-snug text-muted-foreground">
                  {q.context_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BriefForm({
  mode,
  draft,
  onChange,
  questions,
  dirty,
  saving,
  savedLabel,
  saveError,
  onSave,
  briefId,
}: {
  mode: "empty" | "loading" | "form";
  draft: BriefDraftFields;
  onChange: (patch: Partial<BriefDraftFields>) => void;
  questions: BriefQuestion[];
  dirty: boolean;
  saving: boolean;
  savedLabel: string | null;
  saveError: string | null;
  onSave: () => void;
  briefId: string | null;
}) {
  if (mode === "empty") {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 px-8 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Sparkles className="h-4 w-4 text-muted-foreground"  aria-hidden="true" />
        </span>
        <div>
          <p className="font-display font-semibold">Brief preview</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Paste client text on the left and hit Generate — the editable
            brief draft appears here.
          </p>
        </div>
      </div>
    );
  }

  if (mode === "loading") {
    return (
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0 border-b border-border px-5 py-3.5">
          <Loader2 className="h-4 w-4 animate-spin text-accent"  aria-hidden="true" />
          <CardTitle className="text-base">
            Generating your brief…
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <SkeletonRow className="h-8 w-2/3" />
          <SkeletonRow className="h-20 w-full" />
          <div className="space-y-2">
            <SkeletonRow className="h-5 w-1/2" />
            <SkeletonRow className="h-5 w-3/4" />
            <SkeletonRow className="h-5 w-2/3" />
          </div>
          <SkeletonRow className="h-16 w-full" />
          <SkeletonRow className="h-24 w-full border border-accent" />
        </CardContent>
      </Card>
    );
  }

  const doneCount = draft.deliverables.filter((d) => d.checked).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
          <CardTitle className="text-base">Brief draft</CardTitle>
          <CardDescription>
            Generated draft — edit anything, then save.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="brief-title">Title</FieldLabel>
            <Input
              id="brief-title"
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Client — Project"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="brief-client">Client</FieldLabel>
            <Input
              id="brief-client"
              value={draft.clientName}
              onChange={(e) => onChange({ clientName: e.target.value })}
              placeholder="Client name"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="brief-objective">Objective</FieldLabel>
            <Textarea
              id="brief-objective"
              rows={4}
              value={draft.objective}
              onChange={(e) => onChange({ objective: e.target.value })}
              placeholder="What the client wants, and why."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <FieldLabel>Deliverables</FieldLabel>
              <span className="text-xs text-muted-foreground">
                {doneCount} of {draft.deliverables.length} done
              </span>
            </div>
            <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2">
              {draft.deliverables.length === 0 ? (
                <p className="px-1.5 py-1 text-sm text-muted-foreground">
                  No concrete deliverables were detected.
                </p>
              ) : (
                draft.deliverables.map((d) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-card"
                  >
                    <Checkbox
                      checked={d.checked}
                      onCheckedChange={(checked) =>
                        onChange({
                          deliverables: draft.deliverables.map((x) =>
                            x.id === d.id
                              ? { ...x, checked: checked === true }
                              : x
                          ),
                        })
                      }
                      className="mt-0.5"
                    />
                    <span
                      className={
                        d.checked
                          ? "text-sm text-muted-foreground line-through"
                          : "text-sm text-text"
                      }
                    >
                      {d.text}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="brief-budget">Budget & timeline</FieldLabel>
            <Textarea
              id="brief-budget"
              rows={2}
              value={draft.budgetTimeline}
              onChange={(e) => onChange({ budgetTimeline: e.target.value })}
              placeholder="Budget, deadlines, kickoff…"
            />
          </div>
        </CardContent>

        <CardFooter className="border-t border-border bg-muted/40 px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm">
            {saveError ? (
              <span className="text-error">{saveError}</span>
            ) : savedLabel && !dirty ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Check className="h-4 w-4 text-accent"  aria-hidden="true" />
                {savedLabel}
              </span>
            ) : dirty ? (
              <span className="text-muted-foreground">Unsaved changes</span>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {briefId && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/briefs/${briefId}`} className="inline-flex min-h-11 min-w-11 items-center">Open in Briefs</Link>
              </Button>
            )}
            <Button onClick={onSave} disabled={!dirty || saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin"  aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Save brief"
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <QuestionsBox questions={questions} />
    </div>
  );
}
