import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Brief,
  BriefQuestion,
  BriefWithDetails,
  EditableBriefField,
} from "@/lib/types/brief";

/**
 * Server-side data access for briefs. Every function uses the
 * cookie-authenticated server client, so RLS scopes all reads/writes to
 * workspaces the current user belongs to. Call only with an active session
 * (from Server Components or Server Actions under /(app)).
 */

/** All briefs for a workspace, newest first. */
export async function getBriefsForWorkspace(
  workspaceId: string
): Promise<Brief[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("briefs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Brief[];
}

/** A single brief with sources, questions, and edit history nested.
 *  Sources/questions oldest-first; edit history newest-first.
 *  Returns null when not found (or not visible via RLS). */
export async function getBriefById(
  briefId: string
): Promise<BriefWithDetails | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("briefs")
    .select(
      "*, sources:brief_sources(*), questions:brief_questions(*), edit_history:brief_edit_history(*)"
    )
    .eq("id", briefId)
    .order("created_at", { referencedTable: "brief_sources", ascending: true })
    .order("created_at", { referencedTable: "brief_questions", ascending: true })
    .order("created_at", {
      referencedTable: "brief_edit_history",
      ascending: false,
    })
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as BriefWithDetails | null;
}

/** Insert a new brief for a workspace and return it.
 *  Only `title` gets a fallback; everything else comes from `data`. */
export async function createBrief(
  workspaceId: string,
  data: Partial<Brief>
): Promise<Brief> {
  const supabase = createClient();

  const { data: inserted, error } = await supabase
    .from("briefs")
    .insert({
      workspace_id: workspaceId,
      title: data.title?.trim() || "Untitled brief",
      objective: data.objective ?? null,
      deliverables: data.deliverables ?? [],
      budget_timeline: data.budget_timeline ?? null,
      status: data.status ?? "draft",
      owner_id: data.owner_id ?? null,
      client_name: data.client_name ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return inserted as Brief;
}

/**
 * Update ONE brief field and append the matching brief_edit_history row.
 * Both writes happen inside the update_brief_field() RPC, i.e. a single
 * transaction. The field whitelist lives in the RPC ('status' is excluded
 * on purpose — change status via a plain update so the status trigger can
 * log old → new).
 *
 * `userId` is the acting user; callers (server actions) must source it from
 * the session, never from client input.
 */
export async function updateBriefField(
  briefId: string,
  field: EditableBriefField,
  value: unknown,
  userId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.rpc("update_brief_field", {
    brief_uuid: briefId,
    field_name: field,
    new_value: value,
    editor_id: userId,
  });

  if (error) throw error;
}

/**
 * Mark a question resolved with its answer text and attribution.
 * Also appends a 'question_resolved' edit-history entry for the brief
 * (two sequential writes — the question update is the source of truth).
 * Returns the updated question.
 */
export async function resolveQuestion(
  questionId: string,
  answerText: string,
  answeredBy: string
): Promise<BriefQuestion> {
  const supabase = createClient();

  const { data: question, error } = await supabase
    .from("brief_questions")
    .update({
      status: "resolved",
      answer_text: answerText,
      answered_by: answeredBy,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", questionId)
    .select("*")
    .single();

  if (error) throw error;

  const q = question as BriefQuestion;

  const snippet =
    q.question_text.length > 80
      ? `${q.question_text.slice(0, 79)}…`
      : q.question_text;

  const { error: historyError } = await supabase
    .from("brief_edit_history")
    .insert({
      brief_id: q.brief_id,
      user_id: null, // resolution may be by the client; attribution is in answered_by
      action_type: "question_resolved",
      description: `resolved question “${snippet}”`,
    });

  if (historyError) throw historyError;

  return q;
}
