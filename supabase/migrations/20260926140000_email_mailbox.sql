-- Phase: email intake — Gmail/Outlook mailbox sync (future-list item
-- "Gmail/Outlook"). Connected mailboxes stage incoming mail for the
-- workspace; staged mail is attached to briefs through the EXISTING
-- create_brief_bundle() RPC (source_type 'email' was first-class since
-- the briefs schema) — this migration adds the mailbox + staged-mail
-- state only.
--
-- DESIGN DECISIONS (locked):
--   * One row per (workspace, service, address) — re-connecting the same
--     mailbox rotates the tokens in place (the OAuth callback upserts).
--   * Tokens are stored ONLY as AES-256-GCM ciphertext (lib/email/crypto)
--     keyed by EMAIL_TOKEN_ENCRYPTION_KEY (server env, never in the DB).
--     Members' SELECT policy returns ciphertext by design — column-level
--     filtering doesn't exist in RLS, and the ciphertext is useless
--     without the server-side key.
--   * email_messages has NO user write policies: rows are written only
--     by the service role (OAuth callback / sync action / cron sweep),
--     after provider authentication. The one exception is
--     attached_brief_id, which the owner-side "create brief from mail"
--     action updates through the service client (same trust model as the
--     Stripe webhook route).
--   * unique(account_id, external_id) makes every sync idempotent: the
--     same provider message is never staged twice.
--   * attached_brief_id → briefs(id) ON DELETE SET NULL: deleting a
--     brief detaches the mail (the mail row is a sync artifact, not a
--     brief child).

create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service text not null check (service in ('gmail', 'outlook')),
  email_address text not null,
  display_name text,
  access_token_enc text not null,
  refresh_token_enc text not null,
  token_expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'needs_reauth')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (workspace_id, service, email_address)
);

create index if not exists email_accounts_workspace_idx
  on public.email_accounts (workspace_id);

alter table public.email_accounts enable row level security;

create policy "email_accounts: members can select"
  on public.email_accounts for select
  using (public.is_workspace_member(workspace_id));

-- No insert/update/delete policies: the OAuth callback route and the
-- owner-side sync/disconnect actions write through the service role.

drop trigger if exists email_accounts_touch_updated_at on public.email_accounts;
-- (no updated_at column — last_synced_at/last_error carry the freshness)

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.email_accounts(id) on delete cascade,
  external_id text not null,
  sender text not null,
  subject text,
  snippet text,
  body_text text,
  received_at timestamptz not null,
  attached_brief_id uuid references public.briefs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, external_id)
);

create index if not exists email_messages_workspace_received_idx
  on public.email_messages (workspace_id, received_at desc);

create index if not exists email_messages_staging_idx
  on public.email_messages (workspace_id) where attached_brief_id is null;

alter table public.email_messages enable row level security;

create policy "email_messages: members can select"
  on public.email_messages for select
  using (public.is_workspace_member(workspace_id));

-- No user write policies: service-role only (see header).
-- (The local-verification role nstester is created by
-- scripts/verify-db.mjs AFTER migrations apply — its grants live there,
-- matching the billing tables' house pattern.)
