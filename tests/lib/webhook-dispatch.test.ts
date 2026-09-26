/**
 * Unit tests for lib/webhook-dispatch.ts — the retry CLAIM and the cron
 * sweep (suggestions pass 4/10), exercised against an in-memory fake of
 * the PostgREST query surface the module uses (select / update / or /
 * maybeSingle / rpc). The real SQL semantics (conditional-update
 * atomicity, RLS, the partial index) are verified by
 * scripts/verify-db.mjs; the route's CRON_SECRET gate is exercised in
 * the live build.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  reprocessDueDeliveries,
  sendToEndpoint,
  type Supabase,
} from "../../lib/webhook-dispatch.ts";
import { verifySignedPayload } from "../../lib/webhooks.ts";

type Row = Record<string, unknown>;

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

interface ThenableResult {
  data: unknown;
  error: null;
}

interface Chain {
  select(q?: string): Chain;
  update(obj: Row): Chain;
  eq(f: string, v: unknown): Chain;
  or(spec: string): Chain;
  order(f: string, o?: { ascending: boolean }): Chain;
  limit(n?: number): Chain;
  maybeSingle(): Promise<ThenableResult>;
  single(): Promise<ThenableResult>;
  then(resolve: (v: ThenableResult) => void): void;
}

const ENDPOINT: {
  id: string;
  url: string;
  signing_secret: string;
} = {
  id: "ep-1",
  url: "https://example.com/hook",
  signing_secret: "whsec_sweep_secret",
};

const EVENT = {
  id: "ev-1",
  workspace_id: "ws-1",
  event_type: "invoice.paid",
  payload: { invoice_id: "inv-1" },
  created_at: "2026-09-26T10:00:00.000Z",
};

function dueRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "del-1",
    endpoint_id: ENDPOINT.id,
    event_id: EVENT.id,
    status: "pending",
    attempts: 1,
    last_error: null,
    next_retry_at: new Date(Date.now() - 1000).toISOString(),
    ...overrides,
  };
}

const PAST = () => new Date(Date.now() - 1000).toISOString();
const FUTURE = () => new Date(Date.now() + 60_000).toISOString();

interface FakeOptions {
  /** Runs with the matched rows when the sweep's due-list select
   *  resolves — the seam where a rival actor (timer or another sweep)
   *  could grab the rows first. */
  afterDueList?: (rows: Row[]) => void;
}

