/**
 * Unit tests for lib/events.ts — the event-type vocabulary stays in
 * lockstep with the events table CHECK constraint.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_TYPES,
  eventDetail,
  eventLabel,
  isEventType,
} from "../../lib/events.ts";

describe("EVENT_TYPES (the recorded transitions)", () => {
  test("exactly the six scoped transitions, in scope order", () => {
    assert.deepEqual([...EVENT_TYPES], [
      "brief.created",
      "proposal.accepted",
      "proposal.declined",
      "plan.task_completed",
      "invoice.paid",
      "contract.signed",
    ]);
  });

  test("isEventType accepts only known types", () => {
    assert.ok(isEventType("invoice.paid"));
    assert.ok(isEventType("plan.task_completed"));
    assert.ok(!isEventType("invoice.deleted"));
    assert.ok(!isEventType(""));
  });
});

describe("Activity surface helpers (suggestions pass 8/10)", () => {
  test("eventLabel maps known types and falls back to the raw string", () => {
    assert.equal(eventLabel("brief.created"), "Brief created");
    assert.equal(eventLabel("invoice.paid"), "Invoice paid");
    assert.equal(eventLabel("team.member.joined"), "Member joined");
    assert.equal(eventLabel("brand.new.type"), "brand.new.type");
    assert.equal(eventLabel(""), "");
  });

  test("eventDetail prefers invoice numbers, then task text, then title", () => {
    assert.equal(
      eventDetail({
        event_type: "invoice.paid",
        payload: { invoice_number: 42, title: "should not win" },
      }),
      "Invoice #42"
    );
    assert.equal(
      eventDetail({
        event_type: "plan.task_completed",
        payload: { task_text: "Ship the landing page", title: "nope" },
      }),
      "Ship the landing page"
    );
    assert.equal(
      eventDetail({
        event_type: "brief.created",
        payload: { title: "Renewal proposal for Acme" },
      }),
      "Renewal proposal for Acme"
    );
  });

  test("eventDetail tolerates missing/empty payloads and money-only payloads", () => {
    assert.equal(eventDetail({ event_type: "invoice.paid", payload: null }), "");
    assert.equal(
      eventDetail({
        event_type: "invoice.paid",
        payload: { total_cents: 1200 },
      }),
      ""
    );
    assert.equal(eventDetail({ event_type: "contract.signed", payload: {} }), "");
  });
});
