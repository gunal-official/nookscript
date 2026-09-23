-- Step 17: invoices — standalone, per-workspace, sequentially numbered.
-- First table of the platform phase.
--
-- DESIGN DECISIONS (locked; see README → Verify Step 17):
--   * client_name is FREE TEXT — no clients table yet; the UI suggests
--     names seen on the workspace's briefs (a <datalist>).
--   * Money is INTEGER CENTS. Totals are NEVER stored — the app computes
--     subtotal → tax → total from items + tax_percent, so nothing drifts.
--   * Currency: USD, pinned for v1 (no per-workspace currency).
--   * Lifecycle: draft → sent → paid, plus void = audit-safe cancel.
--     Deliberately NO DELETE POLICY on either table: voided rows are the
--     audit trail. sent_at / paid_at are auto-stamped by the app's status
--     transitions (leaving 'paid' clears paid_at).
--
-- SECURITY MODEL (mirrors share_links):
--   * invoices / invoice_links are fully member-gated via ordinary
--     is_workspace_member() RLS. Public visitors NEVER query them.
--   * Public reads go through get_shared_invoice(), a SECURITY DEFINER
--     function that validates the token AND the invoice's visibility
--     internally, returning only public fields (no ids).
--   * An anon-SELECT policy is intentionally NOT used: RLS cannot bind to
--     the requester's token, so such a policy would make rows enumerable.

-- ──────────────────────────── Table ─────────────────────────────

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Per-workspace sequence (INV-0001, INV-0002, …) assigned by the app as
  -- max+1; unique() turns a double-click race into a friendly 23505.
  invoice_number integer not null,
  client_name text not null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'void')),
  -- [{id, description, quantity, unit_amount_cents}] — same jsonb whole-doc
  -- edit pattern as plans.tasks (no per-line SQL, composer owns the shape)
  items jsonb not null default '[]',
  tax_percent numeric(5,2) not null default 0
    check (tax_percent >= 0 and tax_percent <= 100),
  notes text not null default '', -- '' avoids null-vs-empty in the composer
  due_date date, -- null = no due date
  sent_at timestamptz, -- stamped when first marked 'sent'
  paid_at timestamptz, -- stamped on 'paid'; cleared when leaving 'paid'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, invoice_number)
);

create index if not exists invoices_workspace_id_idx
  on public.invoices (workspace_id, created_at desc);

alter table public.invoices enable row level security;

-- ──────────────────────────── Policies ──────────────────────────
-- The standard member triplet. Deliberately NO delete policy: void is
-- the cancel (audit trail), so even a member cannot destroy an invoice.

create policy "invoices: members can select"
  on public.invoices for select
  using (public.is_workspace_member(workspace_id));

create policy "invoices: members can insert"
  on public.invoices for insert
  with check (public.is_workspace_member(workspace_id));

create policy "invoices: members can update"
  on public.invoices for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ───────────── Trigger: keep updated_at honest ──────────────────
-- Reuses touch_updated_at() from the briefs migration.

drop trigger if exists invoices_touch_updated_at on public.invoices;
create trigger invoices_touch_updated_at
  before update on public.invoices
  for each row
  execute function public.touch_updated_at();

-- ─────────────────────── invoice_links ──────────────────────────
-- Public, read-only, revocable links for invoices. Shape mirrors
-- share_links exactly (one link per invoice, unguessable uuid token).

create table if not exists public.invoice_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- one link per invoice; cascades away with the invoice
  invoice_id uuid not null unique references public.invoices(id) on delete cascade,
  -- UNIQUE both enforces unguessable-address uniqueness and provides the
  -- lookup index for get_shared_invoice() (no separate index needed)
  token uuid not null unique default gen_random_uuid(),
  revoked_at timestamptz, -- null = active; revocation keeps the row (audit trail)
  created_at timestamptz not null default now()
);

alter table public.invoice_links enable row level security;

-- Member management only (create/revoke/regenerate happen through
-- authenticated app server actions). No delete policy — revoked rows
-- stay (audit trail).

create policy "invoice_links: members can select"
  on public.invoice_links for select
  using (public.is_workspace_member(workspace_id));

create policy "invoice_links: members can insert"
  on public.invoice_links for insert
  with check (public.is_workspace_member(workspace_id));

create policy "invoice_links: members can update"
  on public.invoice_links for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ────────── Public read: token-gated SECURITY DEFINER RPC ───────
-- Follows get_shared_document() (share_links) and create_brief_bundle()
-- (definer + search_path pin + internal guards). EXECUTE is granted to
-- PUBLIC by default, which is what makes this callable by anonymous
-- visitors without any GRANT statement.
--
-- Zero rows — indistinguishable by design — for: invalid tokens, revoked
-- links, AND draft/void invoices (a visitor can never tell which).
-- Only public fields (no ids) are ever returned; workspace_name is the
-- seller identity shown on the shared form.

create or replace function public.get_shared_invoice(p_token uuid)
returns table (
  invoice_number integer,
  title text,
  client_name text,
  status text,
  items jsonb,
  tax_percent numeric,
  notes text,
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  workspace_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select i.invoice_number, i.title, i.client_name, i.status, i.items,
           i.tax_percent, i.notes, i.due_date, i.sent_at, i.paid_at,
           w.name
      from public.invoice_links il
      join public.invoices i on i.id = il.invoice_id
      join public.workspaces w on w.id = i.workspace_id
     where il.token = p_token
       and il.revoked_at is null
       and i.status in ('sent', 'paid');
end;
$$;
