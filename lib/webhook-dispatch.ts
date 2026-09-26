/**
 * Outbound webhook dispatch (Phase: events/webhooks foundation; extended
 * in suggestions pass 4/10 with the serverless-safe retry schedule) — the
 * impure half: loads a workspace's endpoints, POSTs each event with an
 * HMAC signature, and keeps the webhook_deliveries row honest.
 *
 * DELIVERY SEMANTICS (accepted, documented):
 *   * Attempt 1 fires immediately (never awaited into the user's action
 *     path). Retries ride in-process timers on long-lived servers
 *     (next dev / node).
 *   * Every retry — timer OR cron — must first win the ATOMIC CLAIM
 *     (claimDeliveryRetry): a conditional UPDATE that leases the row for
 *     1h. Two contenders are serialized by the Postgres row lock; the
 *     loser's WHERE re-check fails and it delivers nothing.
 *   * When a serverless process freezes mid-schedule it loses its
 *     timers; the rows stay 'pending' with next_retry_at due, and the
 *     CRON_SECRET-gated sweep (app/api/cron/webhooks →
 *     reprocessDueDeliveries, service-role client) claims and
 *     redelivers them. The 1h lease is the double-delivery guard AND the
 *     loss window (claim-then-die ⇒ retried at the next sweep after the
 *     lease lapses).
 *   * 3 attempts total (15s / 60s backoff); the row then becomes
 *     terminal 'failed' with last_error for the settings card.
 *   * Fresh rows (next_retry_at NULL — the process froze between the
 *     upsert and the first fetch) are claimable by the sweep too. The
 *     in-process first attempt does not claim, so in that rare window
 *     both actors can attempt: duplicate delivery is accepted because
 *     the envelope id is the stable event id (receivers dedupe on it).
 *
 * See supabase/migrations/20260926110000_webhook_retry_schedule.sql for
 * why the claim is a raw conditional update and NOT a SQL function.
 */

import type { createClient } from "@/lib/supabase/server";

import {
  backoffForAttempt,
  buildDeliveryBody,
  buildDeliveryHeaders,
} from "./webhooks.ts";

export type Supabase = Awaited<ReturnType<typeof createClient>>;

export type DispatchableEvent = {
  id: string;
  workspace_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type Endpoint = { id: string; url: string; signing_secret: string };

type SendOutcome = { ok: true; status: number } | { ok: false; error: string };

/** Claim lease = double-delivery guard (migration header explains). */
const CLAIM_LEASE_MS = 3_600_000;
/** Rows per sweep run — bounded so one slow receiver can't stall cron. */
export const SWEEP_LIMIT = 25;

export async function dispatchWebhooks(
  supabase: Supabase,
  event: DispatchableEvent
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc(
      "get_workspace_webhook_endpoints",
      { p_workspace_id: event.workspace_id }
    );
    if (error) throw new Error(error.message);
    for (const endpoint of data ?? []) {
      void deliverToEndpoint(
        supabase,
        {
          id: endpoint.id,
          url: endpoint.url,
          signing_secret: endpoint.signing_secret,
        },
        event
      );
    }
  } catch (err) {
    console.error("[webhooks] dispatch failed:", err);
  }
}

async function deliverToEndpoint(
  supabase: Supabase,
  endpoint: Endpoint,
  event: DispatchableEvent
): Promise<void> {
  try {
    const { data: delivery, error } = await supabase
      .from("webhook_deliveries")
      .upsert(
        {
          workspace_id: event.workspace_id,
          endpoint_id: endpoint.id,
          event_id: event.id,
          status: "pending",
        },
        { onConflict: "endpoint_id,event_id", ignoreDuplicates: false }
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (!delivery) throw new Error("delivery row missing");
    await attemptDelivery(supabase, delivery.id, endpoint, event, 1);
  } catch (err) {
    console.error("[webhooks] delivery setup failed:", err);
  }
}

/**
 * The CLAIM — the only gate before a retry attempt. Winner gets a 1h
 * lease; a row that is no longer pending, no longer due, or already
 * leased yields false and the caller delivers nothing. Works for both
 * the acting-user client (member UPDATE policy) and the service-role
 * client (bypasses RLS) — deliberately no SQL function (migration
 * header).
 */
export async function claimDeliveryRetry(
  supabase: Supabase,
  deliveryId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("webhook_deliveries")
      .update({
        next_retry_at: new Date(Date.now() + CLAIM_LEASE_MS).toISOString(),
      })
      .eq("id", deliveryId)
      .eq("status", "pending")
      // Due now (retry window open) OR never attempted yet (NULL — the
      // frozen-before-first-attempt window; see header).
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .select("id")
      .maybeSingle();
    return !error && data !== null;
  } catch {
    return false;
  }
}

