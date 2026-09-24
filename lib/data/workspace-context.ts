import "server-only";

import { persistActiveWorkspacePointer } from "@/lib/active-pointer";
import { createClient } from "@/lib/supabase/server";

/**
 * Active-workspace resolver (Step 16) — THE single place "which workspace
 * is the user looking at" gets decided. Everything in (app) resolves
 * through this instead of the old per-file first-joined membership reads.
 *
 * Resolution rule (mirrors get_workspace_members() in the DB):
 *   1. profiles.active_workspace_id, if it points at a workspace the
 *      caller actually belongs to;
 *   2. otherwise the first-joined membership (covers NULL pointers — all
 *      pre-switcher accounts — and self-heals stale ones).
 *
 * RLS stays the security gate (membership-scoped). The active id exists
 * so list reads can pin an explicit .eq("workspace_id", …) filter and a
 * multi-workspace user never sees two workspaces' rows merged.
 *
 * Stale-pointer cleanup (Step 25): a set-but-wrong pointer is healed
 * here AND persisted (lib/active-pointer), so the stored row converges
 * on the user's next visit. NULL pointers are the documented "unset"
 * state and are deliberately left NULL.
 */

export interface WorkspaceSummary {
  id: string;
  name: string;
}

export interface WorkspaceContext {
  /** Active workspace id — the one all list/creation scoping should use. */
  id: string;
  name: string;
  role: "owner" | "member";
  /** Every membership, oldest first — the switcher lists these. */
  workspaces: WorkspaceSummary[];
}

type MembershipRow = {
  workspace_id: string;
  role: string;
  workspace:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};

export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: membershipData }, { data: profile }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("workspace_id, role, workspace:workspaces(id, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("active_workspace_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const memberships = (membershipData ?? []) as MembershipRow[];
  if (memberships.length === 0) return null;

  const toSummary = (m: MembershipRow): WorkspaceSummary | null => {
    const w = Array.isArray(m.workspace) ? m.workspace[0] : m.workspace;
    return w ? { id: w.id, name: w.name } : null;
  };

  const workspaces = memberships
    .map(toSummary)
    .filter((w): w is WorkspaceSummary => w !== null);

  const pointer = (profile as { active_workspace_id?: string | null } | null)
    ?.active_workspace_id;
  const active =
    memberships.find((m) => m.workspace_id === pointer) ?? memberships[0];
  const activeSummary = toSummary(active);
  if (!activeSummary) return null;

  // Stale-pointer cleanup (Step 25): pointer set but pointing OUTSIDE
  // the membership list → persist the healed id so the row converges.
  // Best-effort (the helper never throws); NULL stays NULL by design.
  if (pointer && active.workspace_id !== pointer) {
    await persistActiveWorkspacePointer(supabase, user.id, active.workspace_id);
  }

  return {
    id: active.workspace_id,
    name: activeSummary.name,
    role: (active.role ?? "member") as "owner" | "member",
    workspaces,
  };
}
