# nookscript

Client-work writing studio: intake → AI briefs → proposals → plans → updates.
Next.js 14 (App Router) · TypeScript · Tailwind · shadcn/ui · Supabase (auth + Postgres + RLS).

## Local setup

```bash
npm ci
```

### 1. Create a Supabase project (free)

1. [supabase.com](https://supabase.com) → New project.
2. **Project Settings → API** → copy the Project URL and anon public key.
3. **Authentication → Providers → Email** → turn **“Confirm email” OFF**
   (enables the single-step signup: user + workspace created in one submit).
   If you leave it ON, signup still works — users confirm their email and are
   asked for a workspace name at first login (`/onboarding`).

### 2. Apply the database migrations

In the dashboard: **SQL Editor → New query** → paste + **Run** each file in
`supabase/migrations/` in filename order (or `supabase link` + `supabase db push`
with the CLI).

This creates `workspaces` / `workspace_members` / `profiles`, the auth
triggers, and the product schema: `briefs` / `brief_sources` /
`brief_questions` / `brief_edit_history` / `proposals` / `plans` /
`updates` / `share_links` / `templates` / `team_invites` / `invoices` /
`invoice_links` / `time_entries` / `contracts` — all RLS-scoped to workspace
membership —
plus the `create_workspace()`, `update_brief_field()`,
`create_brief_bundle()`, and public token-gated `get_shared_document()`
+ `get_shared_invoice()` RPCs and the status-change history +
updated_at touch triggers.

To load demo data (the “Brightloop Co. — Brand Identity Refresh” brief,
plus a login-able demo user `maya@nookscript.dev` / `password123`), run
`supabase/seed.sql` in the SQL Editor afterwards (runs automatically on a
local `supabase db reset`).

### 3. Configure env + run

```bash
cp .env.local.example .env.local   # then fill in the two values
npm run dev
```

Open http://localhost:3000.

## Verify live schema (offline-vs-live drift probe)

`npm run verify:db` proofs the committed migrations against a FRESH
in-memory Postgres — it cannot see whether your REAL hosted project
actually has the latest schema applied. That gap bit us in Step 10: the
offline gate passed 100% while `/share/:token` 404ed at runtime with
PGRST205 (“table not found”) because the `share_links` migration had never
been run on the live project.

Close it with the live probe:

```bash
npm run verify:live
```

It connects to your hosted project with the **anon key** (from
`.env.local` — so unlike `verify:db`, this one needs real project
credentials) and checks that all **12 tables + 5 app-facing RPCs** the
migrations promise are visible to the app (17 items). It is read-only:
table checks use `select * limit 0`, and RPC checks call each function
with guard-tripping arguments so it dies inside the function’s own
auth/membership guard with nothing written. A failure names the exact
missing object and its migration file (“did you forget to run
`supabase db push`?”); exit code is `1` on any miss, `0` when clean —
safe to wire into CI or a pre-deploy check later.

Known gap (future work, not wired now): the probe verifies tables and
RPCs **exist** — it does not check POLICIES. That gap is now closed by
its behavioral sibling `npm run verify:live:policies` (Step 28 below) —
policy-only migrations (workspace rename, roles, leave, deletion,
viewer-role) create no table or RPC, so existence checks alone can't
see them.

## Verify Step 2 (auth + workspaces)

Browser checklist (the “Confirm” list):

1. **Signup** — `/signup`, fill Full name / Email / Password / Workspace name →
   lands on `/intake` with the sidebar showing your workspace name and the
   topbar avatar showing your initials.
2. **Rows created** — `node scripts/verify-auth.mjs` exercises the exact DB/RLS
   flow (signup trigger, initials, owner-only member insert, anonymous reads)
   and prints a ✓/✗ report against your real project.
3. **Schema logic, offline** — `npm run verify:db` applies all migrations
   + seed data to an in-memory WASM Postgres (PGlite) and runs 51 functional
   and RLS assertions: triggers, RPCs, status-history logging, member-only
   visibility on every product table (including `share_links`, whose public
   access is deliberately token-gated through a SECURITY DEFINER RPC rather
   than an anon policy), and the immutability of
   `brief_sources.raw_content`.
4. **Middleware** — in a logged-out/incognito window, visit `/intake` →
   redirected to `/login`. While logged in, `/login` and `/signup` bounce to
   `/intake`. `/`, `/about`, `/pricing`, `/vs/*`, `/share/*` stay public.
5. **Login** — `/login` with the same credentials → `/intake`.
6. **Logout** — topbar “Log out” → back to `/login`; `/intake` is blocked again.

## Verify Step 4 (/intake)

1. Log in (Step 2) and load the migrations + seed (above).
2. **Without** `OPENAI_API_KEY`: paste a client email at `/intake` → Generate.
   The built-in deterministic parser drafts the brief (UI shows a notice).
   With `OPENAI_API_KEY` set in `.env.local`, OpenAI (`gpt-4o-mini`, JSON
   mode) does the extraction instead — same flow.
3. Left panel becomes the read-only source thread; right panel is the
   editable draft (title, client, objective, deliverables checkboxes,
   budget & timeline) plus the accent-tinted **Open questions** box.
4. Edit + **Save brief** → check Table Editor: `briefs` updated,
   `brief_sources` has the verbatim paste (immutable), `brief_questions`
   holds the open questions, `brief_edit_history` shows `generated` +
   `field_edited` rows.
5. Offline proof of the storage layer: `npm run verify:db` (22 assertions,
   incl. the atomic `create_brief_bundle` transaction).

## Verify Step 5 (/briefs/:id)

1. With seed data loaded, open
   `/briefs/00000000-0000-0000-0000-000000000010` — details, questions
   (1 open / 2 resolved), source email, and history all render from the DB.
2. **Status dropdown** → pick “Approved”: `briefs.status` updates and a
   `status_changed` row appears in the History card (written by the DB
   trigger, with you as the actor).
3. **Resolve** the open question → answer + “Answered by” → it moves to
   Resolved with its answer, and history gains `question_resolved`.
4. A bogus or foreign-workspace id shows the “not found” state (RLS hides
   other tenants identically). DB-level proof remains `npm run verify:db`.

## Verify Step 6 (/briefs)

1. Open `/briefs`: the seeded “Brightloop Co.” brief renders as a card —
   Draft badge, client name, “1 open question” badge, “Updated … ago”.
2. Status tabs (All / Draft / In review / Approved, with counts) and the
   search box filter the grid client-side; no matches → “No matching
   briefs” + Clear filters. With zero briefs the page shows the “No briefs
   yet” empty state with a create CTA.
3. Card title links into `/briefs/[id]`; change the status there, navigate
   back — the list reflects it (`updateBriefStatus` revalidates `/briefs`).
4. “New brief” links to `/intake`.

## Verify Step 7 (/proposals)

⚠ New migration in this step — re-apply to your live Supabase project
before manual testing (`supabase db push`, or paste the new migration file
into the SQL Editor), then re-run `supabase/seed.sql`.

1. Run the migrations + seed (see above), then open `/proposals`: the
   seeded “Brightloop Co.” proposal renders — Draft badge, client name,
   “1/3 deliverables done”, “Updated … ago”. Status tabs and search filter
   client-side; there is intentionally no “New” button.
2. Open the proposal → change the status dropdown (Draft → Sent →
   Accepted/Declined): `proposals.status` updates and the list badge
   matches after navigating back.
3. On the proposal page, “View source brief” links to
   `/briefs/00000000-0000-0000-0000-000000000010`.
4. From that brief page, click **Generate proposal** (Details card): a new
   draft proposal is created by copying the brief’s title / client /
   budget / deliverables (deterministic — no AI), and you’re redirected to
   `/proposals/<new-id>`.
5. A bogus or foreign-workspace id shows the “not found” state. DB-level
   proof: `npm run verify:db` (29 checks, incl. proposals CHECK/FK/RLS).

## Verify Step 8 (/plans)

⚠ New migration in this step — re-apply to your live Supabase project
before manual testing (`supabase db push`, or paste
`supabase/migrations/20260923010000_plans_schema.sql` into the SQL
Editor), then re-run `supabase/seed.sql`.

1. Open `/plans`: the seeded “Brightloop Co.” plan renders — Not started
   badge, client name, “1/3 tasks done”, “Updated … ago”. Status tabs and
   search filter client-side; there is intentionally no “New” button.
2. Open the plan → click task checkboxes: they flip immediately
   (optimistic) and persist — `plans.tasks` updates in the Table Editor
   and the “N of M done” counter stays in sync.
3. Change the status dropdown (Not started → In progress → Done):
   `plans.status` updates; the list badge matches after navigating back.
4. “Export as markdown” downloads a client-built `.md` (title, client,
   budget & timeline, `- [x]` / `- [ ]` checklist) — nothing hits the
   server.
5. From the seeded proposal page, **Generate plan** copies fields and maps
   deliverables → tasks (deterministic, ungated on proposal status), then
   redirects to the new plan. DB-level proof: `npm run verify:db`
   (36 checks, incl. plans CHECK/FK/RLS).

## Verify Step 9 (/updates)

⚠ New migration in this step — re-apply to your live Supabase project
before manual testing (`supabase db push`, or paste
`supabase/migrations/20260923020000_updates_schema.sql` into the SQL
Editor), then re-run `supabase/seed.sql`.

1. Open `/updates`: TWO seeded updates render — “…Week 1” (Sent, older)
   and “…Week 2” (Draft, more recent, first in the grid). The All / Draft
   / Sent tabs (with counts) filter between them; search matches title or
   client. There is intentionally no “New” button.
2. Open the “Week 2” draft → edit title/body in the composer → “Unsaved
   changes” chip appears → **Save update**: `updates.title/body` update in
   the Table Editor and the chip clears.
3. Change the status dropdown (Draft → Sent): `updates.status` updates;
   the list badge matches after navigating back.
4. “Export as markdown” downloads a client-built `.md` (title + body) —
   nothing hits the server; it exports last-saved content.
5. From the seeded plan page, **Compose update** generates a draft (dated
   title + task-snapshot body) and redirects to its composer. DB-level
   proof: `npm run verify:db` (43 checks, incl. updates CHECK/FK/RLS).

## Verify Step 10 (/share/:token — public link)

⚠ New migration in this step — re-apply to your live Supabase project
before manual testing (`supabase db push`, or paste
`supabase/migrations/20260923030000_share_links_schema.sql` into the SQL
Editor), then re-run `supabase/seed.sql`.

1. **Working public link from the seed** — open this exact URL in an
   **incognito window** (no login required):
   `http://localhost:3000/share/00000000-0000-0000-0000-000000000051`
   → the seeded “Week 1” sent update renders read-only (title, client,
   Sent badge, body, updated date), with no app shell.
2. **Manage links in-app** — as a logged-in member, open the seeded
   “Week 1” update → the Share card shows the copyable link + **Revoke**.
   After revoking, the incognito URL shows the generic “invalid or
   revoked” state; **Regenerate link** issues a fresh token (old one
   stays dead). The seeded “Week 2” draft shows **Create share link**.
3. **No leak between invalid/revoked** — `/share/demo-token` (route map),
   a revoked token, and a random UUID all render the identical state.
4. **Security model** — `share_links` is fully member-gated; public
   reads go only through the `get_shared_document` SECURITY DEFINER RPC,
   which returns just the update’s public fields (no ids). DB-level
   proof: `npm run verify:db` (51 checks).

## Verify Step 11 (/settings — templates)

⚠ New migration in this step — re-apply to your live Supabase project
(`supabase db push`, or paste
`supabase/migrations/20260923040000_templates_schema.sql` into the SQL
Editor). If you don’t, `/settings` shows its load-error state.

1. Log in with the seeded demo user — they are the **owner** of the demo
   workspace — and open **Settings** (`/settings`): the Templates card
   lists the two seeded snippets with a “New template” button and ✏️/🗑
   per-row actions.
2. **Create / edit** — New template opens a dialog (title + multiline
   body); saving closes it and the list refreshes (sorted by last
   edit). Edit pre-fills the row’s values. A title is required; the body
   may be empty.
3. **Delete** — clicking 🗑 swaps the row’s actions for an inline
   “Delete? Cancel / Delete” confirmation — the app’s first hard DELETE.
4. **Member view** — a plain member sees the same list but **zero
   controls** (hidden, not disabled), a “View only” note, and a
   different empty state. To try it: sign up a second account in the
   app, re-run the seed (every new user is auto-added to the demo
   workspace as a `member`), and log in as them. The split is also
   enforced **twice behind the UI**: server actions re-check the role,
   and RLS rejects non-owner writes outright.
5. DB-level proof: `npm run verify:db` (59 checks, incl. the
   member-view/member-✗-insert/owner-CRUD template assertions).

## Verify Step 12 (/intake/inbox — threaded sources)

⚠ New migration in this step — re-apply to your live Supabase project
(`supabase db push`, or paste
`supabase/migrations/20260923050000_add_brief_source_rpc.sql` into the SQL
Editor). Without it, **"Add to thread" replies fail** (the RPC doesn't
exist) — the page itself keeps rendering. Live-drift probe (run in the SQL
Editor; `null`/missing row = apply the migration first):

```sql
select to_regclass('public.share_links') as share_links,
       to_regclass('public.templates') as templates,
       to_regclass('public.updates') as updates,
       to_regclass('public.plans') as plans;
select proname from pg_proc
 where proname in ('get_shared_document', 'add_brief_source', 'create_brief_bundle');
```

1. Log in with the seeded demo user and open **Inbox** (new sidebar item,
   `/intake/inbox`): the Brightloop thread shows **both seeded emails** —
   the kickoff plus Priya's phase-two follow-up — as chat bubbles,
   oldest-first, threaded and sorted by most-recent source.
2. **Thread a follow-up** — type a reply at the bottom of a thread and
   click *Add to thread*: an optimistic bubble appears, then the real row
   lands (atomic `add_brief_source()` RPC: `brief_sources` insert +
   `source_added` audit entry in one transaction).
3. **Shared thread** — open the Brightloop brief detail: the same reply
   appears in its **Sources card** (which also has its own composer now),
   and a `source_added` entry appears in the History card. `raw_content`
   stays immutable — `brief_sources` still has zero UPDATE policies.
4. Generate a brand-new brief from `/intake` → its source shows up here
   as a new thread instantly.
5. DB-level proof: `npm run verify:db` (66 checks, incl. member-thread
   happy path, foreign-workspace rejection with **atomicity** (no partial
   rows), `bad_source_type` guard, and the seeded thread-ordering
   assertion).

## Verify Step 13 (marketing pages — /, /about, /pricing, /vs/notion)

⚠ No new migration in this step — `npm run verify:db` is **unchanged at
66 checks / 9 migrations**; there is zero database surface here (static
content only).

1. Open `/`: the dev route map is **gone for good** — replaced by the real
   homepage (hero → 5-step pipeline cards → share links/templates →
   closing CTA). From now on, navigate during local testing via the
   sidebar (logged in) or the verify URLs listed in these README sections.
2. `/about` and `/pricing` render real copy: pricing is **Free / Pro
   (Early access)** with no invented prices — the Pro CTA is a plain
   mailto, not a fake checkout.
3. `/vs/notion` renders the data-driven comparison (content map in
   `app/(marketing)/vs/[slug]/vs-pages.ts`); any other slug 404s.
4. Shared chrome: sticky `SiteHeader` (logo, About/Pricing, Log in /
   Sign up, theme toggle) and `SiteFooter` via the new
   `app/(marketing)/layout.tsx`; all four pages stay public per the
   existing middleware config, and each ships its own `metadata` title.

## Verify Step 15 (team invites — /settings Team card + /invite/:token)

⚠ New migration in this step — re-apply to your live Supabase project
before testing: `supabase/migrations/20260923070000_team_invites_schema.sql`
(SQL Editor → paste → Run), then re-run `supabase/seed.sql` for the seeded
pending invite.

The real invite-and-join flow: an owner invites a **specific email**,
copies the generated link (no email is ever sent — delivery is the
owner's own mail/chat), and the invitee joins as `member` whether they
already have an account or sign up from the link. Invites are single-use,
expire after 14 days, and are revocable.

1. **Seed fixture** — logged out, open
   `/invite/00000000-0000-0000-0000-000000000063` → "Join Atelier North"
   with *Create an account* / *Log in to accept*. Garbage or revoked
   tokens render the same "Invite unavailable" card — dead states are
   indistinguishable by design.
2. **Join by signing up** — from that page: *Create an account* → signup
   shows "Join your team" with **no workspace-name field**. Sign up as
   `teammate@brightloop.co` (any password) → you land on `/intake` as a
   **member** of Atelier North; `/settings` → Team lists Maya (owner) +
   you, with invite controls hidden from you.
3. **Email targeting** — open the same link while logged in as
   `maya@nookscript.dev` and click *Join workspace* → blocked with
   "sent to a different email address" (the RPC compares account emails).
4. **Owner side** — as Maya: `/settings` → Team shows the roster; invite
   a new address → the pending row appears with a copy-link button and a
   two-click revoke. Revoking kills the link immediately (invitees see
   "Invite unavailable").
5. **Rate limit** — `/invite/*` now shares the Step-14 per-IP bucket with
   `/share/*` (30/min) since it's a public route that probes Postgres on
   every load. Login/signup remain delegated to Supabase dashboard limits.
6. **DB-level proof** — `npm run verify:db` (84 checks / 11 migrations,
   incl. owner-only invite RLS, the one-pending-per-email index, preview
   indistinguishability, every accept guard, and the members RPC).

## Verify Step 16 (workspace switcher — active-workspace scoping)

⚠ New migration in this step — re-apply to your live Supabase project
before testing: `supabase/migrations/20260923080000_active_workspace.sql`
(SQL Editor → paste → Run), then re-run `supabase/seed.sql` (it adds a
SECOND, deliberately empty workspace — "Harbor Lane Studio" — for Maya).

Users with two workspaces (e.g. created one + joined one via invite) can
now switch between them. Every list, the inbox, settings, and every
create action pin the ACTIVE workspace — two workspaces' briefs and
updates no longer merge into one list. Detail deep-links stay openable
across your own workspaces; single-workspace accounts see no UI change.

1. **The switcher** — sidebar "Workspace" section: with the seed applied,
   Maya sees a dropdown (Atelier North / Harbor Lane Studio) instead of
   the old static label. Single-workspace accounts still see the plain
   label — nothing changes for them.
2. **Switching** — pick Harbor Lane Studio: sidebar name changes, and
   /briefs, /proposals, /plans, /updates, /intake/inbox all show EMPTY
   states (that workspace has no content yet). Settings → Team shows its
   one-member roster (Maya alone).
3. **Creation pins active** — while Harbor Lane is active, generate a
   brief from /intake: it appears in Harbor Lane's /briefs, NOT Atelier
   North's — switch back and Atelier's lists are exactly as before.
4. **Role follows the workspace** — an owner in one workspace and a
   member in another sees owner controls only while the owned workspace
   is active (Settings cards re-gate per switch).
5. **Persistence** — refresh or log in on another device: the selection
   sticks (profiles.active_workspace_id; NULL = first-joined fallback,
   which is every pre-Step-16 account).
6. **DB-level proof** — `npm run verify:db` (91 checks / 12 migrations,
   incl. the pointer column + FK, owner-only profile writes, and the
   members RPC's pointer/fallback/stale-pointer healing).

## Verify Step 17 (invoices — platform phase)

⚠ New migration in this step — re-apply to your live Supabase project
before testing: `supabase/migrations/20260923090000_invoices_schema.sql`
(SQL Editor → paste → Run), then re-run `supabase/seed.sql` (it adds two
invoices + their public links to the demo workspace).

Invoices are standalone (no brief/plan link), per-workspace, and
sequentially numbered (INV-0001 is your first). Money is integer cents
in the DB; the dollar totals you see are computed, never stored. The
lifecycle is draft → sent → paid, plus **void** as the audit-safe
cancel — there is deliberately no delete anywhere (no policy, no
button).

1. **The list** — /invoices shows the two seeded invoices: INV-0001
   (Draft, "Brand refresh — phase one", no tax) and INV-0002 (Sent,
   tax-included total). The Draft/Sent/Paid/Void tabs (with counts)
   filter; search matches title, client, or number.
2. **Create on the list** — "New invoice": client name is free text
   with `<datalist>` suggestions from the workspace's briefs (type
   "Bright"), title, optional due date → saving creates a DRAFT with
   the next per-workspace number and redirects to its composer.
3. **The composer** — line items (description / qty / unit price in
   dollars), tax %, due date, notes; totals (subtotal → tax → total)
   render live and are the exact math on the client's form. "Unsaved
   changes" chip → Save persists (items stored as integer-cents jsonb).
4. **Status + audit stamps** — Sent → Paid stamps `invoices.paid_at`
   (shown in Details); Paid → Sent clears it; Void keeps every stamp —
   the row is never destroyed. `sent_at` is stamped on first send and
   never overwritten.
5. **The public form** — Link panel: Create → copy the
   `/invoice/<token>` URL → open it in an INCOGNITO window (seed
   demo: `http://localhost:3000/invoice/00000000-0000-0000-0000-000000000070`):
   a clean read-only form (number, billed to, line items, totals, due
   date, notes, from-line) with a Print button — the v1 export story.
6. **What never renders** — the DRAFT invoice's seeded link (token
   `…0069`), a revoked link, a voided invoice, and a garbage URL all
   show the SAME generic "unavailable" state — a visitor cannot tell
   which kind of link they have (indistinguishable by design, proven
   at the DB level).
7. **Double-click race** — two creates at once race the number: the
   loser hits `unique(workspace_id, invoice_number)` and gets a
   friendly "just taken" message (share_links precedent).
8. **DB-level proof** — `npm run verify:db` (103 checks / 13
   migrations, incl. no-delete policies on both tables, per-workspace
   numbering, member RLS, and all four `get_shared_invoice` zero-row
   states).

## Verify Step 18 (time entries — timer + hours log)

⚠ New migration in this step — re-apply to your live Supabase project
before testing: `supabase/migrations/20260924090000_time_entries_schema.sql`
(SQL Editor → paste → Run), then re-run `supabase/seed.sql` (it adds four
time entries to the demo workspace).

Time entries are per-workspace rows of INTEGER MINUTES with a `worked_on`
date (the day the work happened — backdateable; the log groups by it, not
by created_at) and an optional brief link (null = general time). The
timer itself is NOT in the database: it is ephemeral client state
(localStorage, survives refresh) in the app shell, and stopping it writes
the entry. There is no public surface. One deliberate exception to the
no-delete house pattern: **this is the only table with a member delete
policy** — a time entry is a personal work log, not an audit record.

1. **The log** — /time shows the four seeded entries grouped by day
   (Today, then older dates): "Concept exploration — first visual
   directions" (3h 40m, today, linked to the Brightloop brief), "Kickoff —
   discovery call…" (2h 15m), "Portfolio refresh + client outreach"
   (1h, general — no brief chip), "Phase-two proposal polish" (1h 30m).
   The header shows the today total and the month total (computed from
   the rows, never stored).
2. **Log time by hand** — "Log time" opens the form: description,
   minutes, a `worked_on` date (defaults to today — backdating works),
   optional brief. Saving appears in the right day group; the totals
   move.
3. **The floating timer** — a pill sits bottom-right on EVERY app page
   (start it on /invoices, navigate to /briefs — it keeps running).
   Stop → the same log form opens with the elapsed time prefilled
   (seconds round to the nearest minute, minimum 1). Refresh mid-run →
   the timer survives (localStorage).
4. **Edit + delete** — each row has edit (all fields, same form) and
   delete (the only delete in the product). Deleting a row removes it
   from the log and the totals; the DB-level proof shows the delete
   policy is member-scoped (a foreign workspace's entry is undeletable).
5. **Brief filter** — filter the log to one brief; general entries only
   appear when "All" is selected.
6. **DB-level proof** — `npm run verify:db` (113 checks / 14
   migrations, incl. the duration_minutes CHECK (0 and negatives
   rejected), the brief FK + nullable general rows, member RLS, the
   member-can-delete / foreign-cannot-delete pair, and the
   updated_at touch trigger).

## Verify Step 19 (contracts — engagement agreements)

⚠ New migration in this step — re-apply to your live Supabase project
before testing: `supabase/migrations/20260925090000_contracts_schema.sql`
(SQL Editor → paste → Run), then re-run `supabase/seed.sql` (it adds two
contracts to the demo workspace).

Contracts are per-workspace engagement documents: a free-text
client name (with `<datalist>` suggestions from the briefs), a single
plain-text terms field, and an optional brief link (null = standalone).
The lifecycle mirrors invoices — draft → sent → signed, plus **void**
as the audit-safe cancel — with `sent_at` stamped on first send and
`signed_at` stamped on signed (cleared again when leaving signed).
"Expired" is derived from `expires_on`, never a stored status. There is
no delete anywhere and no money fields (the invoices hold the value).

1. **The list** — /contracts shows the two seeded contracts:
   "Brand refresh — engagement agreement" (Signed badge, Brightloop)
   and "Seasonal packaging — engagement agreement" (Draft badge,
   Fern & Fable Bakery, no brief chip). The Draft/Sent/Signed/Void tabs
   (with counts) filter; search matches title or client.
2. **Create on the list** — "New contract": client (free text with
   datalist suggestions), title, optional brief, optional expiry →
   saving creates a DRAFT and redirects to its composer.
3. **The composer** — title, client, brief, the terms textarea,
   expiry date, signed-by; Save persists.
4. **Status + audit stamps** — Sent stamps `sent_at` (shown in Details,
   never overwritten on re-send); Signed stamps `signed_at`; Signed →
   Draft/Sent CLEARS `signed_at`; Void keeps every stamp. The row is
   never destroyed.
5. **Print** — the detail page has a Print button (reused client
   island); browser print is the v1 export story (no PDF endpoint,
   no e-sign).
6. **Bogus / foreign ids** render the "not found" state (RLS hides
   them identically).
7. **DB-level proof** — `npm run verify:db` (120 checks / 15
   migrations, incl. the status CHECK, the brief FK + nullable
   standalone rows, member RLS, the no-delete proof, and the
   updated_at touch trigger).

## Verify Step 20 (reports — the platform rollup)

No new migration in this step — reports are computed live from the
Step 17–19 tables (invoices, time_entries, contracts). Everything is
pure TS in `lib/reports.ts`; nothing is stored that can drift.

/reports is a single server-rendered page (no client island — fixed
windows, no picker): **Money** (Collected = paid, Outstanding = sent,
Draft; void excluded and counted), **Time** (Today / This month /
All time, keyed on `worked_on`, plus per-brief bars for this month —
hours only, since invoices are deliberately not brief-linked), and
**Contracts** (status counts + "expiring within 30 days" + "expired",
both derived from `expires_on`).

1. **Money** — with the seeds: Collected $0.00 (0 paid) · Outstanding
   $3,150.00 (1 sent — INV-0002 incl. 5% tax) · Draft $1,950.00
   (1 draft). Pay INV-0002 on its detail page → navigate back → the
   dollar moves from Outstanding to Collected.
2. **Time** — Today 3h 40m · This month 8h 25m · All time 8h 25m
   (the four seeded days; re-seeding near a month boundary can split
   month/all-time). By brief: Brightloop brief 7h 25m, "General — no
   brief" 1h. Log time or edit an entry's date → the numbers follow.
3. **Contracts** — Signed 1 · Sent 0 · Draft 1 · Expiring within 30
   days 0 · Expired 0. Set an expiry on the draft (near-future or in
   the past) → the derived counters move with no status change.
4. **Empty states** — a fresh workspace (no platform data) renders all
   three cards with their "No … yet" copy.
5. **DB-level proof** — unchanged: `npm run verify:db` (120 checks /
   15 migrations — every input table is already proven; the
   aggregation is app-side TS, covered by the rendered values above).

## Verify Step 21 (member removal — Step 15 follow-up)

No new migration — the owner-only DELETE policy on `workspace_members`
has existed since Step 2; this step adds the app surface that finally
uses it. Removal is owner-only, two-click, and carries two guards: you
cannot remove yourself ("leaving" a workspace is a different action,
not built yet), and the LAST OWNER of a workspace can never be removed
(a workspace must always keep one owner — transferring ownership is
role management, a future step). Those rows simply don't render a
remove control; the action re-checks both server-side.

1. **The control** — as an owner, /settings → Team: every member row
   has a trash control EXCEPT your own row and (when you are the only
   owner) the last owner's row. Members (non-owners) see no controls
   at all.
2. **Two-click remove** — trash → inline "Remove?" + Cancel/Remove
   (the revoke pattern) → confirm → the row disappears (revalidated
   roster).
3. **Guards** — the action rejects self-removal, last-owner removal,
   non-owner callers, and unknown/foreign ids even when the UI is
   bypassed; RLS (`is_workspace_owner` on the delete policy) rejects a
   plain member's attempt at the DB level.
4. **DB-level proof** — `npm run verify:db` (122 checks / 15
   migrations, incl. the new plain-member-cannot-delete /
   owner-can-delete pair on `workspace_members`).

## Verify Step 22 (role management — Step 15 follow-up)

Invites only ever grant `member`, so before this step there was no way
to become (or stop being) an owner after the workspace was created.
Step 22 adds the missing UPDATE policy (migration 16) and the app
surface.

**DB invariants** (migration 16, house style — `auth.uid()` helpers,
no `to` clause): owner-gated both directions; **no self role-changes**
(the only path to an ownerless workspace is the last owner demoting
themselves — "leaving", a different unbuilt action, same cut as
Step 21's self-removal); **last-owner guard** via the new
`is_last_owner()` helper (a demotion that would leave zero owners is
rejected); **identity pinned** — an update may change `role` and
nothing else (reassigning the membership to another user fails).

1. **The controls** — as an owner, /settings → Team: every member row
   has a crown ("Make owner"); every owner row EXCEPT the last owner's
   has a UserMinus ("Make member"); your own row has neither (nor the
   remove control). Members see no role controls at all.
2. **Two-click confirm** — crown → "Make owner?" / demote →
   "Make member?" (destructive) → confirm → the badge flips
   (revalidated roster).
3. **Guards** — the action rejects self role-changes, last-owner
   demotions, non-owner callers, unknown/foreign ids, and bad role
   values even when the UI is bypassed; the UPDATE policy re-enforces
   all of it at the DB level.
4. **DB-level proof** — `npm run verify:db` (128 checks / 16
   migrations, incl. the new role-change set: plain-member ✗,
   promote ✓, demote-with-remaining-owner ✓, self-change ✗,
   reassignment ✗, plus the `is_last_owner()` unit check).

## Verify Step 23 (invite email — plain SMTP — Step 15 follow-up)

No DB changes — `team_invites` is untouched. This step upgrades the
Step-15 copy-link invites to emailed invites **when SMTP is
configured**: the invite row is created first (durable), then the link
is best-effort emailed through the project owner's own mail account via
plain SMTP (`nodemailer`, the only dependency). Delivery never blocks
or undoes invite creation.

**Setup** (your environment / host env — all five must be set):
- `SMTP_HOST` — SMTP server hostname (Gmail: `smtp.gmail.com`).
- `SMTP_PORT` — `465` (implicit TLS) or `587` (STARTTLS); the TLS mode
  is derived from the port.
- `SMTP_USER` — auth username, the full address (`you@gmail.com`).
- `SMTP_PASS` — auth password. **Gmail: an App Password, not your
  regular one** — enable 2-Step Verification, then generate one at
  myaccount.google.com → Security → App passwords. Google rejects
  regular passwords for SMTP.
- `SMTP_FROM` — sender shown to recipients
  (`NookScript <invites@yourdomain.com>`). Gmail: the From domain must
  match the account.

Any of the five unset → the email is skipped SILENTLY (dev mode —
copy-link only, no warning).

**Behavior:**
1. SMTP configured → creating an invite emails the invite link to the
   invitee (subject “You're invited to {workspace} on NookScript”; same
   link as the copy button; 14-day expiry stated in the body).
2. Configured but the send fails → the invite is still created and
   shows in the pending list with its copy link; the card shows a
   warning pointing at the copy link.
3. Not configured → nothing sent, no warning (the copy-link flow is
   unchanged).

**Proof:**
- `npm run verify:db` — 128 checks / 16 migrations, unchanged (this
  step has no DB layer).
- Sandbox: the send path was exercised against a LOCAL SMTP server
  (`smtp-server`, devDependency, never shipped) — no live sends:
  auth + message shape (From/To/Subject/invite link/inviter/expiry),
  the rejected-auth path, the server-unreachable path, and the
  misconfigured-port path.
- Live: create an invite for a real address and check the inbox.

## Verify Step 24 (rate limiting — Upstash store — Step 14 follow-up)

No DB changes. The Step 14 in-memory sliding-window limiter (30 req/min
per IP on `/share/*`, `/invite/*`, `/invoice/`) now has an optional
SHARED store so the caps survive redeploys and hold across serverless
instances. Zero new dependencies: `lib/upstash.ts` speaks Upstash's
Redis REST API with plain `fetch` (one HTTPS POST per check; an atomic
EVAL keeps the check-and-record step race-free).

**Setup** (your environment / host env — both required to engage):
- `UPSTASH_REDIS_REST_URL` — the database's REST URL
  (`https://<db>.upstash.io`), from the Upstash console.
- `UPSTASH_REDIS_REST_TOKEN` — its REST token (read-write).

Either var unset → the Step 14 in-memory window (silent — dev mode
unchanged). Upstash configured but erroring/unreachable → falls back to
the in-memory window (one console.warn per failure) — a store outage
neither takes the routes down nor opens them wide. Limits, keys and
semantics are identical in all modes (sliding window, rejected hits are
not recorded).

**Proof:**
- `npm run verify:db` — 128 checks / 16 migrations, unchanged (no DB
  layer).
- Sandbox functional run against a LOCAL Upstash REST stub (11 checks,
  no live calls): unconfigured = in-memory + zero HTTP; configured =
  30 allowed / 31st blocked with exactly 30 recorded; CROSS-PROCESS
  sharing (20 hits from one node process + 20 from another → exactly 10
  more allowed); window aging frees the budget; store 500 / non-JSON /
  timeout / wrong-token all degrade to the in-memory window.
- End-to-end through `next dev` + middleware (9 checks): `/settings`
  owner render intact through the async middleware refactor; a real
  `/invite/<token>` renders through the gate; hammering the gate with
  31 GETs passes exactly 30 then returns 429 with the exact plain-text
  body, and the shared store recorded exactly 30 hits.
- Live: set the pair, then `curl -H "x-forwarded-for: 1.2.3.4"` the same
  `/invite/<token>` URL 31× — the 31st should 429, and the key should
  show up in the Upstash console.

## Verify Step 25 (stale-pointer cleanup — Step 16/21 follow-up)

No DB changes. `profiles.active_workspace_id` (the Step-16 active
workspace pointer) can go stale exactly one way: the owner removes the
user (Step 21) from the workspace the pointer names. Reads were never
broken — the resolver self-heals to the first-joined membership — but
the row stayed wrong. Now it can't linger:

1. **At the source** — removing a member also clears their pointer when
   it names that workspace (0 rows touched otherwise — a healthy
   pointer elsewhere is never disturbed).
2. **At the read** — when the resolver heals a stale pointer (SET-BUT-
   WRONG only), it persists the healed id, so the stored row converges
   on the user's next visit. NULL is the documented "unset" state (pre-
   switcher accounts) and is deliberately left NULL.

Both writes are best-effort (lib/active-pointer) — the removal still
succeeds and the render still resolves if they fail.

**Proof:**
- `npm run verify:db` — 128 checks / 16 migrations, unchanged (no DB
  layer).
- Sandbox functional run (4 checks, lib level vs a local PostgREST
  stub): persist writes the healed id with the row pinned; clear-if-
  pointing-at nulls on a hit and touches nothing on a miss; a dead
  store never throws.
- End-to-end through `next dev` (9 checks, four render phases against a
  stateful stub): healthy pointer → render + ZERO hygiene writes
  (incl. the standard /settings regression); stale pointer → renders
  via the fallback AND the write-back converges the row; second render
  → ZERO writes (idempotent); NULL pointer → left alone + ZERO writes.

## Verify Step 26 (leave-workspace — Step 21 follow-up)

Migration 17 (`workspace_members_leave.sql`). Anyone can take
themselves OUT of a workspace — the self-removal half of the Step-21
feature, the action the old copy called "not available yet":

1. **Self-delete policy** — the owner-only DELETE policy gains a self
   clause: delete your OWN membership row, never anyone else's.
2. **Last-owner guard (DB)** — a BEFORE DELETE trigger refuses to
   delete a workspace's only owner (both paths: leaving AND owner
   removal — until now this guard lived only in the Step-21 action).
3. **Pointer hygiene (DB-grade Step 25)** — an AFTER DELETE trigger
   clears the departed user's `active_workspace_id` when it names the
   workspace they left (SECURITY DEFINER — the remover is often someone
   else, who can't update the victim's profile row).

UI: your own row gets a Leave control (two-click confirm) — hidden for
the last owner; the shell lands on your next workspace, or `/onboarding`
when none remain. The action enforces the same guards (defense in
depth).

**Proof:**
- `npm run verify:db` — **133 checks / 17 migrations** (the five new:
  last-owner leave ✗, non-last-owner leave ✓, member leave ✓, matching
  pointer cleared, mismatched pointer preserved). The pre-existing
  removal/role/pointer checks all still pass unchanged.
- Rendered /settings regression through `next dev` + stub in three
  shapes: sole owner (no Leave on their row + all Step-21/22/23/25
  surfaces intact), plain member (Leave on their own row, zero
  management controls, "View only"), two owners (Leave visible + demote
  control on the other owner).
- Live: promote a second owner, leave as either, and watch the shell
  switch (or onboarding when it was your only workspace).

## Verify Step 27 (workspace deletion — the Step-26 escape hatch)

Migration 18 (`workspace_deletion.sql`). Owners can DESTROY a workspace
— closing the trap the leave-workspace arc exposed: a sole owner could
neither leave (last-owner guard — correct) nor delete (nothing offered
it). The schema was deletion-ready from day one (every `workspace_id`
FK cascades; `active_workspace_id` is ON DELETE SET NULL) — this
migration adds the missing pieces:

1. **DELETE policy** on workspaces — owner-gated (`is_workspace_owner`),
   and owning one workspace grants nothing over another.
2. **Cascade exception** — the Step-26 `keep_last_owner` trigger skips
   its guard when the membership delete is a cascade of the workspace
   row itself dying (nothing to orphan); direct membership deletes keep
   the guard.

UI: an owner-only **Danger zone** card at the bottom of /settings —
loud copy (everything, for everyone, forever) + the house two-click
confirm. Members never see the card. After deletion the shell lands on
your next workspace, or `/onboarding` when none remain.

**Proof:**
- `npm run verify:db` — **136 checks / 18 migrations** at the time
  (144 / 19 since Step 29) (the three new:
  foreign-workspace owner blocked, solo-workspace delete succeeds past
  the last-owner guard, children cascade + pointers clear). Every
  pre-existing check unchanged.
- Rendered /settings regression through `next dev` + stub: owner sees
  the Danger zone + the loud copy (with all Step-21/22/23/25/26
  surfaces intact); a plain member gets none of it (and still gets
  their Leave control).
- Live: delete a scratch workspace and watch the shell fall through to
  the next one (or onboarding).

## Verify Step 28 (live policy probes — tooling)

No app changes. `npm run verify:live` proves tables + RPCs EXIST on the
hosted project; **policy-only migrations** — 10 (workspace rename), 16
(roles), 17 (leave), 18 (workspace deletion) — create neither, so
forgetting one passed every existence check while the app's writes
silently no-oped. The new `npm run verify:live:policies`
(`scripts/verify-live-policies.mjs`) closes that gap: it behaves like
the app against the real project and asserts the allow/deny verdict of
every policy surface (15 checks at Step 28 — 18 since Step 29):

- throwaway signups (owner + member persona) + a scratch workspace
  (`scripts/verify-auth.mjs` precedent) — every write is confined to
  that scratch data, and the run self-cleans (the workspace is deleted
  by the last checks; cleanup notes name the two test users);
- rename: owner ✓ / member ✗ · roles: promote ✓ demote ✓ self ✗ ·
  leave: member ✓ + pointer cleared ✗-guard on the last owner ·
  deletion: member ✗ / owner ✓ (solo — past its own owner row);
- failures name the exact `supabase/migrations/` file (verify:live
  convention); needs email confirmation OFF (verify-auth prereq).

**Proof (sandbox):** a 5-check contract run against a local
policy-emulating Supabase stub (the script itself is the unit): baseline
passes 15/15; three simulated drifts ("forgot a migration" worlds:
rename policy off, leave guard off, deletion cascade fix off) each
produce exit 1 + the correct ✗ line + migration file; restore passes
again. The policy SEMANTICS asserted are proven offline against real
Postgres by `npm run verify:db` (136/18).
**Live:** superseded by Step 29 — the script now runs 18 checks; expect
18/18 (see below).

## Verify Step 29 (viewer role — db + app)

Roles spec (`docs/roles-spec.md`, approved with one amendment): three
tiers **owner / member / viewer**. Viewers read the operational content
(briefs, proposals, plans, updates, contracts, templates, roster) and
**write nothing**; the amendment — **money is HIDDEN**: `invoices`,
`invoice_links`, and `time_entries` are excluded at the RLS SELECT
policy, not just write-gated (clients/stakeholders never see financials
or tracked hours). Invites keep granting `member` (the recorded
`team_invites` design); owners assign `viewer` from the roster's role
control (Step-22 two-click confirm, now 3-way; badge reads "View only").

- **DB** (`20260925220000_viewer_role.sql`): role CHECK grows to
  `('owner','member','viewer')`; new `is_workspace_editor()` (member or
  owner) switches every content **write** policy (briefs family,
  proposals, plans, updates, share_links, contracts, invoices,
  invoice_links, time_entries); the three money **select** policies move
  to the same gate. Templates stay owner-write / member-read.
- **App**: `requireEditor()` viewer guard in all 29 content write
  actions (RLS stays authoritative); `CanEdit`/`CanSeeMoney` server
  gates wrap every write surface (composers, generate/share buttons,
  status selects → read badges, task checkboxes) and the money pages
  (nav + `TimeTimer` + `/invoices`, `/invoices/[id]`, `/time` walls).
- **verify:db** +9 (CHECK accept/reject, owner sets viewer, viewer
  reads content but ZERO money, viewer writes denied, member/owner
  regression).
- **E2E** (scratch, stub-PostgREST): 7/7 — viewer /settings (money nav
  hidden, "View only" badge, zero invite surface, Leave present),
  both money walls, owner's role control offers "Viewer", update page
  chrome hidden for viewer / intact for member (regression).
- **verify:live:policies** → 18 checks (+set `viewer`, +viewer template
  write denied, +money hidden with owner-visible fixture) with 3 new
  drift modes contract-proven (roles policy / write gate / money hide
  "forgotten" each trip the right ✗ + migration file).

**Live:** pull = **migration 19 only, no re-seed** (seeds use
owner/member). Then `npm run verify:live:policies` — 18/18 expected.

## Verify Step 31 (responsive + accessibility polish)

No schema or behavior changes — markup/aria only, visual design
untouched (shadcn NY preserved). Three defect classes from a repo-wide
sweep:

- **App shell was fixed-grid** (`220px` sidebar at every width — the
  main column collapsed under ~500px). Now a `md:` grid with a
  scrollable **MobileNav** strip under the Topbar below `md` (shared
  `nav-items.ts` registry with the Sidebar, same viewer money-hide,
  workspace switcher included). Public surfaces (marketing, share,
  invoice links) were already responsive (`max-w` + `sm:`).
- **Skip links + landmarks**: "Skip to content" → `#main` on the app
  and marketing shells (`<html lang>` was already set; Topbar was
  already `<header>`; focus rings were already per-component).
- **Unnamed controls**: `aria-label`s added to every input/select/
  textarea that relied on placeholder-only naming — AddSourceForm,
  TemplateDialog, UpdateComposer, InvoiceComposer (5), ContractComposer
  (Brief select; its text inputs already had real `htmlFor` labels),
  TimeLog (4 + filter), TimeTimer (label input, discard button, date,
  brief select). Label text = visible label text (label-in-name).

**Proof (sandbox):** rendered smoke 6/6 against stub-PostgREST — skip
link + `#main` in marketing AND app HTML, the `aria-label="Primary"`
mobile strip + `md:` grid classes present, viewer money links absent in
**both** navs, TimeLog filter + UpdateComposer controls named in live
HTML (TimeTimer's run/stop controls are client-phase — source+type
verified). tsc + `next build` clean; `verify:db` 144/144 regression.
One smoke-harness bug caught en route (stub auth must accept the Bearer
header — server-side supabase-js never forwards cookies) — the app's
viewer gating was correct once the stub resolved personas properly.

## Notes

- Inter is self-hosted via `@fontsource-variable/inter` (loaded through
  `next/font/local`) instead of `next/font/google` — no build-time dependency
  on fonts.googleapis.com. See the comment in `app/layout.tsx`.
- Design tokens live as CSS variables in `app/globals.css` (light + `.dark`),
  consumed by Tailwind (`tailwind.config.ts`). Dark mode via `next-themes`
  with the `dark` class; default is `system`.
