-- Phase: events/webhooks foundation — retry schedule for outbound
-- webhook deliveries (suggestions pass 4/10: serverless retry cron sweep).
--
-- DESIGN DECISIONS (locked):
--   * next_retry_at is the single source of truth for "when may the next
--     attempt run" (NULL = no retry scheduled). The in-process timers
--     (lib/webhook-dispatch.ts) still fire first on long-lived servers;
--     when a serverless process freezes mid-schedule, the row simply
--     stays 'pending' until a cron sweep claims it — the documented
--     serverless-freeze limitation now has a recovery path.
--   * Every retry attempt (in-process timer OR cron sweep) must first win
--     an ATOMIC conditional update — "the claim":
--         UPDATE ... SET next_retry_at = now() + 1h lease
--         WHERE id = $1 AND status = 'pending'
--           AND (next_retry_at IS NULL OR next_retry_at <= now())
--     Postgres row locks serialize two contenders; the loser's WHERE
--     re-check fails and it delivers nothing. The NULL arm covers fresh
--     rows frozen between the upsert and the first fetch (the in-process
--     first attempt doesn't claim; the rare resulting double-attempt is
--     accepted — the envelope id is the stable event id, receivers
--     dedupe on it). No SQL claim function on purpose: the sweep runs as
--     the SERVICE ROLE (which is_workspace_member cannot recognize —
--     auth.uid() is NULL there), so a SECURITY DEFINER helper would
--     either lock the service role out or need a
--     trust-auth.uid()-is-null escape hatch that anonymous callers could
--     also exploit. The conditional update needs no function at all, and
--     the cron route's trust boundary is CRON_SECRET.
--   * The 1h lease is the double-delivery guard AND the loss window: if a
--     process claims and dies before sending, that attempt is retried at
--     the next sweep after the lease lapses (accepted, documented).
--   * After the 3rd attempt the row is 'failed' + next_retry_at NULL =
--     terminal; the sweep only ever touches 'pending' rows. 'failed'
--     rows stay visible in the settings card with last_error.
--   * No grants, no named roles (house convention): the sweep updates
--     rows through the service-role client, which bypasses RLS; the
--     in-process path updates through the existing member UPDATE policy
--     (the new column is covered by it).
--
-- Apply via: Supabase Dashboard → SQL Editor → paste → Run
--        or: supabase db push

alter table public.webhook_deliveries
  add column if not exists next_retry_at timestamptz;

-- The sweep's working set: due pending rows, oldest first. (Fresh frozen
-- rows with next_retry_at NULL are rare and few; they fall back to a
-- small scan of pending rows.)
create index if not exists webhook_deliveries_retry_idx
  on public.webhook_deliveries (next_retry_at)
  where status = 'pending' and next_retry_at is not null;
