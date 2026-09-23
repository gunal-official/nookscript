/**
 * Types matching supabase/migrations/20260924090000_time_entries_schema.sql.
 * Per-workspace hours log. Duration is INTEGER MINUTES (house integer
 * precision); worked_on is the day the work happened (the log groups by
 * it, never by created_at); brief_id is optional (null = general time).
 */

export interface TimeEntry {
  id: string;
  workspace_id: string;
  /** null = general time (not attributed to a brief). */
  brief_id: string | null;
  description: string;
  /** "YYYY-MM-DD" — the day the work was done (backdateable). */
  worked_on: string;
  /** Whole minutes; the DB CHECK is the floor (>= 1). */
  duration_minutes: number;
  created_at: string;
  updated_at: string;
}

/** Payload for create/update (shared by the manual form and the timer). */
export interface TimeEntryInput {
  brief_id: string | null;
  description: string;
  worked_on: string; // "YYYY-MM-DD"
  duration_minutes: number;
}

/** Minimal brief row for pickers (the timer pill + the log form). */
export interface BriefOption {
  id: string;
  title: string;
}
