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
`brief_questions` / `brief_edit_history` / `proposals` / `plans` — all
RLS-scoped to workspace membership — plus the `create_workspace()`,
`update_brief_field()`, and `create_brief_bundle()` RPCs and the
status-change history + updated_at touch triggers.

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

## Verify Step 2 (auth + workspaces)

Browser checklist (the “Confirm” list):

1. **Signup** — `/signup`, fill Full name / Email / Password / Workspace name →
   lands on `/intake` with the sidebar showing your workspace name and the
   topbar avatar showing your initials.
2. **Rows created** — `node scripts/verify-auth.mjs` exercises the exact DB/RLS
   flow (signup trigger, initials, owner-only member insert, anonymous reads)
   and prints a ✓/✗ report against your real project.
3. **Schema logic, offline** — `npm run verify:db` applies all migrations
   + seed data to an in-memory WASM Postgres (PGlite) and runs 36 functional
   and RLS assertions: triggers, RPCs, status-history logging, member-only
   visibility on every product table, and the immutability of
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

## Notes

- Inter is self-hosted via `@fontsource-variable/inter` (loaded through
  `next/font/local`) instead of `next/font/google` — no build-time dependency
  on fonts.googleapis.com. See the comment in `app/layout.tsx`.
- Design tokens live as CSS variables in `app/globals.css` (light + `.dark`),
  consumed by Tailwind (`tailwind.config.ts`). Dark mode via `next-themes`
  with the `dark` class; default is `system`.
