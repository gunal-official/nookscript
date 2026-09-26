"use server";

/**
 * Server actions for /time (Step 18). Create/edit/delete — the ONLY
 * feature with a delete, and only for time entries: a personal work log,
 * not an audit record (the documented exception to the no-delete pattern;
 * the member DELETE policy is the only one in the schema).
 *
 * Every write pins the caller's ACTIVE workspace (Step 16 resolver) and
 * is RLS-scoped, so a foreign-workspace id is a silent no-op, never a
 * cross-tenant write.
 */

import { revalidatePath } from "next/cache";

import { getWorkspaceContext, requireEditor } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import type { TimeEntryInput } from "@/lib/types/time";

export type TimeActionResult = { error?: string } | undefined;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validate(input: TimeEntryInput): string | undefined {
  const description = input.description?.trim() ?? "";
  if (!description) return "Description is required.";

  const minutes = input.duration_minutes;
  if (!Number.isInteger(minutes) || minutes < 1) {
    return "Duration must be a whole number of minutes (at least 1).";
  }

  const workedOn = input.worked_on?.trim() ?? "";
  if (!DATE_RE.test(workedOn) || Number.isNaN(Date.parse(workedOn))) {
    return "Pick a valid date.";
  }

  const briefId = input.brief_id ?? null;
  if (briefId !== null && !isUuid(briefId)) return "Unknown brief.";

  return undefined;
}

async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return supabase;
}

/** Log a new entry (manual form on /time OR the floating timer's stop
 *  form — both write through this). */
export async function logTimeAction(
  input: TimeEntryInput
): Promise<TimeActionResult> {
  const invalid = validate(input);
  if (invalid) return { error: invalid };

  const supabase = await requireSession();
  if (!supabase)
    return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  const context = await getWorkspaceContext();
  if (!context) {
    return { error: "Your session has expired. Please log in again." };
  }

  const { error } = await supabase
    .from("time_entries")
    .insert({
      workspace_id: context.id,
      brief_id: input.brief_id ?? null,
      description: input.description.trim(),
      worked_on: input.worked_on,
      duration_minutes: input.duration_minutes,
    });

  if (error) return { error: error.message };

  revalidatePath("/time");
  return { error: undefined };
}

/** Edit an existing entry (all four fields, same form as create). */
export async function updateTimeAction(
  input: { id: string } & TimeEntryInput
): Promise<TimeActionResult> {
  if (!isUuid(input.id)) return { error: "Unknown entry." };
  const invalid = validate(input);
  if (invalid) return { error: invalid };

  const supabase = await requireSession();
  if (!supabase)
    return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  const { error } = await supabase
    .from("time_entries")
    .update({
      brief_id: input.brief_id ?? null,
      description: input.description.trim(),
      worked_on: input.worked_on,
      duration_minutes: input.duration_minutes,
    })
    .eq("id", input.id);

  if (error) return { error: error.message };

  revalidatePath("/time");
  return { error: undefined };
}

/** Delete an entry — the one destructive action in the product. */
export async function deleteTimeAction(input: {
  id: string;
}): Promise<TimeActionResult> {
  if (!isUuid(input.id)) return { error: "Unknown entry." };

  const supabase = await requireSession();
  if (!supabase)
    return { error: "Your session has expired. Please log in again." };
  const viewerGuard = await requireEditor();
  if (viewerGuard) return viewerGuard;

  // RLS makes a foreign-workspace id a zero-row no-op; surface it so the
  // UI never pretends it deleted something it couldn't see.
  const { data, error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", input.id)
    .select("id");

  if (error) return { error: error.message };
  if ((data ?? []).length === 0) {
    return { error: "Entry not found or already deleted." };
  }

  revalidatePath("/time");
  return { error: undefined };
}
