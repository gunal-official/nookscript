/**
 * Types matching supabase/migrations/20260925090000_contracts_schema.sql.
 * Per-workspace engagement agreements. The body is a single plain-text
 * terms field; 'expired' is derived from expires_on, never a status.
 */

export type ContractStatus = "draft" | "sent" | "signed" | "void";

export interface Contract {
  id: string;
  workspace_id: string;
  /** null = standalone (not attributed to a brief). */
  brief_id: string | null;
  /** Free text (UI datalists suggest brief client names). */
  client_name: string;
  title: string;
  status: ContractStatus;
  /** Plain-text agreement body. */
  terms: string;
  /** "YYYY-MM-DD" | null — a past date renders "expired" (derived). */
  expires_on: string | null;
  /** Client signatory's name (no e-sign — recorded cut). */
  signed_by: string;
  /** Stamped on first 'sent' (never overwritten). */
  sent_at: string | null;
  /** Stamped on 'signed'; cleared when leaving 'signed'. */
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Summary row for the /contracts list (as returned by getContracts). */
export interface ContractSummary {
  id: string;
  title: string;
  client_name: string;
  status: ContractStatus;
  brief_id: string | null;
  expires_on: string | null;
  updated_at: string;
}
