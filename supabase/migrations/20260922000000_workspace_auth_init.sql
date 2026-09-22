-- Step 2: auth + multi-tenant workspace model
-- Tables: workspaces, workspace_members, profiles
-- Plus: RLS policies, helper functions, triggers (profile auto-create, initials).
--
-- Apply via: Supabase Dashboard → SQL Editor → paste → Run
--        or: supabase db push  (if using the Supabase CLI)

-- ──────────────────────────── Tables ────────────────────────────

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_initials text,
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profiles enable row level security;

-- ────────────────────── RLS helper functions ────────────────────
-- SECURITY DEFINER so policies can test membership without recursively
-- querying workspace_members through its own RLS policies.

create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = ws_id
       and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_owner(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = ws_id
       and wm.user_id = auth.uid()
       and wm.role = 'owner'
  );
$$;

-- ──────────────────────────── Policies ──────────────────────────

-- profiles: users can select/update only their own row
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
-- (no insert/delete policies: rows are created by the auth trigger and
-- cascade on user deletion)

-- workspaces: selectable only by members; created only via create_workspace()
create policy "workspaces: members can select"
  on public.workspaces for select
  using (public.is_workspace_member(id));

-- workspace_members: see members of your own workspaces; only owners can
-- add or remove members (the bootstrap owner row is written by
-- create_workspace(), which bypasses RLS as SECURITY DEFINER)
create policy "workspace_members: members can select"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace_members: owners can insert"
  on public.workspace_members for insert
  with check (public.is_workspace_owner(workspace_id));

create policy "workspace_members: owners can delete"
  on public.workspace_members for delete
  using (public.is_workspace_owner(workspace_id));

-- ─────────────── Workspace bootstrap (atomic) ───────────────────
-- Creates a workspace + the caller's owner membership in one transaction.
-- Called from the signup server action via supabase.rpc('create_workspace').

create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if workspace_name is null or btrim(workspace_name) = '' then
    raise exception 'workspace_name_required';
  end if;

  insert into public.workspaces (name)
  values (btrim(workspace_name))
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, auth.uid(), 'owner');

  return new_workspace_id;
end;
$$;

-- ─────────────── Avatar initials derivation ─────────────────────
-- "Ada Lovelace" → AL · "ada" → A · null/empty → U

create or replace function public.derive_initials(full_name text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  if full_name is null or btrim(full_name) = '' then
    return 'U';
  end if;
  parts := regexp_split_to_array(btrim(full_name), '\s+');
  if array_length(parts, 1) > 1 then
    return upper(left(parts[1], 1) || left(parts[array_length(parts, 1)], 1));
  end if;
  return upper(left(parts[1], 1));
end;
$$;

create or replace function public.profiles_derive_initials()
returns trigger
language plpgsql
as $$
begin
  if new.avatar_initials is null then
    new.avatar_initials := public.derive_initials(new.full_name);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_derive_initials on public.profiles;
create trigger profiles_derive_initials
  before insert or update on public.profiles
  for each row
  execute function public.profiles_derive_initials();

-- ─────────────── New-user → profile trigger ─────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
