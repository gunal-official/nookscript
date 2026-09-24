"use server";

/**
 * Server actions for /intake.
 *
 * TESTING (see also the header comment in app/(app)/intake/page.tsx):
 *   - generateBriefFromSource: called by the intake form on "Generate".
 *     Runs the AI/heuristic generator, then saves brief + source +
 *     questions atomically via the create_brief_bundle() RPC (Step 3/4
 *     migration).
 *   - saveBriefEdits: called by "Save brief"; each changed field goes
 *     through the update_brief_field() RPC so every edit is logged in
 *     brief_edit_history.
 */

import { revalidatePath } from "next/cache";

import { getWorkspaceContext, requireEditor } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import { generateBriefContent, type GeneratorEngine } from "@/lib/ai/brief-generator";
import type {
  Brief,
  BriefQuestion,
  BriefSource,
  EditableBriefField,
  SourceType,
} from "@/lib/types/brief";

export interface GeneratedBriefBundle {
  brief: Brief;
  source: BriefSource;
  questions: BriefQuestion[];
  /** Which parser produced this draft (shown in the UI as a notice). */
  engine: GeneratorEngine;
}

export type GenerateResult =
  | { data: GeneratedBriefBundle; error?: never }
  | { data?: never; error: string };

const MIN_SOURCE_CHARS = 20;
const MAX_SOURCE_CHARS = 20_000;

export async function generateBriefFromSource(input: {
  rawText: string;
  sourceType?: "email" | "call_notes" | "chat" | "manual";
}): Promise<GenerateResult> {
  const rawText = input.rawText ?? "";
  const trimmed = rawText.trim();

  if (trimmed.length < MIN_SOURCE_CHARS) {
    return { error: "Paste a bit more source text first — at least a sentence or two." };
  }
  if (rawText.length > MAX_SOURCE_CHARS) {
    return { error: `Source text is too long (${MAX_SOURCE_CHARS.toLocaleString()} characters max).` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session has expired. Please log in again." };
  }
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // Briefs are created in the ACTIVE workspace (Step 16 resolver) — the
  // one the sidebar is showing — never a background first-joined one.
  const context = await getWorkspaceContext();
  if (!context) {
    return { error: "No workspace found for your account." };
  }

  // 1. Parse the source (OpenAI when configured, deterministic heuristic otherwise)
  const { content, engine } = await generateBriefContent(trimmed);

  // 2. Persist brief + source + questions + 'generated' history in ONE
  //    transaction (server-side RPC).
  const { data: briefId, error } = await supabase.rpc("create_brief_bundle", {
    p_workspace_id: context.id,
    p_title: content.title,
    p_objective: content.objective,
    p_deliverables: content.deliverables,
    p_budget_timeline: content.budget_timeline,
    p_client_name: content.client_name,
    p_owner_id: user.id,
    p_source_type: input.sourceType ?? "manual",
    p_raw_content: trimmed,
    p_source_metadata: {
      pasted_at: new Date().toISOString(),
      char_count: trimmed.length,
      engine,
    },
    p_questions: content.questions,
  });

  if (error || !briefId) {
    return { error: error?.message ?? "Could not save the generated brief." };
  }

  // 3. Fetch the persisted rows back so the form edits real DB state.
  const [{ data: brief }, { data: source }, { data: questions }] =
    await Promise.all([
      supabase.from("briefs").select("*").eq("id", briefId).single(),
      supabase
        .from("brief_sources")
        .select("*")
        .eq("brief_id", briefId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single(),
      supabase
        .from("brief_questions")
        .select("*")
        .eq("brief_id", briefId)
        .order("created_at", { ascending: true }),
    ]);

  if (!brief) {
    return { error: "Brief was created but could not be loaded." };
  }

  revalidatePath("/briefs");

  return {
    data: {
      brief: brief as Brief,
      source: source as BriefSource,
      questions: (questions ?? []) as BriefQuestion[],
      engine,
    },
  };
}

const MIN_REPLY_CHARS = 5;

export type AddSourceResult = { error?: string } | undefined;

/**
 * Step 12 — thread a new source ("reply") onto an EXISTING brief, from
 * /intake/inbox or the brief detail Sources card. Goes through the
 * add_brief_source() RPC so the immutable brief_sources row and the
 * 'source_added' brief_edit_history entry are written atomically
 * (membership is re-checked inside the RPC — any workspace member may add).
 */
export async function addSourceToBrief(input: {
  briefId: string;
  sourceType: SourceType;
  rawContent: string;
}): Promise<AddSourceResult> {
  if (!input.briefId) return { error: "Missing brief id." };

  const rawContent = input.rawContent ?? "";
  const trimmed = rawContent.trim();

  if (trimmed.length < MIN_REPLY_CHARS) {
    return { error: "Write at least a short sentence — replies need some substance." };
  }
  if (rawContent.length > MAX_SOURCE_CHARS) {
    return { error: `Reply is too long (${MAX_SOURCE_CHARS.toLocaleString()} characters max).` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session has expired. Please log in again." };
  }
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  const { error } = await supabase.rpc("add_brief_source", {
    p_brief_id: input.briefId,
    p_source_type: input.sourceType,
    p_raw_content: trimmed,
    p_metadata: {
      pasted_at: new Date().toISOString(),
      char_count: trimmed.length,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Both views of the thread show the new source (server action re-renders
  // the current route; these cover navigation to the other surface).
  revalidatePath("/intake/inbox");
  revalidatePath(`/briefs/${input.briefId}`);

  return { error: undefined };
}

export type SaveEditsResult = { error?: string } | undefined;

export async function saveBriefEdits(input: {
  briefId: string;
  changes: { field: EditableBriefField; value: unknown }[];
}): Promise<SaveEditsResult> {
  if (!input.briefId) return { error: "Missing brief id." };
  if (!input.changes?.length) return { error: "Nothing to save." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session has expired. Please log in again." };
  }
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // Each changed field: one RPC call (atomic field update + history entry).
  // The whitelist + membership check live inside update_brief_field().
  for (const change of input.changes) {
    const { error } = await supabase.rpc("update_brief_field", {
      brief_uuid: input.briefId,
      field_name: change.field,
      new_value: change.value,
      editor_id: user.id, // from the server session — never client-supplied
    });

    if (error) {
      return { error: `Could not save ${change.field}: ${error.message}` };
    }
  }

  revalidatePath(`/briefs/${input.briefId}`);

  return { error: undefined };
}
