-- Step 10: share_links — public, read-only, revocable links for updates.
--
-- SECURITY MODEL (deliberate; do not "simplify"):
--   * share_links is fully member-gated via ordinary is_workspace_member()
--     RLS, like every other table. Public visitors NEVER query it directly.
--   * Public reads go through get_shared_document(), a SECURITY DEFINER
--     function (runs as owner → bypasses RLS) that validates the token and
--     liveness internally and returns only the update's public fields.
--   * An anon-SELECT policy on share_links/updates is intentionally NOT
--     used: RLS cannot bind to the requester's token, so such a policy
--     would make shared rows enumerable via the anon key.

-- ──────────────────────────── Table ─────────────────────────────

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- one link per update; cascades away with the update
  update_id uuid not null unique references public.updates(id) on delete cascade,
  -- UNIQUE both enforces unguessable-address uniqueness and provides the
  -- lookup index for get_shared_document() (no separate index needed)
  token uuid not null unique default gen_random_uuid(),
  revoked_at timestamptz, -- null = active; revocation keeps the row (audit trail)
  created_at timestamptz not null default now()
);

alter table public.share_links enable row level security;

-- ──────────────────────────── Policies ──────────────────────────
-- Member management only (create/revoke/regenerate happen through
-- authenticated app server actions).

create policy "share_links: members can select"
  on public.share_links for select
  using (public.is_workspace_member(workspace_id));

create policy "share_links: members can insert"
  on public.share_links for insert
  with check (public.is_workspace_member(workspace_id));

create policy "share_links: members can update"
  on public.share_links for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ────────── Public read: token-gated SECURITY DEFINER RPC ───────
-- Follows the create_brief_bundle() precedent (definer + search_path pin +
-- internal guards). EXECUTE is granted to PUBLIC by default, which is what
-- makes this callable by anonymous visitors without any GRANT statement.
-- Invalid and revoked tokens both return ZERO ROWS — indistinguishable by
-- design, and only public fields (no ids) are ever returned.

create or replace function public.get_shared_document(p_token uuid)
returns table (
  title text,
  client_name text,
  status text,
  body text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select u.title, u.client_name, u.status, u.body, u.updated_at
      from public.share_links sl
      join public.updates u on u.id = sl.update_id
     where sl.token = p_token
       and sl.revoked_at is null;
end;
$$;
