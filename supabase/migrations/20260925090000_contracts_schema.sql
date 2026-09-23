-- Step 19: contracts — per-workspace engagement agreements.
-- Third table of the platform phase.
--
-- DESIGN DECISIONS (locked; see README → Verify Step 19):
--   * client_name is FREE TEXT (invoice precedent): the UI suggests
--     names seen on the workspace's briefs (<datalist>).
--   * The body is a single plain-text terms field: a contract is a
--     document the user writes, not structured data (recorded cuts:
--     jsonb sections, template-driven generation).
--   * brief_id is OPTIONAL (null = standalone); on delete set null so
--     a contract survives its brief's deletion.
--   * Lifecycle MIRRORS invoices: draft → sent → signed, plus void as
--     the audit-safe cancel. sent_at is stamped on first send (never
--     overwritten); signed_at is stamped on 'signed' and CLEARED when
--     leaving 'signed'; void keeps every stamp. The stamps are written
--     by the app's status transitions, like invoices.
--   * 'expired' is NOT a status: expires_on (null = no expiry) drives a
--     derived render in the UI — closing out a contract never needs a
--     status change.
--   * No money fields: the invoices hold the value; storing a number
--     here too would be a second source of truth that can drift.
--   * Deliberately NO DELETE POLICY: a contract is a legal/financial
--     document (invoice precedent) — void is the cancel, the rows are
--     the audit trail.
--   * No public surface: no share links, no definer RPC. Browser print
--     of the member detail page is the v1 export story (PrintButton
--     island reuse).

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Optional engagement attribution (null = standalone).
  brief_id uuid references public.briefs(id) on delete set null,
  client_name text not null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'signed', 'void')),
  terms text not null default '',
  -- null = no expiry; a past date renders "expired" (derived, not stored).
  expires_on date,
  -- The client signatory's name, recorded by the user (no e-sign —
  -- recorded cut).
  signed_by text not null default '',
  sent_at timestamptz, -- stamped on first 'sent' (never overwritten)
  signed_at timestamptz, -- stamped on 'signed'; cleared when leaving 'signed'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contracts_workspace_id_idx
  on public.contracts (workspace_id, created_at desc);

alter table public.contracts enable row level security;

-- ──────────────────────────── Policies ──────────────────────────
-- The standard member triplet. Deliberately NO delete policy (see
-- header): void is the cancel.

create policy "contracts: members can select"
  on public.contracts for select
  using (public.is_workspace_member(workspace_id));

create policy "contracts: members can insert"
  on public.contracts for insert
  with check (public.is_workspace_member(workspace_id));

create policy "contracts: members can update"
  on public.contracts for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ───────────── Trigger: keep updated_at honest ──────────────────
-- Reuses touch_updated_at() from the briefs migration.

drop trigger if exists contracts_touch_updated_at on public.contracts;
create trigger contracts_touch_updated_at
  before update on public.contracts
  for each row
  execute function public.touch_updated_at();
