import "server-only";

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import type { BriefSource } from "@/lib/types/brief";
import type { InboxThread } from "@/lib/types/inbox";

/**
 * Server-side data access for /intake/inbox (Step 12): every brief_sources
 * row in the caller's ACTIVE workspace (Step 16 resolver), grouped into
 * per-brief threads.
 *
 * Reads only — writes go through the add_brief_source() RPC. RLS is the
 * security gate; the explicit workspace filter keeps the inbox a
 * per-workspace view like the other lists. Returns null on error so the
 * page can render a load-error state instead of crashing the route.
 */
export async function getInboxThreads(): Promise<InboxThread[] | null> {
  const supabase = await createClient();

  const context = await getWorkspaceContext();
  // No workspace yet → empty inbox, not an error.
  if (!context) return [];

  const { data, error } = await supabase
    .from("briefs")
    .select("id, title, client_name, sources:brief_sources(*)")
    .eq("workspace_id", context.id)
    .order("title", { ascending: true })
    .order("created_at", { referencedTable: "brief_sources", ascending: true });

  if (error) return null;

  const threads: InboxThread[] = (data ?? [])
    .filter((brief) => (brief.sources as BriefSource[] | null)?.length)
    .map((brief) => ({
      briefId: brief.id as string,
      title: brief.title as string,
      clientName: (brief.client_name as string | null) ?? null,
      sources: (brief.sources ?? []) as BriefSource[],
    }));

  // Most recently active thread first (a thread's recency = its newest source)
  threads.sort((a, b) =>
    (b.sources[b.sources.length - 1]?.created_at ?? "").localeCompare(
      a.sources[a.sources.length - 1]?.created_at ?? ""
    )
  );

  return threads;
}
