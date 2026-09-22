"use server";

/**
 * Server actions for /plans/[id].
 *
 * TESTING (local, after README setup + migration + seed applied):
 *   1. Open the seeded plan from /plans ("Brightloop Co.").
 *   2. Toggle a task checkbox → plans.tasks flips in the Table Editor, and
 *      both /plans (badge count) and this page stay in sync.
 *   3. Change the status dropdown → plans.status updates; list badge
 *      matches after navigating back (both paths revalidated here).
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { PlanStatus, PlanTask } from "@/lib/types/plan";

export type ActionResult = { error?: string } | undefined;

const VALID_STATUSES: PlanStatus[] = ["not_started", "in_progress", "done"];

export async function updatePlanStatus(input: {
  planId: string;
  status: PlanStatus;
}): Promise<ActionResult> {
  if (!VALID_STATUSES.includes(input.status)) {
    return { error: "Invalid status." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };

  // Plain UPDATE; RLS scopes it to the user's workspaces.
  const { error } = await supabase
    .from("plans")
    .update({ status: input.status })
    .eq("id", input.planId);

  if (error) return { error: error.message };

  revalidatePath("/plans");
  revalidatePath(`/plans/${input.planId}`);
  return { error: undefined };
}

/**
 * Flip one task's `checked` inside the tasks jsonb array and write the
 * whole array back (read-modify-write — fine at single-editor scale; the
 * touch trigger advances updated_at so the list view re-sorts honestly).
 */
export async function toggleTask(input: {
  planId: string;
  taskId: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };

  const { data: plan, error: fetchError } = await supabase
    .from("plans")
    .select("tasks")
    .eq("id", input.planId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!plan) return { error: "Plan not found." };

  const tasks = ((plan.tasks ?? []) as PlanTask[]).map((task) =>
    task.id === input.taskId ? { ...task, checked: !task.checked } : task
  );

  const { error } = await supabase
    .from("plans")
    .update({ tasks })
    .eq("id", input.planId);

  if (error) return { error: error.message };

  revalidatePath(`/plans/${input.planId}`);
  revalidatePath("/plans");
  return { error: undefined };
}
