-- Step 22 (role management — Step 15 follow-up): owners can change a
-- workspace member's role. Invites only ever grant 'member', so this is
-- the ONLY path to an owner role — and the only path to demote one.
--
-- Before this migration workspace_members had no UPDATE policy at all,
-- so role changes were impossible at the DB level.
--
-- Invariants (defense in depth — the server action enforces the same):
--   * owner-gated, both directions (USING + WITH CHECK);
--   * NO SELF-ROLE-CHANGES — the only way to empty a workspace's owner
--     set is the last owner demoting THEMSELVES, which is "leaving",
--     a different, unbuilt action (same cut as Step 21's self-removal);
--   * LAST-OWNER GUARD — a demotion that would leave the workspace with
--     zero owners is rejected (is_last_owner). With one owner the actor
--     can only be that owner (owner-gated), so in practice the self
--     clause fires first; the guard is the independent DB-level
--     invariant for any future actor path;
--   * identity is pinned by a BEFORE UPDATE trigger (OLD is not
--     referenceable in WITH CHECK) — an update may change `role` and
--     nothing else, so a raw client cannot reassign the membership to
--     another user to sidestep the last-owner guard.
--
-- House style: no `to` clause; auth.uid() helpers gate everything,
-- which is also what lets verify-db exercise the policy as nstester.

-- SECURITY DEFINER (search_path pinned) like is_workspace_owner():
-- true when the workspace has exactly ONE owner and `uid` is them.
create or replace function public.is_last_owner(ws_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*)
      from public.workspace_members wm
     where wm.workspace_id = ws_id
       and wm.role = 'owner'
  ) = 1
  and exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = ws_id
       and wm.user_id = uid
       and wm.role = 'owner'
  );
$$;

create policy "workspace_members: owners can update roles"
  on public.workspace_members for update
  using (public.is_workspace_owner(workspace_id))
  with check (
    public.is_workspace_owner(workspace_id)
    -- no self role-changes (self-demotion is "leaving", unbuilt)
    and (auth.uid() is null or auth.uid() <> user_id)
    -- a workspace must always keep at least one owner
    and not (role = 'member' and public.is_last_owner(workspace_id, user_id))
  );

-- Role is the only mutable column (trigger precedent: the briefs
-- status-change trigger). Fires for every update, so it also protects
-- the last-owner guard from reassignment attempts.
create or replace function public.workspace_members_role_only()
returns trigger
language plpgsql
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.user_id is distinct from old.user_id then
    raise exception 'workspace_members: only role is mutable';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_members_role_only
  on public.workspace_members;
create trigger workspace_members_role_only
  before update on public.workspace_members
  for each row
  execute function public.workspace_members_role_only();
