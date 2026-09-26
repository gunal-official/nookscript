-- Step 7: proposals. Every proposal originates from a brief
-- (brief_id NOT NULL). Content is copied from the source brief at creation
-- time — deterministic field copying, no AI generation.

-- ──────────────────────────── Table ─────────────────────────────

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brief_id uuid not null references public.briefs(id) on delete cascade,
  title text not null,
  client_name text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined')),
  budget_timeline text,
  deliverables jsonb not null default '[]'::jsonb, -- array of {id, text, checked}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_workspace_id_idx
  on public.proposals (workspace_id, created_at desc);

alter table public.proposals enable row level security;

-- ──────────────────────────── Policies ──────────────────────────
-- proposals carries workspace_id directly, so policies can call
-- is_workspace_member() inline — no SECURITY DEFINER child-table helper
-- needed (that pattern is only for tables reachable via a brief's FK).

create policy "proposals: members can select"
  on public.proposals for select
  using (public.is_workspace_member(workspace_id));

create policy "proposals: members can insert"
  on public.proposals for insert
  with check (public.is_workspace_member(workspace_id));

create policy "proposals: members can update"
  on public.proposals for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ───────────── Trigger: keep updated_at honest ──────────────────
-- Reuses touch_updated_at() from the briefs migration.

drop trigger if exists proposals_touch_updated_at on public.proposals;
create trigger proposals_touch_updated_at
  before update on public.proposals
  for each row
  execute function public.touch_updated_at();
