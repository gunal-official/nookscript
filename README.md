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
`invoice_links` — all RLS-scoped to workspace membership —
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
RPCs **exist** — it does not check POLICIES. Post-roadmap, the workspace
rename UPDATE policy (`20260923060000_workspaces_rename_policy.sql`, the
10th migration) is the first schema object in that category; a policy-aware
version of `verify:live` could probe it by attempting an owner-scoped
rename probe against a scratch workspace.

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

## Notes

- Inter is self-hosted via `@fontsource-variable/inter` (loaded through
  `next/font/local`) instead of `next/font/google` — no build-time dependency
  on fonts.googleapis.com. See the comment in `app/layout.tsx`.
- Design tokens live as CSS variables in `app/globals.css` (light + `.dark`),
  consumed by Tailwind (`tailwind.config.ts`). Dark mode via `next-themes`
  with the `dark` class; default is `system`.
