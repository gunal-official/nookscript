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
      /** Session currency, uppercased ISO-4217 ("usd" -> "USD"); null when absent. */
      currency: string | null;
      /** First line item's price id — resolves the operator's configured amount. */
      priceId: string | null;
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

/** The first line item's price id on a checkout session. Webhook payloads
 *  expand lists as { object: "list", data: [...] }; a plain array is
 *  accepted too. Null when absent. */
function firstLineItemPriceId(session: Record<string, unknown>): string | null {
  const items = session.line_items;
  const arr = Array.isArray(items)
    ? items
    : items &&
        typeof items === "object" &&
        Array.isArray((items as { data?: unknown[] }).data)
      ? (items as { data: unknown[] }).data
      : null;
  const first = arr?.[0] as { price?: unknown } | undefined;
  return idOf(first?.price);
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
    const rawCurrency = object.currency;
    const currency =
      typeof rawCurrency === "string" && /^[a-z]{3}$/i.test(rawCurrency)
        ? rawCurrency.toUpperCase()
        : null;
    return {
      kind: "checkout_session_completed",
      workspaceId,
      customerId: idOf(object.customer),
      subscriptionId: idOf(object.subscription),
      currency,
      priceId: firstLineItemPriceId(object),
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

/**
 * Customer Portal (suggestions pass 5/10): let the owner manage/cancel
 * the subscription on Stripe's hosted page. Same zero-SDK approach —
 * one fetch to api.stripe.com, test-mode keys.
 */
export function buildPortalSessionParams(input: {
  customerId: string;
  returnUrl: string;
}): [string, string][] {
  return [
    ["customer", input.customerId],
    ["return_url", input.returnUrl],
  ];
}

/** Create a hosted Customer Portal session (test keys). */
export async function createBillingPortalSession(input: {
  secretKey: string;
  customerId: string;
  returnUrl: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": STRIPE_API_VERSION,
        },
        body: new URLSearchParams(buildPortalSessionParams(input)),
        signal: AbortSignal.timeout(15_000),
      }
    );
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

// ── Global multi-currency (2026-09-26) ────────────────────────────────
// Stripe is the payment provider for the GLOBAL product: the operator
// creates one recurring (monthly) price per currency in the Stripe
// dashboard (Stripe Checkout accepts cards in 135+ currencies
// worldwide) and lists them in STRIPE_PRICES (JSON). The app is
// currency-AGNOSTIC — the UI exposes exactly the configured currencies;
// no currency list is hardcoded. `amount` is display data in major
// units (19 = $19) and must match the Stripe price; the CHARGED amount
// is always Stripe's.
export interface StripePriceConfig {
  /** 3-letter ISO-4217 code, uppercase — e.g. "USD". */
  currency: string;
  /** The Stripe recurring price id for this currency. */
  priceId: string;
  /** Display amount in MAJOR units (must match the Stripe price). */
  amount: number;
}

export type PricesParse =
  | { ok: true; prices: StripePriceConfig[] }
  | { ok: false; error: string };

export function parsePricesEnv(raw: string | undefined): PricesParse {
  if (!raw || !raw.trim()) {
    return { ok: false, error: "STRIPE_PRICES is not set." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error:
        'STRIPE_PRICES is not valid JSON — expected an array like [{"currency":"USD","priceId":"price_...","amount":19}].',
    };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: "STRIPE_PRICES must be a non-empty array." };
  }
  const prices: StripePriceConfig[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, error: `STRIPE_PRICES[${i}] is not an object.` };
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.currency !== "string" || !/^[A-Z]{3}$/.test(e.currency)) {
      return {
        ok: false,
        error: `STRIPE_PRICES[${i}].currency must be an uppercase 3-letter ISO-4217 code.`,
      };
    }
    if (typeof e.priceId !== "string" || e.priceId.trim() === "") {
      return { ok: false, error: `STRIPE_PRICES[${i}].priceId is missing.` };
    }
    if (typeof e.amount !== "number" || !Number.isFinite(e.amount) || e.amount <= 0) {
      return {
        ok: false,
        error: `STRIPE_PRICES[${i}].amount must be a positive number (major units).`,
      };
    }
    if (prices.some((p) => p.currency === e.currency)) {
      return { ok: false, error: `STRIPE_PRICES lists ${e.currency} twice.` };
    }
    prices.push({ currency: e.currency, priceId: e.priceId.trim(), amount: e.amount });
  }
  return { ok: true, prices };
}

/** Read the live config from env (one call, shared by every surface). */
export function getPricesConfig(): PricesParse {
  return parsePricesEnv(process.env.STRIPE_PRICES);
}

export function findPrice(
  prices: StripePriceConfig[],
  currency: string
): StripePriceConfig | null {
  return prices.find((p) => p.currency === currency.toUpperCase()) ?? null;
}

export function findPriceById(
  prices: StripePriceConfig[],
  priceId: string
): StripePriceConfig | null {
  return prices.find((p) => p.priceId === priceId) ?? null;
}

/** Stable, locale-pinned price rendering (tests assert on "en"). Whole
 *  amounts render without decimals ($19); fractional amounts always get
 *  exactly two ($19.50). Zero-decimal currencies stay clean (¥12,000). */
export function formatPrice(amount: number, currency: string): string {
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}
