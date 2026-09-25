/**
 * Stripe billing (Phase: events/webhooks foundation) — hosted Checkout
 * (test-mode keys only) for the Free → Pro upgrade, and the two-webhook
 * event parser for /api/stripe/webhook. Zero SDK dependency: one fetch to
 * api.stripe.com + the t/v1 HMAC scheme shared with outbound webhooks
 * (lib/webhooks.ts — Stripe signatures use the identical format).
 */

export const STRIPE_API_VERSION = "2024-06-20";

export type StripeEvent =
  | {
      kind: "checkout_session_completed";
      workspaceId: string;
      customerId: string | null;
      subscriptionId: string | null;
    }
  | { kind: "subscription_deleted"; subscriptionId: string }
  | { kind: "ignored"; type: string }
  | { kind: "invalid" };

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

/** Route exactly two Stripe event types; everything else is acknowledged
 *  as ignored (so Stripe does not retry it), parse failures as invalid. */
export function parseStripeEvent(raw: string): StripeEvent {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { kind: "invalid" };
  }
  const event = body as { type?: unknown; data?: { object?: unknown } };
  if (!event || typeof event.type !== "string") return { kind: "invalid" };
  const object = (event.data?.object ?? {}) as Record<string, unknown>;

  if (event.type === "checkout.session.completed") {
    const workspaceId =
      typeof object.client_reference_id === "string"
        ? object.client_reference_id
        : "";
    if (!workspaceId) return { kind: "invalid" };
    return {
      kind: "checkout_session_completed",
      workspaceId,
      customerId: idOf(object.customer),
      subscriptionId: idOf(object.subscription),
    };
  }
  if (event.type === "customer.subscription.deleted") {
    const subscriptionId = idOf(object);
    if (!subscriptionId) return { kind: "invalid" };
    return { kind: "subscription_deleted", subscriptionId };
  }
  return { kind: "ignored", type: event.type };
}

export function buildCheckoutSessionParams(input: {
  workspaceId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}): [string, string][] {
  const params: [string, string][] = [
    ["mode", "subscription"],
    ["line_items[0][price]", input.priceId],
    ["line_items[0][quantity]", "1"],
    ["client_reference_id", input.workspaceId],
    ["metadata[workspace_id]", input.workspaceId],
    ["success_url", input.successUrl],
    ["cancel_url", input.cancelUrl],
  ];
  if (input.customerEmail) params.push(["customer_email", input.customerEmail]);
  return params;
}

/** Create a hosted Checkout Session via the plain REST API (test keys). */
export async function createCheckoutSession(input: {
  secretKey: string;
  workspaceId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": STRIPE_API_VERSION,
      },
      body: new URLSearchParams(buildCheckoutSessionParams(input)),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json()) as {
      url?: string;
      error?: { message?: string };
    };
    if (!res.ok || !data.url) {
      return {
        ok: false,
        error: data.error?.message ?? `Stripe error (HTTP ${res.status}).`,
      };
    }
    return { ok: true, url: data.url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach Stripe.",
    };
  }
}
