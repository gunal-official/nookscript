"use server";

/**
 * Server actions for /updates/[id].
 *
 * TESTING (local, after README setup + the updates migration + seed):
 *   1. Open a seeded update from /updates.
 *   2. Edit title/body in the composer → Save → updates.title/body update
 *      in the Table Editor; both /updates and this page stay in sync.
 *   3. Change the status dropdown (Draft ↔ Sent): updates.status updates;
 *      list badge matches after navigating back.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { UpdateStatus } from "@/lib/types/update";

export type ActionResult = { error?: string } | undefined;

const VALID_STATUSES: UpdateStatus[] = ["draft", "sent"];

export async function updateUpdateStatus(input: {
  updateId: string;
  status: UpdateStatus;
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
    .from("updates")
    .update({ status: input.status })
    .eq("id", input.updateId);

  if (error) return { error: error.message };

  revalidatePath("/updates");
  revalidatePath(`/updates/${input.updateId}`);
  return { error: undefined };
}

/** Manual save from the composer — no autosave, explicit user action. */
export async function saveUpdateContent(input: {
  updateId: string;
  title: string;
  body: string;
}): Promise<ActionResult> {
  if (!input.title?.trim()) return { error: "Title is required." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session has expired. Please log in again." };

  const { error } = await supabase
    .from("updates")
    .update({ title: input.title.trim(), body: input.body ?? "" })
    .eq("id", input.updateId);

  if (error) return { error: error.message };

  revalidatePath(`/updates/${input.updateId}`);
  revalidatePath("/updates");
  return { error: undefined };
}
