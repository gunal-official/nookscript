/**
 * Unit tests for lib/events.ts — the event-type vocabulary stays in
 * lockstep with the events table CHECK constraint.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { EVENT_TYPES, isEventType } from "../../lib/events.ts";

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
