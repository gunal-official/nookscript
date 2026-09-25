-- Phase: events/webhooks foundation — the workspace event log.
--
-- DESIGN DECISIONS (locked):
--   * Append-only AUDIT LOG: members read, and the app inserts at state
--     transitions through the session client; deliberately NO update /
--     delete policies (invoice/contract precedent — the rows are the
--     audit trail).
--   * event_type is CHECK-constrained to the six recorded transitions;
--     new event types land by migration (foundation tightness).
--   * payload carries the transition's identifying facts only (ids +
--     title/number level) — never document bodies or money line items.
--   * Inserts run as the ACTING USER from the server actions that
--     perform the transitions (hence the member INSERT policy).
--     Outbound webhook dispatch is app-layer (lib/events.ts).

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'brief.created',
      'proposal.accepted',
      'proposal.declined',
      'plan.task_completed',
      'invoice.paid',
      'contract.signed'
    )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_workspace_id_idx
  on public.events (workspace_id, created_at desc);

alter table public.events enable row level security;

create policy "events: members can select"
  on public.events for select
  using (public.is_workspace_member(workspace_id));

create policy "events: members can insert"
  on public.events for insert
  with check (public.is_workspace_member(workspace_id));

-- Deliberately NO update/delete policies: append-only audit log.
