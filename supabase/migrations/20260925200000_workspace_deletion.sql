-- Step 27 (workspace deletion — the escape hatch the Step-26 leave arc
-- exposed): owners can DESTROY a workspace. Until now a sole owner was
-- trapped — the last-owner guard (correctly) refused their leave and
-- nothing offered deletion. The schema has been deletion-ready since
-- day one: every workspace_id FK cascades and profiles.active_workspace_id
-- is ON DELETE SET NULL — only the policy was missing.
--
-- Two pieces:
--   1. DELETE POLICY on workspaces — owner-gated (is_workspace_owner),
--      house style (no `to` clause; verify-db exercises it as nstester);
--   2. the Step-26 keep_last_owner trigger learns the one exception:
--      cascaded membership deletes that happen BECAUSE the workspace row
--      itself is being deleted must not raise. (A live workspace always
--      keeps an owner; a dying one is not orphaning anything.) Without
--      this, deleting a solo workspace would die on its own owner's row.

create policy "workspaces: owners can delete"
  on public.workspaces for delete
  using (public.is_workspace_owner(id));

create or replace function public.workspace_members_keep_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The workspace row is already gone when a cascade lands here —
  -- nothing to orphan, let the deletion proceed. A DIRECT membership
  -- delete (workspace still there) keeps the guard.
  if exists (
       select 1 from public.workspaces w where w.id = old.workspace_id
     )
     and old.role = 'owner'
     and public.is_last_owner(old.workspace_id, old.user_id) then
    raise exception 'workspace_members: the last owner cannot be deleted';
  end if;
  return old;
end;
$$;
