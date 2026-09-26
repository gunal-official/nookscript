"use client";

/**
 * /intake/inbox thread list (Step 12). One card per brief that has at
 * least one source: the brief's sources render oldest-first as a running
 * thread of chat bubbles (shared SourceBubbles), with per-source type /
 * sender / timestamp headers, and an inline "Thread a follow-up" composer
 * (AddSourceForm) that appends a real brief_sources row to the thread.
 * Threads arrive pre-sorted server-side (most recently active first).
 */

import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { timeAgo } from "@/lib/utils";
import { AddSourceForm } from "@/components/intake/AddSourceForm";
import { SourceBubbles } from "@/components/intake/SourceBubbles";
import type { InboxThread } from "@/lib/types/inbox";

export function InboxThreadList({ threads }: { threads: InboxThread[] }) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
        <span className="icon-chip icon-chip-accent" aria-hidden="true">
          <MessageSquare className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium">No sources yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Client messages you paste appear here as threads — start from
            Intake.
          </p>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href="/intake" className="inline-flex min-h-11 min-w-11 items-center">Go to Intake</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {threads.map((thread) => (
        <Card key={thread.briefId} className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-border bg-muted/60 px-5 py-3.5">
            <div className="min-w-0">
              <CardTitle className="text-base">
                <Link
                  href={`/briefs/${thread.briefId}`}
                  className="inline-flex min-h-11 min-w-11 items-center transition-colors hover:text-accent"
                >
                  {thread.title}
                </Link>
              </CardTitle>
              {thread.clientName && (
                <CardDescription className="mt-0.5">
                  {thread.clientName}
                </CardDescription>
              )}
            </div>
            <Badge variant="secondary">
              {thread.sources.length}{" "}
              {thread.sources.length === 1 ? "source" : "sources"}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-5 bg-muted/40 p-5">
            {thread.sources.map((source) => (
              <div key={source.id}>
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="secondary">{source.source_type}</Badge>
                  {typeof source.metadata.from === "string" && (
                    <span>{String(source.metadata.from)}</span>
                  )}
                  <span>{timeAgo(source.created_at)}</span>
                </div>
                <SourceBubbles text={source.raw_content} />
              </div>
            ))}

            <AddSourceForm briefId={thread.briefId} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
