/**
 * Outbound webhook dispatch (Phase: events/webhooks foundation) — the
 * impure half: loads a workspace's endpoints, POSTs each event with an
 * HMAC signature, retries on the RETRY_BACKOFF_MS schedule, and keeps the
 * webhook_deliveries row honest.
 *
 * DELIVERY SEMANTICS (accepted, documented): dispatch is best-effort and
 * rides the request that caused the event. The first attempt happens
 * immediately (never awaited into the user's action path); retries are
 * in-process timers. On long-lived servers (next dev / node) the full
 * 3-attempt schedule runs; on serverless platforms a frozen process can
 * lose pending retries — the delivery row stays `pending` with its
 * last_error for the settings UI to show (the in-memory rate limiter's
 * accepted-limitation precedent; hardening = a cron sweep, listed as a
 * suggestion, never a third-party queue service).
 */

import type { createClient } from "@/lib/supabase/server";

import {
  backoffForAttempt,
  buildDeliveryBody,
  buildDeliveryHeaders,
} from "./webhooks.ts";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type DispatchableEvent = {
  id: string;
  workspace_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

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
  endpoint: { id: string; url: string; signing_secret: string },
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

async function attemptDelivery(
  supabase: Supabase,
  deliveryId: string,
  endpoint: { id: string; url: string; signing_secret: string },
  event: DispatchableEvent,
  attempt: number
): Promise<void> {
  const body = buildDeliveryBody(event);
  const timestampSec = Math.floor(Date.now() / 1000);
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: buildDeliveryHeaders(
        body,
        endpoint.signing_secret,
        timestampSec,
        deliveryId,
        event.event_type
      ),
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await supabase
      .from("webhook_deliveries")
      .update({ status: "delivered", attempts: attempt, last_error: null })
      .eq("id", deliveryId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const backoff = backoffForAttempt(attempt);
    try {
      await supabase
        .from("webhook_deliveries")
        .update({
          status: backoff === null ? "failed" : "pending",
          attempts: attempt,
          last_error: message,
        })
        .eq("id", deliveryId);
    } catch (updateErr) {
      console.error("[webhooks] delivery update failed:", updateErr);
    }
    if (backoff !== null) {
      setTimeout(() => {
        void attemptDelivery(
          supabase,
          deliveryId,
          endpoint,
          event,
          attempt + 1
        );
      }, backoff);
    }
  }
}
