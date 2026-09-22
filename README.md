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
triggers, and the briefs schema: `briefs` / `brief_sources` /
`brief_questions` / `brief_edit_history` — all RLS-scoped to workspace
membership — plus the `create_workspace()` and `update_brief_field()` RPCs
and the status-change history trigger.

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
   + seed data to an in-memory WASM Postgres (PGlite) and runs 19 functional
   and RLS assertions: triggers, RPCs, status-history logging, member-only
   visibility, and the immutability of `brief_sources.raw_content`.
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

## Notes

- Inter is self-hosted via `@fontsource-variable/inter` (loaded through
  `next/font/local`) instead of `next/font/google` — no build-time dependency
  on fonts.googleapis.com. See the comment in `app/layout.tsx`.
- Design tokens live as CSS variables in `app/globals.css` (light + `.dark`),
  consumed by Tailwind (`tailwind.config.ts`). Dark mode via `next-themes`
  with the `dark` class; default is `system`.
