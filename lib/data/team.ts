import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-side reads for the /settings Team card and the public /invite
 * page (Step 15). Cookie-authenticated where a session exists; the invite
 * preview RPC is executable by PUBLIC, so the same call works for
 * anonymous link-openers too.
 */

export interface TeamMember {
  user_id: string;
  full_name: string | null;
  avatar_initials: string | null;
  role: "owner" | "member" | "viewer";
  joined_at: string;
}

/** Members of the caller's first-joined workspace, oldest first. Empty
 *  when logged out or workspace-less. Email addresses are deliberately
 *  NOT exposed by the RPC — names, initials, role, joined-at only. */
export async function getTeamMembers(): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_workspace_members");
  if (error || !data) return [];
  return data as TeamMember[];
}

export interface PendingInvite {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  created_at: string;
}

/** Live (not accepted / revoked / expired) invites for the caller's
 *  workspace, newest first. RLS on team_invites is owner-only, so members
 *  always receive an empty list here. */
export async function getPendingInvites(): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_invites")
    .select("id, email, token, expires_at, created_at")
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as PendingInvite[];
}

export interface TeamInvitePreview {
  workspace_name: string;
  expires_at: string;
}

/** Public pre-auth probe. Null for invalid, revoked, accepted, or expired
 *  tokens — all four states are deliberately indistinguishable, and the
 *  invited email is never exposed before the accept attempt. */
export async function getTeamInvitePreview(
  token: string
): Promise<TeamInvitePreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_team_invite_preview", {
    p_token: token,
  });
  if (error || !data || data.length === 0) return null;
  return data[0] as TeamInvitePreview;
}
