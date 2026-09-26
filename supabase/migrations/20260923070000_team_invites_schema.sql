-- Step 15: team_invites — real invite-and-join flow for existing workspaces.
-- Owner creates a targeted invite (specific email) → copies the link by hand
-- (no automated email — delivery is the owner's own mail/chat, per spec) →
-- the invitee opens /invite/<token> and joins as 'member', whether they
-- already have an account or sign up on the spot.
--
-- SECURITY MODEL (deliberate; mirrors the share_links precedent):
--   * team_invites is owner-only via ordinary is_workspace_owner() RLS.
--     Members don't read invite rows at all; anonymous users never query it.
--   * The pre-auth "what is this link?" probe goes through
--     get_team_invite_preview(), a SECURITY DEFINER function that returns
--     only the workspace name + expiry — never the target email or the
--     workspace id — and returns ZERO ROWS for invalid, revoked, accepted,
--     and expired tokens alike (indistinguishable by design).
--   * Joining goes through accept_team_invite(), SECURITY DEFINER, which
--     requires a session and verifies the invited email matches the
--     caller's account email before writing the membership.
--
-- Apply via: Supabase Dashboard → SQL Editor → paste → Run
--        or: supabase db push  (if using the Supabase CLI)

-- ──────────────────────────── Table ─────────────────────────────

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Targeted invite: only the account with THIS email may accept.
  -- Normalized (lower + trim) on every write path; compared lowercased in
  -- accept_team_invite() as a belt-and-braces fallback.
  email text not null,
  -- UNIQUE both enforces unguessable-address uniqueness and provides the
  -- lookup index for the token RPCs (no separate index needed)
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null, -- set to now() + 14 days by the app
  accepted_at timestamptz,         -- set on accept = consumed (single-use)
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,          -- null = live; revocation keeps the row (audit trail)
  created_at timestamptz not null default now()
  -- no role column on purpose: invites can only ever grant 'member'.
);

-- One PENDING invite per (workspace, email). Accepted and revoked rows are
-- history and deliberately do NOT block re-inviting the same address later.
create unique index if not exists team_invites_one_pending_per_email
  on public.team_invites (workspace_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.team_invites enable row level security;

-- ──────────────────────────── Policies ──────────────────────────
-- Owner-managed only (matching the member-management policies on
-- workspace_members). No member policy, no anon policy, no delete.

create policy "team_invites: owners can select"
  on public.team_invites for select
  using (public.is_workspace_owner(workspace_id));

create policy "team_invites: owners can insert"
  on public.team_invites for insert
  with check (public.is_workspace_owner(workspace_id));

-- update = revoke (revoked_at) only; rows are never deleted or edited
create policy "team_invites: owners can update"
  on public.team_invites for update
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

-- ──────── Public probe: token-gated SECURITY DEFINER RPC ────────
-- Callable anonymously (EXECUTE granted to PUBLIC by default). Returns
-- only the minimum the /invite page needs before auth: which workspace
-- the invite is for. Target email and ids are never exposed pre-auth.

create or replace function public.get_team_invite_preview(p_token uuid)
returns table (
  workspace_name text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select w.name, ti.expires_at
      from public.team_invites ti
      join public.workspaces w on w.id = ti.workspace_id
     where ti.token = p_token
       and ti.revoked_at is null
       and ti.accepted_at is null
       and ti.expires_at > now();
end;
$$;

-- ───────────── Accept: join as member (one transaction) ─────────
-- Caller must be logged in; the invited email must match the caller's
-- account email. Already-a-member accepts are idempotent successes (the
-- invite is still consumed). Returns the joined workspace id.

create or replace function public.accept_team_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.team_invites%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select ti.* into v_invite
    from public.team_invites ti
   where ti.token = p_token
     and ti.revoked_at is null
     and ti.accepted_at is null
     and ti.expires_at > now();

  if not found then
    raise exception 'invite_invalid_or_expired';
  end if;

  select u.email into v_email
    from auth.users u
   where u.id = auth.uid();

  if lower(btrim(v_invite.email)) <> lower(btrim(coalesce(v_email, ''))) then
    raise exception 'invite_email_mismatch';
  end if;

  -- Idempotency: the (workspace_id, user_id) UNIQUE constraint is the
  -- hard backstop; an existing membership is a success, not an error.
  if not exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = v_invite.workspace_id
       and wm.user_id = auth.uid()
  ) then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_invite.workspace_id, auth.uid(), 'member');
  end if;

  update public.team_invites ti
     set accepted_at = now(),
         accepted_by = auth.uid()
   where ti.id = v_invite.id;

  return v_invite.workspace_id;
end;
$$;

-- ───────── Members list: workspace-scoped SECURITY DEFINER ──────
-- profiles RLS is select-own-only, so a member list can't be read through
-- PostgREST today. This RPC is the guarded cross-boundary read (house
-- precedent for cross-table visibility) — it derives the caller's
-- first-joined workspace (the same rule the app layout uses) and returns
-- that workspace's members. Zero rows for anyone without a membership.
-- Emails are deliberately NOT returned: names, initials, role, joined-at.

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

  select wm.workspace_id into v_workspace_id
    from public.workspace_members wm
   where wm.user_id = auth.uid()
   order by wm.created_at asc
   limit 1;

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
