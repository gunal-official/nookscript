/**
 * Types matching supabase/migrations/20260923010000_plans_schema.sql.
 * Tasks share the {id, text, checked} element shape with deliverables, so
 * the element type is aliased rather than duplicated.
 */

import type { BriefDeliverable } from "@/lib/types/brief";

export type PlanStatus = "not_started" | "in_progress" | "done";

/** Element of plans.tasks (jsonb) — same shape as a deliverable. */
export type PlanTask = BriefDeliverable;

export interface Plan {
  id: string;
  workspace_id: string;
  /** The proposal this plan was generated from (NOT NULL in the DB). */
  proposal_id: string;
  title: string;
  client_name: string | null;
  status: PlanStatus;
  budget_timeline: string | null;
  tasks: PlanTask[];
  created_at: string; // timestamptz → ISO string
  updated_at: string;
}

/** Summary row for the /plans list (as returned by getPlans). */
export interface PlanSummary {
  id: string;
  title: string;
  client_name: string | null;
  status: PlanStatus;
  updated_at: string;
  tasksTotal: number;
  tasksDone: number;
}

/** Plan with its source proposal embedded (as returned by getPlanById) —
 *  powers the "View source proposal" link on the detail page. */
export interface PlanWithProposal extends Plan {
  proposal: { id: string; title: string } | null;
}
