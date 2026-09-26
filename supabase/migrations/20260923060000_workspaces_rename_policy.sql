-- Post-roadmap item: workspaces currently has a SELECT-only policy set
-- (Step 2), so the name set at signup can never be changed. Add an
-- owner-only UPDATE policy, consistent with the owner/member permission
-- precedent from templates (Step 11) using is_workspace_owner().
--
-- Note: this is a full-row UPDATE policy (no column restriction) — the
-- only other columns are id (same-row PK; changing it breaks child FKs,
-- which lack ON UPDATE CASCADE, so it self-blocks) and created_at
-- (harmless metadata). The server action only writes `name`, and the
-- policy's purpose is authorization, not field whitelisting.

create policy "workspaces: owners can update"
  on public.workspaces for update
  using (public.is_workspace_owner(id))
  with check (public.is_workspace_owner(id));
