/**
 * Types matching supabase/migrations/20260922123000_briefs_schema.sql.
 * Keep these in sync with the database schema (checked constraints are
 * reflected as union types).
 */

export type BriefStatus = "draft" | "in_review" | "approved";

export type SourceType = "email" | "call_notes" | "chat" | "manual";

export type QuestionStatus = "open" | "resolved";

/** Known history actions; the column is unconstrained text in the DB so
 *  future action types don't require a migration. */
export type BriefEditActionType =
  | "generated"
  | "field_edited"
  | "question_resolved"
  | "status_changed"
  | (string & {});

/** Element of briefs.deliverables (jsonb). */
export interface BriefDeliverable {
  id: string;
  text: string;
  checked: boolean;
}

export interface Brief {
  id: string;
  workspace_id: string;
  title: string;
  objective: string | null;
  deliverables: BriefDeliverable[];
  budget_timeline: string | null;
  status: BriefStatus;
  owner_id: string | null;
  client_name: string | null;
  created_at: string; // timestamptz → ISO string
  updated_at: string;
}

export interface BriefSource {
  id: string;
  brief_id: string;
  source_type: SourceType;
  /** Original pasted text — immutable after creation (no UPDATE policy). */
  raw_content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BriefQuestion {
  id: string;
  brief_id: string;
  question_text: string;
  context_note: string | null;
  status: QuestionStatus;
  answer_text: string | null;
  answered_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface BriefEditHistoryEntry {
  id: string;
  brief_id: string;
  /** null when the edit was made by the system / AI. */
  user_id: string | null;
  action_type: BriefEditActionType;
  description: string;
  created_at: string;
}

/** Brief with its child records nested (as returned by getBriefById). */
export interface BriefWithDetails extends Brief {
  sources: BriefSource[];
  questions: BriefQuestion[];
  edit_history: BriefEditHistoryEntry[];
}

/** Editable fields allowed through updateBriefField (whitelist in the
 *  update_brief_field() RPC; 'status' is edited separately so the
 *  status-changed trigger can log old → new). */
export type EditableBriefField =
  | "title"
  | "objective"
  | "deliverables"
  | "budget_timeline"
  | "client_name"
  | "owner_id";
