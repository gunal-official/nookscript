"use server";

/**
 * Server actions for /briefs/[id].
 *
 * TESTING (local, after README Step 2–3 setup + seed data):
 *   1. Open /briefs/00000000-0000-0000-0000-000000000010 (seeded brief).
 *   2. Change the status dropdown → Table Editor shows briefs.status
 *      updated AND a 'status_changed' row in brief_edit_history (trigger).
 *   3. Resolve the open question → it moves from Open to Resolved and a
 *      'question_resolved' history row appears.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBriefById, resolveQuestion } from "@/lib/data/briefs";
import { requireEditor } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import type { BriefStatus } from "@/lib/types/brief";

export type ActionResult = { error?: string } | undefined;

export async function resolveBriefQuestion(input: {
  briefId: string;
  questionId: string;
  answerText: string;
  answeredBy: string;
}): Promise<ActionResult> {
  if (!input.answerText?.trim()) return { error: "Answer is required." };
  if (!input.answeredBy?.trim()) return { error: "Who answered is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  try {
    // Marks the question resolved and appends 'question_resolved' history.
    // RLS ensures the question belongs to one of the user's workspaces.
    await resolveQuestion(
      input.questionId,
      input.answerText.trim(),
      input.answeredBy.trim()
    );
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not resolve the question.",
    };
  }

  revalidatePath(`/briefs/${input.briefId}`);
  return { error: undefined };
}

const VALID_STATUSES: BriefStatus[] = ["draft", "in_review", "approved"];

export async function updateBriefStatus(input: {
  briefId: string;
  status: BriefStatus;
}): Promise<ActionResult> {
  if (!VALID_STATUSES.includes(input.status)) {
    return { error: "Invalid status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // Plain UPDATE: the BEFORE UPDATE trigger logs 'status_changed'
  // (old → new) into brief_edit_history with auth.uid() as the actor.
  const { error } = await supabase
    .from("briefs")
    .update({ status: input.status })
    .eq("id", input.briefId);

  if (error) return { error: error.message };

  revalidatePath(`/briefs/${input.briefId}`);
  revalidatePath("/briefs");
  return { error: undefined };
}

/**
 * Generate a proposal from a brief: copies title / client / budget /
 * deliverables verbatim (deterministic — no AI in this step), inserts the
 * proposals row as 'draft', then redirects to the new proposal's page.
 * All queries go through the session client, so RLS blocks briefs outside
 * the user's workspaces (getBriefById returns null → "Brief not found.").
 */
export async function createProposalFromBrief(input: {
  briefId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  const brief = await getBriefById(input.briefId);
  if (!brief) return { error: "Brief not found." };

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      workspace_id: brief.workspace_id,
      brief_id: brief.id,
      title: brief.title,
      client_name: brief.client_name,
      budget_timeline: brief.budget_timeline,
      deliverables: brief.deliverables,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  if (!proposal) return { error: "Could not create the proposal." };

  revalidatePath("/proposals");
  // throws NEXT_REDIRECT — intentionally not wrapped in try/catch
  redirect(`/proposals/${proposal.id}`);
}
