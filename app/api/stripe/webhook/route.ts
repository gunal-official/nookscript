/**
 * Stripe webhooks (Phase: events/webhooks foundation) — handles EXACTLY
 * two event types:
 *   - checkout.session.completed  → billing_subscriptions 'active'
 *   - customer.subscription.deleted → 'canceled'
 * every other type is acknowledged and ignored (so Stripe never retries
 * it). Trust boundary = the verified Stripe-Signature (t/v1 over
 * `${timestamp}.${rawBody}`, identical to outbound webhooks). Writes run
 * as the service role (the only writer of billing state); TEST-mode keys
 * only — nothing here requires production credentials.
 */

import { NextResponse } from "next/server";

import { isUuid } from "@/lib/utils";
import { findPriceById, getPricesConfig, parseStripeEvent } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { verifySignedPayload } from "@/lib/webhooks";

export async function POST(request: Request) {
  const raw = await request.text();

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Billing webhooks are not configured (STRIPE_WEBHOOK_SECRET missing)." },
      { status: 500 }
    );
  }

  const verified = verifySignedPayload({
    secret,
    header: request.headers.get("stripe-signature") ?? "",
    raw,
    nowSec: Math.floor(Date.now() / 1000),
  });
  if (!verified.ok) {
    return NextResponse.json(
      { error: `Invalid signature (${verified.reason}).` },
      { status: 400 }
    );
  }

  const event = parseStripeEvent(raw);
  if (event.kind === "invalid") {
    return NextResponse.json({ error: "Unhandled payload shape." }, { status: 400 });
  }
  if (event.kind === "ignored") {
    return NextResponse.json({ received: true, ignored: event.type });
  }
  if (!isUuid(event.kind === "checkout_session_completed" ? event.workspaceId : "00000000-0000-0000-0000-000000000000")) {
    // workspace ids ride client_reference_id — never trust a non-uuid.
    return NextResponse.json({ error: "Invalid workspace reference." }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();

    if (event.kind === "checkout_session_completed") {
      // currency rides the session (authoritative; Stripe sends it
      // lowercased — parseStripeEvent uppercases it); amount is display
      // data from the operator's STRIPE_PRICES config, resolved via the
      // line item's price id.
      const pricesConfig = getPricesConfig();
      const configuredPrice =
        pricesConfig.ok && event.priceId
          ? findPriceById(pricesConfig.prices, event.priceId)
          : null;
      const { error } = await supabase.from("billing_subscriptions").upsert(
        {
          workspace_id: event.workspaceId,
          stripe_customer_id: event.customerId,
          stripe_subscription_id: event.subscriptionId,
          currency: event.currency,
          amount: configuredPrice?.amount ?? null,
          status: "active",
        },
        { onConflict: "workspace_id" }
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ received: true, plan: "pro" });
    }

    // customer.subscription.deleted
    const { error } = await supabase
      .from("billing_subscriptions")
      .update({ status: "canceled" })
      .eq("stripe_subscription_id", event.subscriptionId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ received: true, plan: "free" });
  } catch (err) {
    console.error("[stripe] webhook handling failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook handling failed." },
      { status: 500 }
    );
  }
}
