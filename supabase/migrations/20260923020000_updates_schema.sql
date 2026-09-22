-- Step 9: updates. Every update originates from a plan (plan_id NOT NULL).
-- An update starts as an auto-generated draft (markdown snapshot of the
-- plan's tasks) and is then hand-edited in the composer before being
-- marked 'sent'.

-- ──────────────────────────── Table ─────────────────────────────

create table if not exists public.updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  title text not null,
  client_name text,
  status text not null default 'draft'
    check (status in ('draft', 'sent')),
  body text not null default '', -- composed markdown content, editable; '' avoids null-vs-empty in the composer
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists updates_workspace_id_idx
  on public.updates (workspace_id, created_at desc);

alter table public.updates enable row level security;

-- ──────────────────────────── Policies ──────────────────────────
-- updates carries workspace_id directly → inline is_workspace_member()
-- policies; body lives on the row, so no child table / SECURITY DEFINER
-- helper needed.

create policy "updates: members can select"
  on public.updates for select
  using (public.is_workspace_member(workspace_id));

create policy "updates: members can insert"
  on public.updates for insert
  with check (public.is_workspace_member(workspace_id));

create policy "updates: members can update"
  on public.updates for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ───────────── Trigger: keep updated_at honest ──────────────────
-- Reuses touch_updated_at() from the briefs migration.

drop trigger if exists updates_touch_updated_at on public.updates;
create trigger updates_touch_updated_at
  before update on public.updates
  for each row
  execute function public.touch_updated_at();