/** One signed POST to the endpoint (shared by dispatch and the sweep). */
export async function sendToEndpoint(
  endpoint: Endpoint,
  event: DispatchableEvent,
  deliveryId: string
): Promise<SendOutcome> {
  const body = buildDeliveryBody(event);
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: buildDeliveryHeaders(
        body,
        endpoint.signing_secret,
        Math.floor(Date.now() / 1000),
        deliveryId,
        event.event_type
      ),
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

async function attemptDelivery(
  supabase: Supabase,
  deliveryId: string,
  endpoint: Endpoint,
  event: DispatchableEvent,
  attempt: number
): Promise<void> {
  if (attempt > 1) {
    // Retries must win the claim: a cron sweep (or a second timer) may
    // already have taken this window.
    if (!(await claimDeliveryRetry(supabase, deliveryId))) return;
  }

  const outcome = await sendToEndpoint(endpoint, event, deliveryId);
  const backoff = outcome.ok ? null : backoffForAttempt(attempt);
  try {
    await supabase
      .from("webhook_deliveries")
      .update(
        outcome.ok
          ? {
              status: "delivered",
              attempts: attempt,
              last_error: null,
              next_retry_at: null,
            }
          : {
              status: backoff === null ? "failed" : "pending",
              attempts: attempt,
              last_error: outcome.error,
              next_retry_at:
                backoff === null
                  ? null
                  : new Date(Date.now() + backoff).toISOString(),
            }
      )
      .eq("id", deliveryId);
  } catch (updateErr) {
    console.error("[webhooks] delivery update failed:", updateErr);
  }

  // The in-process timer is the FAST path; on a frozen serverless
  // process it never fires and the sweep picks the row up instead.
  if (backoff !== null) {
    setTimeout(() => {
      void attemptDelivery(supabase, deliveryId, endpoint, event, attempt + 1);
    }, backoff);
  }
}

export type SweepStats = {
  checked: number;
  delivered: number;
  stillPending: number;
  failed: number;
};

/**
 * The CRON sweep (suggestions pass 4/10) — redelivers 'pending'
 * deliveries whose retry window is open, after winning the claim for
 * each. SERVICE-ROLE client only (bypasses RLS; the route gates this
 * with CRON_SECRET). Bounded to SWEEP_LIMIT rows per run. A
 * still-pending row gets NO in-process timer here — on a cold lambda
 * the timer would be lost anyway; the next sweep re-claims.
 */
export async function reprocessDueDeliveries(
  supabase: Supabase
): Promise<SweepStats> {
  const stats: SweepStats = {
    checked: 0,
    delivered: 0,
    stillPending: 0,
    failed: 0,
  };
  const { data: due, error } = await supabase
    .from("webhook_deliveries")
    .select("id, endpoint_id, event_id, attempts")
    .eq("status", "pending")
    // Due now (indexed) or fresh-and-frozen (NULL — rare; header).
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order("next_retry_at", { ascending: true })
    .limit(SWEEP_LIMIT);
  if (error) throw new Error(error.message);

  for (const row of due ?? []) {
    stats.checked++;
    if (!(await claimDeliveryRetry(supabase, row.id))) continue;

    const [{ data: endpoint }, { data: event }] = await Promise.all([
      supabase
        .from("webhook_endpoints")
        .select("id, url, signing_secret")
        .eq("id", row.endpoint_id)
        .maybeSingle(),
      supabase
        .from("events")
        .select("id, workspace_id, event_type, payload, created_at")
        .eq("id", row.event_id)
        .maybeSingle(),
    ]);
    if (!endpoint || !event) {
      // The endpoint (or its workspace) was deleted while the delivery
      // was pending — the FK cascade should have removed the row; if it
      // didn't, stop retrying and record why.
      await safeRowUpdate(supabase, row.id, {
        status: "failed",
        last_error: "Endpoint or event no longer exists.",
        next_retry_at: null,
      });
      stats.failed++;
      continue;
    }

    const attempt = (row.attempts ?? 0) + 1;
    const outcome = await sendToEndpoint(endpoint, event, row.id);
    const backoff = outcome.ok ? null : backoffForAttempt(attempt);
    await safeRowUpdate(
      supabase,
      row.id,
      outcome.ok
        ? {
            status: "delivered",
            attempts: attempt,
            last_error: null,
            next_retry_at: null,
          }
        : {
            status: backoff === null ? "failed" : "pending",
            attempts: attempt,
            last_error: outcome.error,
            next_retry_at:
              backoff === null
                ? null
                : new Date(Date.now() + backoff).toISOString(),
          }
    );
    if (outcome.ok) stats.delivered++;
    else if (backoff === null) stats.failed++;
    else stats.stillPending++;
  }
  return stats;
}

async function safeRowUpdate(
  supabase: Supabase,
  deliveryId: string,
  patch: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("webhook_deliveries").update(patch).eq("id", deliveryId);
  } catch (err) {
    console.error("[webhooks] sweep update failed:", err);
  }
}