function makeFake(
  tables: {
    webhook_deliveries?: Row[];
    webhook_endpoints?: Row[];
    events?: Row[];
  },
  fetchImpl: (call: FetchCall) => Promise<Response>,
  options: FakeOptions = {}
) {
  const rowSets: Record<string, Row[]> = {
    webhook_deliveries: tables.webhook_deliveries ?? [],
    webhook_endpoints: tables.webhook_endpoints ?? [],
    events: tables.events ?? [],
  };
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  const matchesAll = (row: Row, filters: Array<(r: Row) => boolean>) =>
    filters.every((f) => f(row));

  function chain(table: string): Chain {
    const rows = rowSets[table] ?? [];
    let filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;

    const thenable: Chain = {
      select: () => thenable,
      update: (obj: Row) => {
        patch = obj;
        return thenable;
      },
      eq: (f, v) => {
        filters.push((r) => r[f] === v);
        return thenable;
      },
      or: (spec) => {
        const preds = spec
          .split(",")
          .map((p) => p.trim())
          .map((p) => {
            if (p.endsWith(".is.null")) {
              const f = p.slice(0, -".is.null".length);
              return (r: Row) => r[f] === null || r[f] === undefined;
            }
            const m = p.match(/^(.*)\.lte\.(.*)$/);
            if (m) {
              const f = m[1];
              const v = m[2];
              return (r: Row) =>
                r[f] != null &&
                typeof r[f] === "string" &&
                (r[f] as string) <= v;
            }
            throw new Error(`fake: unsupported or() clause: ${p}`);
          });
        filters.push((r) => preds.some((p) => p(r)));
        return thenable;
      },
      order: () => thenable,
      limit: () => thenable,
      maybeSingle: async () => {
        const target = rows.find((r) => matchesAll(r, filters));
        if (patch && target) Object.assign(target, patch);
        return { data: target ? { ...target } : null, error: null };
      },
      single: async () => {
        const target = rows.find((r) => matchesAll(r, filters));
        if (patch && target) Object.assign(target, patch);
        return { data: target ? { ...target } : null, error: null };
      },
      then: (resolve) => {
        const matched = rows.filter((r) => matchesAll(r, filters));
        if (patch) {
          for (const r of matched) Object.assign(r, patch);
        } else if (table === "webhook_deliveries" && options.afterDueList) {
          options.afterDueList(matched);
        }
        resolve({ data: matched.map((r) => ({ ...r })), error: null });
      },
    };
    return thenable;
  }

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ""),
    };
    calls.push(call);
    return fetchImpl(call);
  }) as typeof globalThis.fetch;

  const client = {
    from: (table: string) => chain(table),
    rpc: async () => ({ data: [], error: null }),
  };

  return {
    client: client as unknown as Supabase,
    calls,
    deliveries: rowSets.webhook_deliveries,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

describe("sendToEndpoint — one signed POST", () => {
  test("posts the envelope with a verifiable signature and reports 200", async () => {
    const fake = makeFake(
      {},
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    try {
      const outcome = await sendToEndpoint(ENDPOINT, EVENT, "del-1");
      assert.deepEqual(outcome, { ok: true, status: 200 });
      assert.equal(fake.calls.length, 1);
      const call = fake.calls[0];
      assert.equal(call.url, ENDPOINT.url);
      assert.equal(call.method, "POST");
      const parsed = JSON.parse(call.body) as Record<string, unknown>;
      assert.equal(parsed.id, EVENT.id);
      assert.equal(parsed.event_type, "invoice.paid");
      assert.equal(call.headers["x-nookscript-event"], "invoice.paid");
      assert.equal(call.headers["x-nookscript-delivery"], "del-1");
      const header = call.headers["x-nookscript-signature"];
      const t = Number(header.split(",")[0].slice(2));
      assert.deepEqual(
        verifySignedPayload({
          secret: ENDPOINT.signing_secret,
          header,
          raw: call.body,
          nowSec: t,
        }),
        { ok: true }
      );
    } finally {
      fake.restore();
    }
  });

  test("reports non-2xx as HTTP <status>", async () => {
    const fake = makeFake(
      {},
      () => Promise.resolve(new Response("nope", { status: 500 }))
    );
    try {
      const outcome = await sendToEndpoint(ENDPOINT, EVENT, "del-1");
      assert.deepEqual(outcome, { ok: false, error: "HTTP 500" });
    } finally {
      fake.restore();
    }
  });

  test("reports network failures with the error message", async () => {
    const fake = makeFake(
      {},
      async () => {
        throw new Error("ECONNREFUSED");
      }
    );
    try {
      const outcome = await sendToEndpoint(ENDPOINT, EVENT, "del-1");
      assert.equal(outcome.ok, false);
      if (!outcome.ok) assert.equal(outcome.error, "ECONNREFUSED");
    } finally {
      fake.restore();
    }
  });
});

describe("reprocessDueDeliveries — the cron sweep", () => {
  test("claims a due pending row, delivers it, and settles the row", async () => {
    const row = dueRow();
    const fake = makeFake(
      {
        webhook_deliveries: [row],
        webhook_endpoints: [ENDPOINT],
        events: [EVENT],
      },
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    try {
      const stats = await reprocessDueDeliveries(fake.client);
      assert.deepEqual(stats, {
        checked: 1,
        delivered: 1,
        stillPending: 0,
        failed: 0,
      });
      assert.equal(fake.calls.length, 1);
      assert.equal(row.status, "delivered");
      assert.equal(row.attempts, 2);
      assert.equal(row.last_error, null);
      assert.equal(row.next_retry_at, null);
    } finally {
      fake.restore();
    }
  });

  test("ignores rows whose retry window is not open yet", async () => {
    const row = dueRow({ next_retry_at: FUTURE() });
    const fake = makeFake(
      {
        webhook_deliveries: [row],
        webhook_endpoints: [ENDPOINT],
        events: [EVENT],
      },
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    try {
      const stats = await reprocessDueDeliveries(fake.client);
      assert.deepEqual(stats, {
        checked: 0,
        delivered: 0,
        stillPending: 0,
        failed: 0,
      });
      assert.equal(fake.calls.length, 0);
      assert.equal(row.status, "pending");
    } finally {
      fake.restore();
    }
  });

  test("picks up fresh frozen rows (pending, never attempted, NULL lease)", async () => {
    const row = dueRow({ attempts: 0, next_retry_at: null });
    const fake = makeFake(
      {
        webhook_deliveries: [row],
        webhook_endpoints: [ENDPOINT],
        events: [EVENT],
      },
      () => Promise.resolve(new Response(null, { status: 202 }))
    );
    try {
      const stats = await reprocessDueDeliveries(fake.client);
      assert.deepEqual(stats, {
        checked: 1,
        delivered: 1,
        stillPending: 0,
        failed: 0,
      });
      assert.equal(row.status, "delivered");
      assert.equal(row.attempts, 1);
    } finally {
      fake.restore();
    }
  });

  test("loses to a rival claim between the list query and the claim", async () => {
    const row = dueRow();
    const fake = makeFake(
      {
        webhook_deliveries: [row],
        webhook_endpoints: [ENDPOINT],
        events: [EVENT],
      },
      () => Promise.resolve(new Response(null, { status: 200 })),
      {
        afterDueList: (matched) => {
          // A rival actor (in-process timer or another sweep) grabs the
          // row the moment our list query resolves.
          for (const r of matched) r.next_retry_at = FUTURE();
        },
      }
    );
    try {
      const stats = await reprocessDueDeliveries(fake.client);
      assert.deepEqual(stats, {
        checked: 1,
        delivered: 0,
        stillPending: 0,
        failed: 0,
      });
      assert.equal(fake.calls.length, 0);
      assert.equal(row.status, "pending");
    } finally {
      fake.restore();
    }
  });

  test("fails permanently when the endpoint was deleted while pending", async () => {
    const row = dueRow();
    const fake = makeFake(
      { webhook_deliveries: [row], events: [EVENT] },
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    try {
      const stats = await reprocessDueDeliveries(fake.client);
      assert.deepEqual(stats, {
        checked: 1,
        delivered: 0,
        stillPending: 0,
        failed: 1,
      });
      assert.equal(fake.calls.length, 0);
      assert.equal(row.status, "failed");
      assert.equal(row.last_error, "Endpoint or event no longer exists.");
      assert.equal(row.next_retry_at, null);
    } finally {
      fake.restore();
    }
  });

  test("marks the row terminally failed when the 3rd attempt fails", async () => {
    const row = dueRow({ attempts: 2 });
    const fake = makeFake(
      {
        webhook_deliveries: [row],
        webhook_endpoints: [ENDPOINT],
        events: [EVENT],
      },
      () => Promise.resolve(new Response("nope", { status: 500 }))
    );
    try {
      const stats = await reprocessDueDeliveries(fake.client);
      assert.deepEqual(stats, {
        checked: 1,
        delivered: 0,
        stillPending: 0,
        failed: 1,
      });
      assert.equal(row.status, "failed");
      assert.equal(row.attempts, 3);
      assert.equal(row.last_error, "HTTP 500");
      assert.equal(row.next_retry_at, null);
    } finally {
      fake.restore();
    }
  });

  test("keeps the row pending with the next backoff on a mid-schedule failure", async () => {
    const row = dueRow({ attempts: 1 });
    const fake = makeFake(
      {
        webhook_deliveries: [row],
        webhook_endpoints: [ENDPOINT],
        events: [EVENT],
      },
      () => Promise.resolve(new Response("nope", { status: 500 }))
    );
    try {
      const stats = await reprocessDueDeliveries(fake.client);
      assert.deepEqual(stats, {
        checked: 1,
        delivered: 0,
        stillPending: 1,
        failed: 0,
      });
      assert.equal(row.status, "pending");
      assert.equal(row.attempts, 2);
      assert.equal(row.last_error, "HTTP 500");
      // Attempt #2 failed ⇒ the schedule's 2nd backoff (60s) governs the
      // 3rd attempt: RETRY_BACKOFF_MS = [15s, 60s], 1-based.
      const next = Date.parse(String(row.next_retry_at));
      assert.ok(next > Date.now(), "next_retry_at is in the future");
      assert.ok(
        next <= Date.now() + 61_000,
        "next_retry_at is the 60s backoff (±slack)"
      );
    } finally {
      fake.restore();
    }
  });

  test("never picks rows that are already settled", async () => {
    const rows = [
      dueRow({ id: "a", status: "delivered", next_retry_at: null }),
      dueRow({ id: "b", status: "failed", next_retry_at: PAST() }),
    ];
    const fake = makeFake(
      {
        webhook_deliveries: rows,
        webhook_endpoints: [ENDPOINT],
        events: [EVENT],
      },
      () => Promise.resolve(new Response(null, { status: 200 }))
    );
    try {
      const stats = await reprocessDueDeliveries(fake.client);
      assert.equal(stats.checked, 0);
      assert.equal(fake.calls.length, 0);
    } finally {
      fake.restore();
    }
  });
});
