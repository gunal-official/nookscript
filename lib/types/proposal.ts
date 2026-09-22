/**
 * Types matching supabase/migrations/20260923000000_proposals_schema.sql.
 * Proposals share the deliverables element shape with briefs, so the
 * element type is imported rather than duplicated.
 */

import type { BriefDeliverable } from "@/lib/types/brief";

export type ProposalStatus = "draft" | "sent" | "accepted" | "declined";

export interface Proposal {
  id: string;
  workspace_id: string;
  /** The brief this proposal was generated from (NOT NULL in the DB). */
  brief_id: string;
  title: string;
  client_name: string | null;
  status: ProposalStatus;
  budget_timeline: string | null;
  deliverables: BriefDeliverable[];
  created_at: string; // timestamptz → ISO string
  updated_at: string;
}

/** Summary row for the /proposals list (as returned by getProposals). */
export interface ProposalSummary {
  id: string;
  title: string;
  client_name: string | null;
  status: ProposalStatus;
  updated_at: string;
  deliverablesTotal: number;
  deliverablesDone: number;
}

/** Proposal with its source brief embedded (as returned by
 *  getProposalById) — powers the "View source brief" link on the detail
 *  page. */
export interface ProposalWithBrief extends Proposal {
  brief: { id: string; title: string } | null;
}
