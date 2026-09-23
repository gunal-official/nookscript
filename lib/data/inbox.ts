import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { BriefSource } from "@/lib/types/brief";
import type { InboxThread } from "@/lib/types/inbox";

/**
 * Server-side data access for /intake/inbox (Step 12): every brief_sources
 * row in the caller's workspace, grouped into per-brief threads.
 *
 * Reads only — writes go through the add_brief_source() RPC. Scoped to the
 * caller's first-joined workspace explicitly (RLS would also hide other
 * tenants, but the inbox is a per-workspace view like the other lists).
 * Returns null on error so the page can render a load-error state instead
 * of crashing the route.
 */
export async function getInboxThreads(): Promise<InboxThread[] | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) return null;
  if (!membership) return []; // no workspace yet → empty inbox, not an error

  const { data, error } = await supabase
    .from("briefs")
    .select("id, title, client_name, sources:brief_sources(*)")
    .eq("workspace_id", membership.workspace_id)
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
