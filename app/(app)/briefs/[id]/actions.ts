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

import { resolveQuestion } from "@/lib/data/briefs";
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

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };

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

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };

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
