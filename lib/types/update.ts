/**
 * Types matching supabase/migrations/20260923020000_updates_schema.sql.
 * Updates are client-facing documents composed from a plan: an
 * auto-generated starting draft, then hand-edited before 'sent'.
 */

export type UpdateStatus = "draft" | "sent";

export interface Update {
  id: string;
  workspace_id: string;
  /** The plan this update was composed from (NOT NULL in the DB). */
  plan_id: string;
  title: string;
  client_name: string | null;
  status: UpdateStatus;
  /** Composed markdown content (never NULL — DB defaults to ''). */
  body: string;
  created_at: string; // timestamptz → ISO string
  updated_at: string;
}

/** Summary row for the /updates list (as returned by getUpdates). The
 *  excerpt is a whitespace-collapsed preview of the body — updates have
 *  no numeric count like tasks/deliverables, so a preview line is the
 *  card's secondary signal. */
export interface UpdateSummary {
  id: string;
  title: string;
  client_name: string | null;
  status: UpdateStatus;
  updated_at: string;
  excerpt: string;
}

/** Update with its source plan embedded (as returned by getUpdateById) —
 *  powers the "View source plan" link on the detail page. */
export interface UpdateWithPlan extends Update {
  plan: { id: string; title: string } | null;
}
