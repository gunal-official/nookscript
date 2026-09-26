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

/** Human labels for the Activity surface (suggestions pass 8/10).
 *  Kept in lockstep with EVENT_TYPES; unknown types fall back to the
 *  raw string (forward-safe). */
export const EVENT_LABELS: Record<string, string> = {
  "brief.created": "Brief created",
  "proposal.accepted": "Proposal accepted",
  "proposal.declined": "Proposal declined",
  "plan.task_completed": "Plan task completed",
  "invoice.paid": "Invoice paid",
  "contract.signed": "Contract signed",
  "team.member.joined": "Member joined",
  "team.member.left": "Member left",
  "team.member.removed": "Member removed",
  "template.created": "Template created",
};

export function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType;
}

/** One short identifying detail for a log line (title-level facts only —
 *  never money or bodies, per the events design decisions). */
export function eventDetail(event: {
  event_type: string;
  payload: Record<string, unknown> | null;
}): string {
  const p = event.payload ?? {};
  if (event.event_type === "invoice.paid" && typeof p.invoice_number === "number") {
    return `Invoice #${p.invoice_number}`;
  }
  if (event.event_type === "plan.task_completed" && typeof p.task_text === "string") {
    return p.task_text;
  }
  if (typeof p.title === "string" && p.title) return p.title;
  return "";
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
