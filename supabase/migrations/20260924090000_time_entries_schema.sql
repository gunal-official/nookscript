-- Step 18: time_entries — per-workspace hours log (the "timer + hours
-- log" of the platform phase). Second table of the platform phase.
--
-- DESIGN DECISIONS (locked; see README → Verify Step 18):
--   * The TIMER is not in the database. It is ephemeral client state
--     (localStorage, survives refresh) in the app shell; stopping it
--     writes a time_entries row. The entry IS the record — no open
--     rows, no started_at/ended_at, no stuck-timer recovery.
--   * Duration is INTEGER MINUTES (house integer precision, same
--     stance as invoice cents): the timer ticks seconds and rounds to
--     the nearest minute, minimum 1, at stop.
--   * worked_on is the DAY THE WORK HAPPENED (backdateable in the UI);
--     the log groups by it, never by created_at.
--   * brief_id is an OPTIONAL attribution (null = general time);
--     on delete set null so hours survive a brief's deletion instead of
--     vanishing with it.
--   * CONSCIOUS EXCEPTION to the no-delete house pattern: this table is
--     the ONLY one with a member DELETE policy. The no-delete rule
--     guarded financial/audit records (invoices → void); a time entry
--     is a personal work log with no audit stake, and a log that cannot
--     be corrected or destroyed is unusable.
--   * No stored aggregates: today / this-month totals are computed in
--     TS from the fetched rows, so nothing can drift.
--   * No public surface at all: no share links, no definer RPC — plain
--     member RLS is the entire security model.

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Optional attribution to a brief (null = general time).
  brief_id uuid references public.briefs(id) on delete set null,
  description text not null,
  -- The day the work was done (backdateable); the list groups by this,
  -- never by created_at.
  worked_on date not null default now(),
  -- Integer minutes; the CHECK is the DB-level floor the UI also enforces.
  duration_minutes integer not null check (duration_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists time_entries_workspace_worked_on_idx
  on public.time_entries (workspace_id, worked_on desc);

alter table public.time_entries enable row level security;

-- ──────────────────────────── Policies ──────────────────────────
-- The standard member triplet, plus a DELETE policy — the only delete
-- policy in the schema (documented exception in the header).

create policy "time_entries: members can select"
  on public.time_entries for select
  using (public.is_workspace_member(workspace_id));

create policy "time_entries: members can insert"
  on public.time_entries for insert
  with check (public.is_workspace_member(workspace_id));

create policy "time_entries: members can update"
  on public.time_entries for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "time_entries: members can delete"
  on public.time_entries for delete
  using (public.is_workspace_member(workspace_id));

-- ───────────── Trigger: keep updated_at honest ──────────────────
-- Reuses touch_updated_at() from the briefs migration.

drop trigger if exists time_entries_touch_updated_at on public.time_entries;
create trigger time_entries_touch_updated_at
  before update on public.time_entries
  for each row
  execute function public.touch_updated_at();
