import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TOAST_MAX,
  leaveToast,
  pushToast,
  removeToast,
  type ToastEntry,
} from "../../lib/toast-queue.ts";

test("toast stack renders depth >= 3 simultaneously", () => {
  let t: ToastEntry[] = [];
  t = pushToast(t, 1, "Invite created");
  t = pushToast(t, 2, "Invite link copied");
  t = pushToast(t, 3, "Invoice saved");
  assert.equal(t.length, 3);
  assert.deepEqual(t.map((x) => x.title), [
    "Invite created",
    "Invite link copied",
    "Invoice saved",
  ]);
});

test("stack caps at TOAST_MAX with oldest marked leaving first", () => {
  let t: ToastEntry[] = [];
  for (let i = 1; i <= 8; i++) t = pushToast(t, i, `t${i}`);
  assert.equal(t.filter((x) => !x.leaving).length <= TOAST_MAX, true);
  assert.equal(t.filter((x) => !x.leaving).length >= 3, true);
  assert.equal(t.find((x) => x.id === 1)?.leaving, true);
  assert.ok(!t.find((x) => x.id === 8)?.leaving); // active: leaving unset/falsy
});

test("leave then remove round-trip", () => {
  let t: ToastEntry[] = [];
  t = pushToast(t, 1, "a");
  t = leaveToast(t, 1);
  assert.equal(t[0].leaving, true);
  t = removeToast(t, 1);
  assert.equal(t.length, 0);
});
