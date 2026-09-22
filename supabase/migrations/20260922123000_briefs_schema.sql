-- Step 3: briefs, brief sources, clarifying questions, edit history.
-- Scoped to workspaces from Step 2; RLS reuses is_workspace_member()
-- and the SECURITY DEFINER helper pattern to avoid recursive policies.

-- ──────────────────────────── Tables ────────────────────────────

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  objective text,
  deliverables jsonb not null default '[]'::jsonb, -- array of {id, text, checked}
  budget_timeline text,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved')),
  owner_id uuid references auth.users(id) on delete set null,
  client_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists briefs_workspace_id_idx
  on public.briefs (workspace_id, created_at desc);

create table if not exists public.brief_sources (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  source_type text not null check (source_type in ('email', 'call_notes', 'chat', 'manual')),
  raw_content text not null,          -- original pasted text, NEVER edited
  metadata jsonb not null default '{}'::jsonb, -- {from, subject, received_at, ...}
  created_at timestamptz not null default now()
);

create index if not exists brief_sources_brief_id_idx
  on public.brief_sources (brief_id);

create table if not exists public.brief_questions (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  question_text text not null,
  context_note text,                  -- why this was flagged, e.g. client said "maybe"
  status text not null default 'open' check (status in ('open', 'resolved')),
  answer_text text,                   -- filled in when resolved
  answered_by text,                   -- e.g. "Priya (client)" or a user's name
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists brief_questions_brief_id_idx
  on public.brief_questions (brief_id);

create table if not exists public.brief_edit_history (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, -- null = system/AI
  action_type text not null,          -- 'generated' | 'field_edited' | 'question_resolved' | 'status_changed' | ...
  description text not null,          -- human-readable, e.g. "edited Budget & timeline"
  created_at timestamptz not null default now()
);

create index if not exists brief_edit_history_brief_id_idx
  on public.brief_edit_history (brief_id);

alter table public.briefs enable row level security;
alter table public.brief_sources enable row level security;
alter table public.brief_questions enable row level security;
alter table public.brief_edit_history enable row level security;

-- ───────────── Policy helper: brief → workspace join ────────────
-- SECURITY DEFINER so child-table policies can resolve a brief's owning
-- workspace without the subquery being subject to briefs' own RLS.

create or replace function public.workspace_id_of_brief(brief_uuid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_id from public.briefs where id = brief_uuid;
$$;

-- ──────────────────────────── Policies ──────────────────────────

-- briefs: full CRUD for members of the owning workspace
create policy "briefs: members can select"
  on public.briefs for select
  using (public.is_workspace_member(workspace_id));

create policy "briefs: members can insert"
  on public.briefs for insert
  with check (public.is_workspace_member(workspace_id));

create policy "briefs: members can update"
  on public.briefs for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "briefs: members can delete"
  on public.briefs for delete
  using (public.is_workspace_member(workspace_id));

-- brief_sources: select/insert/delete only — deliberately NO update policy.
-- raw_content must stay immutable once created; with no UPDATE policy the
-- database itself rejects any modification (RLS error), regardless of what
-- application code does. Application code is still responsible for never
-- attempting edits, but this enforces it at the database level.
create policy "brief_sources: members can select"
  on public.brief_sources for select
  using (public.is_workspace_member(public.workspace_id_of_brief(brief_id)));

create policy "brief_sources: members can insert"
  on public.brief_sources for insert
  with check (public.is_workspace_member(public.workspace_id_of_brief(brief_id)));

create policy "brief_sources: members can delete"
  on public.brief_sources for delete
  using (public.is_workspace_member(public.workspace_id_of_brief(brief_id)));

-- brief_questions: full CRUD for members (resolving a question = update)
create policy "brief_questions: members can select"
  on public.brief_questions for select
  using (public.is_workspace_member(public.workspace_id_of_brief(brief_id)));

create policy "brief_questions: members can insert"
  on public.brief_questions for insert
  with check (public.is_workspace_member(public.workspace_id_of_brief(brief_id)));

create policy "brief_questions: members can update"
  on public.brief_questions for update
  using (public.is_workspace_member(public.workspace_id_of_brief(brief_id)))
  with check (public.is_workspace_member(public.workspace_id_of_brief(brief_id)));

create policy "brief_questions: members can delete"
  on public.brief_questions for delete
  using (public.is_workspace_member(public.workspace_id_of_brief(brief_id)));

-- brief_edit_history: append-only for members (no update/delete policies)
create policy "brief_edit_history: members can select"
  on public.brief_edit_history for select
  using (public.is_workspace_member(public.workspace_id_of_brief(brief_id)));

create policy "brief_edit_history: members can insert"
  on public.brief_edit_history for insert
  with check (public.is_workspace_member(public.workspace_id_of_brief(brief_id)));

-- ───────────── Trigger: keep updated_at honest ──────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists briefs_touch_updated_at on public.briefs;
create trigger briefs_touch_updated_at
  before update on public.briefs
  for each row
  execute function public.touch_updated_at();

-- ────── Trigger: log status changes into edit history ───────────
-- BEFORE UPDATE, comparing OLD.status vs NEW.status. SECURITY DEFINER so
-- the history insert always succeeds (also for system/AI actors where
-- auth.uid() is null).

create or replace function public.briefs_log_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.brief_edit_history (brief_id, user_id, action_type, description)
    values (
      new.id,
      auth.uid(),
      'status_changed',
      'status changed from ' || old.status || ' to ' || new.status
    );
  end if;
  return new;
end;
$$;

drop trigger if exists briefs_log_status_change on public.briefs;
create trigger briefs_log_status_change
  before update on public.briefs
  for each row
  execute function public.briefs_log_status_change();

-- ────── RPC: atomic single-field edit + history entry ───────────
-- Used by lib/data/briefs.ts updateBriefField(). Updates one whitelisted
-- field and appends the matching brief_edit_history row as one function
-- (= one transaction). 'status' is intentionally NOT editable here: status
-- edits go through a plain UPDATE so the trigger above can log old → new.

create or replace function public.update_brief_field(
  brief_uuid uuid,
  field_name text,
  new_value jsonb,
  editor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text;
begin
  if not public.is_workspace_member(public.workspace_id_of_brief(brief_uuid)) then
    raise exception 'not_authorized for brief %', brief_uuid;
  end if;

  if field_name not in ('title', 'objective', 'deliverables', 'budget_timeline', 'client_name', 'owner_id') then
    raise exception 'field_not_editable: %', field_name;
  end if;

  display_name := case field_name
    when 'title' then 'Title'
    when 'objective' then 'Objective'
    when 'deliverables' then 'Deliverables'
    when 'budget_timeline' then 'Budget & timeline'
    when 'client_name' then 'Client name'
    when 'owner_id' then 'Owner'
  end;

  if field_name = 'deliverables' then
    update public.briefs set deliverables = new_value where id = brief_uuid;
  elsif field_name = 'owner_id' then
    update public.briefs set owner_id = nullif(new_value #>> '{}', '')::uuid where id = brief_uuid;
  else
    -- text-typed columns: jsonb → text extraction ('null' JSON → SQL NULL = clears the field)
    execute format('update public.briefs set %I = $1 where id = $2', field_name)
    using new_value #>> '{}', brief_uuid;
  end if;

  insert into public.brief_edit_history (brief_id, user_id, action_type, description)
  values (brief_uuid, editor_id, 'field_edited', 'edited ' || display_name);
end;
$$;
