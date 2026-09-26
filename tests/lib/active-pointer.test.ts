/**
 * Unit tests for lib/active-pointer.ts (Step 25 pointer hygiene).
 * Run with: npm test
 *
 * The contract under test:
 *   - clearActiveWorkspaceIfPointingAt issues an UPDATE of
 *     active_workspace_id = null filtered by (id, active_workspace_id =
 *     the workspace the user just left) — the eq filter IS the "if", so a
 *     healthy pointer elsewhere is never disturbed;
 *   - persistActiveWorkspacePointer issues UPDATE active_workspace_id =
 *     <healed choice> filtered by id only;
 *   - both are BEST-EFFORT: they never throw, never block their caller.
 * A recording fake client (awaitable builder, like the real Supabase
 * chain) captures the issued queries.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  clearActiveWorkspaceIfPointingAt,
  persistActiveWorkspacePointer,
} from "../../lib/active-pointer.ts";

interface Call {
  table: string;
  patch: Record<string, unknown>;
  eqs: [string, unknown][];
}

interface Builder {
  update(patch: Record<string, unknown>): Builder;
  eq(col: string, val: unknown): Builder;
  then(
    onfulfilled?: (v: { data: null; error: null }) => unknown,
    onrejected?: (e: Error) => unknown
  ): Promise<unknown>;
}

function fakeClient(fail = false): { client: unknown; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    from(table: string): Builder {
      const call: Call = { table, patch: {}, eqs: [] };
      calls.push(call);
      const api: Builder = {
        update(patch: Record<string, unknown>) {
          call.patch = patch;
          return api;
        },
        eq(col: string, val: unknown) {
          call.eqs.push([col, val]);
          return api;
        },
        then(onfulfilled, onrejected) {
          return (fail
            ? Promise.reject(new Error("boom"))
            : Promise.resolve({ data: null, error: null })
          ).then(onfulfilled, onrejected);
        },
      };
      return api;
    },
  };
  return { client, calls };
}

describe("clearActiveWorkspaceIfPointingAt", () => {
  const USER = "user-1";
  const WS = "ws-1";

  test("nulls the pointer filtered by user AND the workspace it points at", async () => {
    const { client, calls } = fakeClient();
    await clearActiveWorkspaceIfPointingAt(client as never, USER, WS);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, "profiles");
    assert.deepEqual(calls[0].patch, { active_workspace_id: null });
    // The eq filter IS the "if" — without the second eq a healthy pointer
    // elsewhere would be clobbered.
    assert.deepEqual(calls[0].eqs, [
      ["id", USER],
      ["active_workspace_id", WS],
    ]);
  });

  test("never throws — a rejecting client resolves silently (best-effort)", async () => {
    const { client } = fakeClient(true);
    await assert.doesNotReject(
      clearActiveWorkspaceIfPointingAt(client as never, USER, WS)
    );
  });
});

describe("persistActiveWorkspacePointer", () => {
  const USER = "user-2";
  const WS = "ws-healed";

  test("writes the healed choice filtered by user only", async () => {
    const { client, calls } = fakeClient();
    await persistActiveWorkspacePointer(client as never, USER, WS);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, "profiles");
    assert.deepEqual(calls[0].patch, { active_workspace_id: WS });
    assert.deepEqual(calls[0].eqs, [["id", USER]]);
  });

  test("never throws — a rejecting client resolves silently (best-effort)", async () => {
    const { client } = fakeClient(true);
    await assert.doesNotReject(
      persistActiveWorkspacePointer(client as never, USER, WS)
    );
  });
});
