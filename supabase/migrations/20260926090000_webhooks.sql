-- Phase: events/webhooks foundation — outbound webhook endpoints +
-- delivery log.
--
-- DESIGN DECISIONS (locked):
--   * Endpoints are OWNER-managed (register / remove; the signing secret
--     is generated app-side). NO update policy on purpose — secret
--     rotation = delete + re-register.
--   * Dispatch runs as the ACTING USER (whoever caused the transition,
--     often a plain member), so endpoint loading goes through the
--     SECURITY DEFINER RPC below — which re-checks membership so it can
--     never leak another workspace's URLs or secrets.
--   * Deliveries are the per-endpoint-per-event audit row (unique pair):
--     status pending → delivered | failed, attempts counted, last_error
--     kept. Members may insert/update (they drive dispatch); only owners
--     read (URLs and errors are workspace infrastructure).
--   * Retries are app-layer (lib/webhook-dispatch.ts): 3 attempts with
--     15s / 60s backoff.

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url text not null,
  signing_secret text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists webhook_endpoints_ws_url_idx
  on public.webhook_endpoints (workspace_id, url);

alter table public.webhook_endpoints enable row level security;

create policy "webhook_endpoints: owners can select"
  on public.webhook_endpoints for select
  using (public.is_workspace_owner(workspace_id));

create policy "webhook_endpoints: owners can insert"
  on public.webhook_endpoints for insert
  with check (public.is_workspace_owner(workspace_id));

create policy "webhook_endpoints: owners can delete"
  on public.webhook_endpoints for delete
  using (public.is_workspace_owner(workspace_id));

-- Deliberately NO update policy (rotation = delete + re-register).

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One delivery row per endpoint × event (retries update the same row).
create unique index if not exists webhook_deliveries_pair_idx
  on public.webhook_deliveries (endpoint_id, event_id);

create index if not exists webhook_deliveries_workspace_idx
  on public.webhook_deliveries (workspace_id, created_at desc);

alter table public.webhook_deliveries enable row level security;

create policy "webhook_deliveries: owners can select"
  on public.webhook_deliveries for select
  using (public.is_workspace_owner(workspace_id));

create policy "webhook_deliveries: members can insert"
  on public.webhook_deliveries for insert
  with check (public.is_workspace_member(workspace_id));

create policy "webhook_deliveries: members can update"
  on public.webhook_deliveries for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- No delete policy: delivery rows are the audit trail.

drop trigger if exists webhook_deliveries_touch_updated_at on public.webhook_deliveries;
create trigger webhook_deliveries_touch_updated_at
  before update on public.webhook_deliveries
  for each row
  execute function public.touch_updated_at();

-- Endpoint loading for dispatch: the acting user is often a plain member
-- (not the owner who registered the endpoint), so dispatch needs a
-- SECURITY DEFINER reader — membership-gated so it can never leak another
-- workspace's URLs or signing secrets.
create or replace function public.get_workspace_webhook_endpoints(p_workspace_id uuid)
returns table (id uuid, url text, signing_secret text)
language sql
security definer
set search_path = public
stable
as $$
  select e.id, e.url, e.signing_secret
  from public.webhook_endpoints e
  where e.workspace_id = p_workspace_id
    and public.is_workspace_member(p_workspace_id);
$$;

-- No explicit grants: Supabase's default privileges cover function
-- execution (and PGlite — this project's offline verify target — has no
-- anon/authenticated roles). Safe under any grant set: the function body
-- re-checks is_workspace_member, so callers outside the workspace always
-- get zero rows.
