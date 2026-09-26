/**
 * Unit tests for lib/stripe.ts — the two-webhook event router, the
 * hosted-Checkout parameter contract, and the global multi-currency
 * config helpers (2026-09-26). Test-mode shapes only.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckoutSessionParams,
  buildPortalSessionParams,
  findPrice,
  findPriceById,
  formatPrice,
  parsePricesEnv,
  parseStripeEvent,
} from "../../lib/stripe.ts";

describe("parseStripeEvent (exactly two handled types)", () => {
  test("checkout.session.completed maps workspace/customer/subscription", () => {
    const raw = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "11111111-2222-3333-4444-555555555555",
          customer: "cus_abc",
          subscription: { id: "sub_abc" },
        },
      },
    });
    assert.deepEqual(parseStripeEvent(raw), {
      kind: "checkout_session_completed",
      workspaceId: "11111111-2222-3333-4444-555555555555",
      customerId: "cus_abc",
      subscriptionId: "sub_abc",
      currency: null,
      priceId: null,
    });
  });

  test("checkout.session.completed without a workspace reference is invalid", () => {
    const raw = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { customer: "cus_abc" } },
    });
    assert.deepEqual(parseStripeEvent(raw), { kind: "invalid" });
  });

  test("customer.subscription.deleted maps the subscription id", () => {
    const raw = JSON.stringify({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_xyz" } },
    });
    assert.deepEqual(parseStripeEvent(raw), {
      kind: "subscription_deleted",
      subscriptionId: "sub_xyz",
    });
  });

  test("every other type is acknowledged-ignored; junk is invalid", () => {
    assert.deepEqual(
      parseStripeEvent(JSON.stringify({ type: "invoice.paid", data: { object: {} } })),
      { kind: "ignored", type: "invoice.paid" }
    );
    assert.deepEqual(parseStripeEvent("{not json"), { kind: "invalid" });
    assert.deepEqual(parseStripeEvent("{}"), { kind: "invalid" });
  });
});

describe("parseStripeEvent (global multi-currency fields)", () => {
  test("extracts currency (uppercased) and the first line item's price id (list shape)", () => {
    const raw = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "11111111-2222-3333-4444-555555555555",
          customer: "cus_abc",
          subscription: "sub_abc",
          currency: "usd",
          line_items: {
            object: "list",
            data: [
              {
                price: { id: "price_usd_1", object: "price" },
                quantity: 1,
              },
              { price: { id: "price_other" } },
            ],
          },
        },
      },
    });
    const event = parseStripeEvent(raw);
    assert.equal(event.kind, "checkout_session_completed");
    if (event.kind !== "checkout_session_completed") return;
    assert.equal(event.currency, "USD");
    assert.equal(event.priceId, "price_usd_1");
  });

  test("extracts from a plain-array line_items shape too", () => {
    const raw = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "11111111-2222-3333-4444-555555555555",
          currency: "eur",
          line_items: [{ price: "price_eur_1" }],
        },
      },
    });
    const event = parseStripeEvent(raw);
    if (event.kind !== "checkout_session_completed") {
      throw new Error("expected checkout_session_completed");
    }
    assert.equal(event.currency, "EUR");
    assert.equal(event.priceId, "price_eur_1");
  });

  test("non-ISO currency strings stay null (no junk currency stored)", () => {
    const raw = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "11111111-2222-3333-4444-555555555555",
          currency: "dollars",
        },
      },
    });
    const event = parseStripeEvent(raw);
    if (event.kind !== "checkout_session_completed") {
      throw new Error("expected checkout_session_completed");
    }
    assert.equal(event.currency, null);
  });
});

describe("parsePricesEnv (STRIPE_PRICES — one recurring price per currency)", () => {
  const MULTI = JSON.stringify([
    { currency: "USD", priceId: "price_usd_1", amount: 19 },
    { currency: "EUR", priceId: "price_eur_1", amount: 17 },
    { currency: "INR", priceId: "price_inr_1", amount: 1499 },
  ]);

  test("parses a valid multi-currency config", () => {
    const r = parsePricesEnv(MULTI);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.prices.length, 3);
    assert.deepEqual(r.prices[0], {
      currency: "USD",
      priceId: "price_usd_1",
      amount: 19,
    });
    assert.equal(r.prices[2].currency, "INR");
  });

  test("a single-currency config is valid (1-entry array)", () => {
    const r = parsePricesEnv(
      JSON.stringify([{ currency: "USD", priceId: "p1", amount: 19 }])
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.prices.length, 1);
  });

  test("rejects missing/blank input, bad JSON, non-array, empty array", () => {
    assert.equal(parsePricesEnv(undefined).ok, false);
    assert.equal(parsePricesEnv("  ").ok, false);
    assert.equal(parsePricesEnv("{nope").ok, false);
    assert.equal(parsePricesEnv('{"currency":"USD"}').ok, false);
    assert.equal(parsePricesEnv("[]").ok, false);
  });

  test("rejects malformed entries with a field-accurate message", () => {
    assert.match(
      (parsePricesEnv('[{"currency":"usd","priceId":"p","amount":1}]') as {
        error: string;
      }).error,
      /currency/
    );
    assert.match(
      (parsePricesEnv('[{"currency":"USD","priceId":"","amount":1}]') as {
        error: string;
      }).error,
      /priceId/
    );
    assert.match(
      (parsePricesEnv('[{"currency":"USD","priceId":"p","amount":0}]') as {
        error: string;
      }).error,
      /amount/
    );
    assert.match(
      (parsePricesEnv('["not-an-object"]') as { error: string }).error,
      /not an object/
    );
  });

  test("rejects duplicate currencies", () => {
    const r = parsePricesEnv(
      JSON.stringify([
        { currency: "USD", priceId: "a", amount: 19 },
        { currency: "USD", priceId: "b", amount: 20 },
      ])
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /USD twice/);
  });
});

describe("findPrice / findPriceById", () => {
  const r = parsePricesEnv(
    JSON.stringify([
      { currency: "USD", priceId: "price_usd_1", amount: 19 },
      { currency: "INR", priceId: "price_inr_1", amount: 1499 },
    ])
  );
  assert.equal(r.ok, true);
  const prices = r.ok ? r.prices : [];

  test("finds by currency case-insensitively", () => {
    assert.equal(findPrice(prices, "usd")?.priceId, "price_usd_1");
    assert.equal(findPrice(prices, "INR")?.amount, 1499);
    assert.equal(findPrice(prices, "GBP"), null);
  });

  test("finds by price id", () => {
    assert.equal(findPriceById(prices, "price_inr_1")?.currency, "INR");
    assert.equal(findPriceById(prices, "price_missing"), null);
  });
});

describe("formatPrice (pinned to the en locale for stable rendering)", () => {
  test("renders major units per currency", () => {
    assert.equal(formatPrice(19, "USD"), "$19");
    assert.equal(formatPrice(17, "EUR"), "€17");
    assert.equal(formatPrice(1499, "INR"), "₹1,499");
  });

  test("keeps cents only when present; zero-decimal currencies stay clean", () => {
    assert.equal(formatPrice(19.5, "USD"), "$19.50");
    assert.equal(formatPrice(12000, "JPY"), "¥12,000");
  });
});

describe("buildCheckoutSessionParams (hosted Checkout contract)", () => {
  test("subscription mode, one price, workspace references, no card forms", () => {
    const params = buildCheckoutSessionParams({
      workspaceId: "11111111-2222-3333-4444-555555555555",
      priceId: "price_test_123",
      successUrl: "https://app.example/settings?checkout=success",
      cancelUrl: "https://app.example/settings?checkout=canceled",
      customerEmail: "owner@example.com",
    });
    const map = Object.fromEntries(params);
    assert.equal(map["mode"], "subscription");
    assert.equal(map["line_items[0][price]"], "price_test_123");
    assert.equal(map["line_items[0][quantity]"], "1");
    assert.equal(map["client_reference_id"], "11111111-2222-3333-4444-555555555555");
    assert.equal(map["metadata[workspace_id]"], "11111111-2222-3333-4444-555555555555");
    assert.equal(map["success_url"], "https://app.example/settings?checkout=success");
    assert.equal(map["cancel_url"], "https://app.example/settings?checkout=canceled");
    assert.equal(map["customer_email"], "owner@example.com");
    assert.ok(!("customer_email" in buildCheckoutSessionParams({
      workspaceId: "w", priceId: "p", successUrl: "s", cancelUrl: "c",
      customerEmail: null,
    }).reduce((m, [k, v]) => ({ ...m, [k]: v }), {})));
  });
});

describe("buildPortalSessionParams (Customer Portal contract)", () => {
  test("posts exactly customer + return_url", () => {
    const params = buildPortalSessionParams({
      customerId: "cus_test_abc123",
      returnUrl: "https://app.example/settings",
    });
    assert.deepEqual(params, [
      ["customer", "cus_test_abc123"],
      ["return_url", "https://app.example/settings"],
    ]);
  });
});
