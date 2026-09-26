# Email intake closeout — Gmail/Outlook mailbox sync (2026-09-26)

**Scope:** the future-list item "Gmail/Outlook". Connected client
mailboxes stage incoming mail for the workspace; staged mail becomes
briefs through the EXISTING pipeline (`create_brief_bundle` RPC,
`source_type 'email'` — first-class since the briefs schema). Deliberate
boundaries: **read-only** (the app never sends mail), **one mailbox per
provider** (v1), **zero new dependencies** (raw `fetch` + `node:crypto` —
the house billing pattern).

## 1. What's in the app now

- **Settings → Mailbox** (`components/settings/MailboxCard.tsx`):
  Connect Gmail / Connect Outlook (owner-only), per-account row
  (address, service chip, last-synced / needs-reauth state, inline
  last-error), **Sync now**, **Disconnect** (two-step inline confirm,
  best-effort provider revocation), and actionable "set these env"
  hints per provider when credentials are missing.
- **Inbox → Staged mail** (`components/intake/MailboxStaging.tsx`):
  the 20 newest unattached messages (sender, subject, snippet,
  time-ago, service chip) with **Create brief** (editors) — creates the
  brief via `create_brief_bundle` (source metadata carries from/subject/
  received_at/provider/message-id) and marks the message attached, so it
  drops out of staging and appears on the brief's Sources card.
- **OAuth (2-step, owner-gated):** `/api/email/connect?provider=…` →
  provider consent screen; `/api/email/callback` redeems the code. The
  `state` param is HMAC-SIGNED per (user, workspace, provider) —
  `lib/email/state.ts` — so a tampered/leaked callback can never route
  one user's tokens into another workspace, and a Gmail code can't be
  redeemed as Outlook. The provider's own cancel/error path lands back
  with an actionable toast (`EmailNotice`, ?email=contract mirrors
  CheckoutNotice).
- **Tokens:** AES-256-GCM at rest (`lib/email/crypto.ts`,
  `EMAIL_TOKEN_ENCRYPTION_KEY` = 64 hex). The OAuth callback resolves
  the mailbox address (Gmail profile / Graph /me, token-exchange email
  fallback, placeholder last) so re-connecting the same mailbox rotates
  tokens in place (`unique(workspace_id, service, email_address)`).
- **Sync:** `lib/email/sync.ts` normalizes both providers to one shape
  (multipart-aware Gmail body extraction with base64url fragments;
  Graph HTML→text best-effort). Staging upserts on
  `unique(account_id, external_id)` — every sync is idempotent.
  Expired access tokens are refreshed transparently; a dead refresh
  marks the account `needs_reauth` (Settings shows **Connect again**).
- **Cron sweep:** `POST /api/cron/email` (same `CRON_SECRET` Bearer +
  constant-time gate as `/api/cron/webhooks`) syncs every active
  account — the serverless recovery path when nobody clicks Sync now.
- **DB:** `email_accounts` + `email_messages` (migration
  `20260926140000`) — members SELECT, NO user write policies (service
  role only: OAuth callback, settings actions, cron sweep);
  `attached_brief_id → briefs` ON DELETE SET NULL.

## 2. Operator setup (once — provider consoles; app env is all optional)

**Gmail:** Google Cloud → APIs & Services → enable **Gmail API**;
Credentials → OAuth client ID (**Web application**); add
`https://<your-domain>/api/email/callback` to authorized redirect URIs.
Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.

**Outlook:** Azure → App registrations → New (accounts in your
organization / personal Microsoft accounts, matching
`AZURE_TENANT_ID`); API permissions → Microsoft Graph → **Mail.Read**
(delegated, admin consent as appropriate); set
`AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET`.

**Both:** set `EMAIL_TOKEN_ENCRYPTION_KEY`
(`openssl rand -hex 32`). Optional: point any scheduler at
`POST https://<your-domain>/api/cron/email` with the cron bearer
(15-min to 1-h cadence is plenty — syncs pull ≤25 newest messages).

## 3. Verification

- `npx tsc --noEmit` · `npm run lint` · `npm test` (173/173 — incl.
  `tests/lib/email-crypto|oauth|sync|state.test.ts`: cipher round-trip +
  tamper rejection, exact auth-URL/token-endpoint shapes, both providers'
  normalization fixtures, 401 → re-auth semantics, signed-state
  forgery rejection) · `npm run build` · `npm run verify:db` (mailbox
  block: RLS user-write denial, service CHECK, both unique constraints,
  staging attach/detach).
- `npm run verify:responsive` full sweep — Settings + Inbox at all
  seven widths (unconfigured state shows the actionable env hints;
  the EMAIL_DEMO configured-state sweep renders a connected Gmail
  account + staged mail with working Create-brief buttons).
- The live OAuth round trip (consent → callback → first sync) needs a
  browser that can reach the provider and real OAuth credentials —
  operator-side, by design.

## 4. Known limitations / decisions (v1)

- One mailbox per provider per workspace (disconnect to swap accounts);
  the unique key is what makes re-connect rotate in place.
- Sync pulls the ≤25 newest inbox messages and dedupes in the DB — a
  mailbox with very high volume is covered by sync cadence, not paging.
- HTML bodies are text-stripped best-effort for staging display; the
  raw body text is what becomes the brief source content.
- No per-message delete/reply (staging is a read surface; "Create
  brief" is the action). No event-type for mailbox syncs (the fixed 10
  event types are unchanged; brief.created IS recorded when a staged
  message becomes a brief).
- Members see connected accounts (ciphertext token columns are inert
  without the server key — documented in the migration header); only
  owners manage connections.
