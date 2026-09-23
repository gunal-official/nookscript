/**
 * /intake/inbox — the workspace-wide source inbox (Step 12).
 *
 * HOW TO TEST (locally — requires the Supabase setup from README.md):
 *   ⚠ Apply the add_brief_source migration first (see README "Verify
 *   Step 12") — without it, "Add to thread" replies fail server-side.
 *   1. Sign up / log in (Step 2), then run supabase/seed.sql.
 *   2. Open /intake/inbox: the Brightloop thread shows BOTH seeded emails
 *      (kickoff + the phase-two follow-up), bubbles oldest-first; threads
 *      sort by most recent source.
 *   3. Type a reply in "Thread a follow-up" → Add to thread: an optimistic
 *      bubble appears, then the real row lands — the reply ALSO shows on
 *      /briefs/[id]'s Sources card and a 'source_added' entry appears in
 *      that brief's History.
 *   4. Generate a new brief from /intake → its source becomes a new thread
 *      here immediately.
 */

import { MessageSquare } from "lucide-react";

import { getInboxThreads } from "@/lib/data/inbox";
import { InboxThreadList } from "@/components/intake/InboxThreadList";

export default async function IntakeInboxPage() {
  const threads = await getInboxThreads();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every client message across every brief, as a running thread.
        </p>
      </div>

      {threads === null ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Couldn&apos;t load the inbox</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Refresh to retry. If this persists, check your Supabase
            connection — and that the migrations and seed have been applied
            (see README).
          </p>
        </div>
      ) : (
        <InboxThreadList threads={threads} />
      )}
    </div>
  );
}
