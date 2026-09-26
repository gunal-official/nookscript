-- Step 11: templates — workspace configuration snippets, hand-authored
-- (no AI, no generation, no pipeline lineage).
--
-- PERMISSION MODEL (deliberately different from every prior entity):
--   * select → any workspace MEMBER (is_workspace_member): templates are
--     readable by everyone in the workspace
--   * insert/update/delete → workspace OWNERS only (is_workspace_owner,
--     the existing helper from Step 2): templates are configuration, not
--     pipeline content
--   * delete → the app's FIRST delete policy: templates have no downstream
--     references and no audit value, so it's a hard delete (no archive).

-- ──────────────────────────── Table ─────────────────────────────

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_workspace_id_idx
  on public.templates (workspace_id, created_at desc);

alter table public.templates enable row level security;

-- ──────────────────────────── Policies ──────────────────────────

create policy "templates: members can select"
  on public.templates for select
  using (public.is_workspace_member(workspace_id));

create policy "templates: owners can insert"
  on public.templates for insert
  with check (public.is_workspace_owner(workspace_id));

create policy "templates: owners can update"
  on public.templates for update
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

-- The app's first DELETE policy.
create policy "templates: owners can delete"
  on public.templates for delete
  using (public.is_workspace_owner(workspace_id));

-- ───────────── Trigger: keep updated_at honest ──────────────────

drop trigger if exists templates_touch_updated_at on public.templates;
create trigger templates_touch_updated_at
  before update on public.templates
  for each row
  execute function public.touch_updated_at();
