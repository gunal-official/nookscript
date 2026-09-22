"use client";

/**
 * Left panel of /intake. Renders either:
 *  - "input": textarea + Generate button (the "Paste client text" area), or
 *  - "thread": the pasted source as a read-only message thread (after Generate).
 *
 * How to test: see the comment at the top of app/(app)/intake/page.tsx.
 */

import { Loader2, RotateCcw, Sparkles } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { BriefSource } from "@/lib/types/brief";

export const MIN_SOURCE_CHARS = 20;

function toMessages(raw: string): string[] {
  return raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function SourcePanel({
  mode,
  rawText,
  onChange,
  onGenerate,
  generating,
  error,
  aiConfigured,
  source,
  onReset,
}: {
  mode: "input" | "thread";
  rawText: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  generating: boolean;
  error: string | null;
  aiConfigured: boolean;
  source: BriefSource | null;
  onReset: () => void;
}) {
  const canGenerate =
    rawText.trim().length >= MIN_SOURCE_CHARS && !generating;

  if (mode === "thread") {
    const messages = toMessages(rawText);
    return (
      <Card className="flex flex-col overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border bg-muted/60 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Source</CardTitle>
            <Badge variant="secondary">{source?.source_type ?? "manual"}</Badge>
            <span className="text-xs text-muted-foreground">
              {rawText.length.toLocaleString()} chars
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-muted-foreground hover:text-text"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New source
          </Button>
        </CardHeader>

        <CardContent className="space-y-3 bg-muted/40 p-5">
          {messages.map((msg, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="mt-1 h-6 w-6 shrink-0 rounded-full bg-accent text-center text-[11px] font-semibold leading-6 text-white">
                {i === 0 ? "S" : "·"}
              </span>
              <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
                  {msg}
                </p>
              </div>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            The original pasted text is stored verbatim and never edited.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="space-y-1 border-b border-border bg-muted/60 px-5 py-3.5">
        <CardTitle className="text-base">Paste client text</CardTitle>
        <CardDescription>
          An email, a chat log, or call notes — nookscript drafts the brief.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 p-5">
        <Textarea
          value={rawText}
          onChange={(e) => onChange(e.target.value)}
          disabled={generating}
          placeholder={
            "Paste the client's message here…\n\ne.g. “Hi Maya, great chatting yesterday. We'd love to kick off the rebrand…”"
          }
          className="min-h-[340px] resize-y bg-muted/40 leading-relaxed"
        />
        {error ? <p className="mt-3 text-sm text-error">{error}</p> : null}
      </CardContent>

      <CardFooter className="border-t border-border bg-muted/40 px-5 py-3.5">
        <span
          className={cn(
            "text-xs text-muted-foreground",
            rawText.trim().length > 0 &&
              rawText.trim().length < MIN_SOURCE_CHARS &&
              "text-error"
          )}
        >
          {rawText.trim().length.toLocaleString()} chars
        </span>
        <div className="ml-auto flex items-center gap-3">
          {!aiConfigured && (
            <span className="hidden text-xs text-muted-foreground md:inline">
              No OPENAI_API_KEY — local parser will draft
            </span>
          )}
          <Button onClick={onGenerate} disabled={!canGenerate}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
