-- Step 8: plans. Every plan originates from a proposal
-- (proposal_id NOT NULL). Tasks live in a jsonb column ({id, text,
-- checked}[]) — copied from the source proposal's deliverables at creation
-- time — and are toggled in place by whole-array writes from the app.

-- ──────────────────────────── Table ─────────────────────────────

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  title text not null,
  client_name text,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'done')),
  budget_timeline text,
  tasks jsonb not null default '[]'::jsonb, -- array of {id, text, checked}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plans_workspace_id_idx
  on public.plans (workspace_id, created_at desc);

alter table public.plans enable row level security;

-- ──────────────────────────── Policies ──────────────────────────
-- plans carries workspace_id directly, so policies call
-- is_workspace_member() inline (tasks are jsonb, so no child table and
-- no SECURITY DEFINER helper needed).

create policy "plans: members can select"
  on public.plans for select
  using (public.is_workspace_member(workspace_id));

create policy "plans: members can insert"
  on public.plans for insert
  with check (public.is_workspace_member(workspace_id));

create policy "plans: members can update"
  on public.plans for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ───────────── Trigger: keep updated_at honest ──────────────────
-- Reuses touch_updated_at() from the briefs migration.

drop trigger if exists plans_touch_updated_at on public.plans;
create trigger plans_touch_updated_at
  before update on public.plans
  for each row
  execute function public.touch_updated_at();
