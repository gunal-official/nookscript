-- Step 26 (leave-workspace — the "not available yet" self-removal):
-- members can take THEMSELVES out of a workspace. Three layers, same
-- house style as Steps 21–22:
--
--   1. DELETE POLICY — the Step-2 owner-only policy gains a self clause
--      (auth.uid() = user_id): a member can delete their OWN membership
--      row and still cannot touch anyone else's (the is_workspace_owner
--      clause keeps owner-removal exactly as it was);
--   2. LAST-OWNER GUARD — a BEFORE DELETE trigger rejects deleting an
--      owner row that is the workspace's only owner (is_last_owner).
--      Both paths are covered: self-leave AND owner-removal. Until now
--      this guard lived only in the Step-21 server action — a raw
--      client could still delete the row;
--   3. POINTER HYGIENE (Step 25, DB grade) — an AFTER DELETE trigger
--      clears the departed user's profiles.active_workspace_id when it
--      names the workspace they just left. The Step-25 app helpers stay
--      as best-effort, but note the owner-removal path cannot update
--      the VICTIM's profile row under "profiles: update own" RLS —
--      this SECURITY DEFINER trigger is the authoritative cleanup for
--      every delete path (owner-removal, self-leave, raw SQL).
--
-- House style: no `to` clause; auth.uid() helpers gate everything,
-- which is also what lets verify-db exercise the policy as nstester.

drop policy if exists "workspace_members: owners can delete"
  on public.workspace_members;
create policy "workspace_members: owners can delete, self can leave"
  on public.workspace_members for delete
  using (
    public.is_workspace_owner(workspace_id)
    or (auth.uid() is not null and auth.uid() = user_id)
  );

-- A workspace must always keep at least one owner (Step 22's UPDATE
-- guard finally has its DELETE counterpart). Actor-agnostic.
create or replace function public.workspace_members_keep_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and public.is_last_owner(old.workspace_id, old.user_id) then
    raise exception 'workspace_members: the last owner cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists workspace_members_keep_last_owner
  on public.workspace_members;
create trigger workspace_members_keep_last_owner
  before delete on public.workspace_members
  for each row
  execute function public.workspace_members_keep_last_owner();

-- SECURITY DEFINER (search_path pinned) like is_workspace_owner(): the
-- deleter is often someone ELSE (owner removal), who has no UPDATE
-- rights on the departed user's profile row.
create or replace function public.workspace_members_clear_active_pointer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set active_workspace_id = null
   where id = old.user_id
     and active_workspace_id = old.workspace_id;
  return old;
end;
$$;

drop trigger if exists workspace_members_clear_active_pointer
  on public.workspace_members;
create trigger workspace_members_clear_active_pointer
  after delete on public.workspace_members
  for each row
  execute function public.workspace_members_clear_active_pointer();
