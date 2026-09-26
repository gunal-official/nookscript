/**
 * Active-workspace pointer hygiene (Step 25 — the stale-pointer
 * follow-up to the Step-16 resolver and Step-21 member removal).
 *
 * `profiles.active_workspace_id` is a POINTER at a workspace the user
 * belongs to. It can go stale exactly one way in current code: the
 * owner removes the user from the workspace the pointer names. Reads
 * were never broken — the Step-16 resolver self-heals (falls back to
 * the first-joined membership) — but the row stayed wrong. These two
 * helpers clean that residue:
 *
 *   - clearActiveWorkspaceIfPointingAt — called by the removal action:
 *     clears the REMOVED USER's pointer when it names the workspace
 *     they just left (0 rows touched otherwise — the eq filter IS the
 *     "if", so a healthy pointer elsewhere is never disturbed);
 *   - persistActiveWorkspacePointer — called by the resolver when it
 *     heals a stale pointer (SET-BUT-WRONG only; NULL is the documented
 *     "unset" state for pre-switcher accounts and is left alone), so
 *     the row converges on the user's next visit.
 *
 * Both are BEST-EFFORT: they never throw, never block their caller
 * (the removal still succeeds, the render still resolves), and the
 * resolver's read-time self-heal remains the correctness guarantee —
 * this module only makes the stored row match reality.
 *
 * No next/ imports (same testability shape as lib/invite-email): the
 * caller passes its Supabase client in.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Clear `active_workspace_id` iff it currently points AT
 *  `workspaceId`. Safe for any caller holding an RLS context that may
 *  update the target's profile row (own row, or the owner-side
 *  maintenance path in the removal action). */
export async function clearActiveWorkspaceIfPointingAt(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({ active_workspace_id: null })
      .eq("id", userId)
      .eq("active_workspace_id", workspaceId);
  } catch {
    // hygiene only — reads self-heal regardless
  }
}

/** Persist the resolver's healed choice for a stale pointer. Only ever
 *  called with a workspace the user IS a member of. */
export async function persistActiveWorkspacePointer(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({ active_workspace_id: workspaceId })
      .eq("id", userId);
  } catch {
    // hygiene only — reads self-heal regardless
  }
}
