/**
 * Unit tests for lib/stripe.ts — the two-webhook event router and the
 * hosted-Checkout parameter contract (test-mode shapes only).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckoutSessionParams,
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
