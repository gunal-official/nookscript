-- Step 16: active-workspace selection (workspace switcher).
--
-- profiles.active_workspace_id pins which of the caller's workspaces the
-- app shows. NULL = fall back to the first-joined membership, so every
-- pre-existing account behaves exactly as before until they switch.
-- Writes go through the EXISTING profiles "update own" policy (validated
-- against real membership by the setActiveWorkspace server action) — no
-- new RLS needed, and no product-table policy changes: RLS stays the
-- membership-based security gate; this column only steers the TS-layer
-- workspace filter each list read now applies.
--
-- Apply via: Supabase Dashboard → SQL Editor → paste → Run
--        or: supabase db push  (if using the Supabase CLI)

alter table public.profiles
  add column if not exists active_workspace_id uuid
  references public.workspaces(id) on delete set null;

-- ───────── Members list: active-workspace aware ─────────────────
-- Same output shape as the Step-15 version (Team card unchanged); only
-- the workspace derivation changes: the caller's active_workspace_id
-- when it points at a workspace they actually belong to, otherwise the
-- first-joined membership — so a stale pointer (e.g. after being
-- removed from that workspace) heals itself on the next read.

create or replace function public.get_workspace_members()
returns table (
  user_id uuid,
  full_name text,
  avatar_initials text,
  role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  select p.active_workspace_id into v_workspace_id
    from public.profiles p
   where p.id = auth.uid();

  if v_workspace_id is null
     or not public.is_workspace_member(v_workspace_id) then
    select wm.workspace_id into v_workspace_id
      from public.workspace_members wm
     where wm.user_id = auth.uid()
     order by wm.created_at asc
     limit 1;
  end if;

  if v_workspace_id is null then
    return;
  end if;

  return query
    select wm.user_id, p.full_name, p.avatar_initials, wm.role, wm.created_at
      from public.workspace_members wm
      left join public.profiles p on p.id = wm.user_id
     where wm.workspace_id = v_workspace_id
     order by wm.created_at asc;
end;
$$;
