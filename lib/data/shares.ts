import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ShareLink, SharedDocument } from "@/lib/types/share";

/**
 * Data access for share links.
 *
 * getShareLinkForUpdate() is a MEMBER call (used on the update detail
 * page) — RLS on share_links scopes it to the caller's workspaces.
 *
 * getSharedDocumentByToken() is the PUBLIC path (used by /share/[token]):
 * the caller typically has no session at all, so the client runs as anon.
 * It never touches share_links directly — access goes through the
 * get_shared_document SECURITY DEFINER RPC, which validates the token and
 * returns only public fields (zero rows for invalid OR revoked — the two
 * are indistinguishable by design).
 */

/** The member-facing view of an update's share link, if one exists. */
export async function getShareLinkForUpdate(
  updateId: string
): Promise<ShareLink | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("share_links")
    .select("*")
    .eq("update_id", updateId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ShareLink | null;
}

/** Public, token-gated fetch of a shared update. Works with no session.
 *  Returns null for invalid or revoked tokens (identically). */
export async function getSharedDocumentByToken(
  token: string
): Promise<SharedDocument | null> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_shared_document", {
    p_token: token,
  });

  if (error) throw error;

  const rows = (data ?? []) as SharedDocument[];
  return rows[0] ?? null;
}
