/**
 * Workspace event log (Phase: events/webhooks foundation) — the thin
 * writer for public.events. recordEvent() NEVER throws: event recording
 * must not break the state transition that triggered it (the invite-email
 * precedent); failures are logged server-side and the user flow continues.
 */

import type { createClient } from "@/lib/supabase/server";
import { dispatchWebhooks } from "./webhook-dispatch.ts";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The six recorded transitions (kept in lockstep with the events table's
 *  event_type CHECK constraint — see supabase/migrations/20260926080000). */
export const EVENT_TYPES = [
  "brief.created",
  "proposal.accepted",
  "proposal.declined",
  "plan.task_completed",
  "invoice.paid",
  "contract.signed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export async function recordEvent(
  supabase: Supabase,
  event: {
    workspace_id: string;
    event_type: EventType;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const { data: row, error } = await supabase
      .from("events")
      .insert({
        workspace_id: event.workspace_id,
        event_type: event.event_type,
        payload: event.payload,
      })
      .select("id, workspace_id, event_type, payload, created_at")
      .single();
    if (error) throw new Error(error.message);
    // Outbound webhooks ride the same event, best-effort — never awaited
    // into the user's action path (lib/webhook-dispatch.ts semantics).
    if (row) void dispatchWebhooks(supabase, row);
  } catch (err) {
    console.error(`[events] failed to record ${event.event_type}:`, err);
  }
}
