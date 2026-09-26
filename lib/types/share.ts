/**
 * Types matching supabase/migrations/20260923030000_share_links_schema.sql.
 */

import type { UpdateStatus } from "@/lib/types/update";

/** Full share_links row — only ever visible to workspace members (the
 *  table is fully member-gated; public visitors never see this shape). */
export interface ShareLink {
  id: string;
  workspace_id: string;
  /** The shared update (unique in the DB — one link per update). */
  update_id: string;
  /** Public address of the share: /share/<token>. Unguessable uuid v4. */
  token: string;
  /** null while the link is active. */
  revoked_at: string | null;
  created_at: string; // timestamptz → ISO string
}

/** The public-safe payload returned by the get_shared_document() RPC —
 *  exactly the update's display fields, no ids of any kind. */
export interface SharedDocument {
  title: string;
  client_name: string | null;
  status: UpdateStatus;
  body: string;
  updated_at: string;
}
