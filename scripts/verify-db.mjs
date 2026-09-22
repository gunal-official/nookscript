/**
 * Offline verification for the database layer — runs entirely in-sandbox /
 * on any machine WITHOUT a Supabase project, using PGlite (real Postgres 16
 * compiled to WASM).
 *
 *   npm run verify:db
 *
 * What it proves:
 *   - every file in supabase/migrations applies cleanly, in order
 *   - supabase/seed.sql loads idempotently (it is executed TWICE)
 *   - auth trigger creates profiles + derives avatar initials
 *   - create_workspace() RPC writes workspace + owner membership atomically
 *   - update_brief_field() RPC updates whitelisted fields + logs history,
 *     and rejects non-whitelisted fields (e.g. 'status')
 *   - the status-change BEFORE UPDATE trigger logs old → new
 *   - RLS (simulated JWT claims + a non-superuser role): members see only
 *     their workspace's briefs, strangers see nothing, brief_sources has no
 *     UPDATE policy (raw_content immutable at the DB level)
 *
 * Note: PGlite runs as a single superuser, so RLS is exercised via a
 * dedicated non-owner role (`nstester`) with a faked `auth.uid()`.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const MIGRATIONS_DIR = "supabase/migrations";
const SEED_UID = "00000000-0000-0000-0000-000000000001";
const SEED_WS = "00000000-0000-0000-0000-000000000002";
const SEED_BRIEF = "00000000-0000-0000-0000-000000000010";

console.log("Starting PGlite (WASM Postgres)…");
const db = new PGlite();

// ── Minimal stand-ins for Supabase's auth schema + JWT helper ──
await db.exec(`
  create schema auth;
  create table auth.users (
    id uuid primary key,
    instance_id uuid,
    aud varchar(255),
    role varchar(255),
    email varchar(255),
    encrypted_password varchar(255),
    email_confirmed_at timestamptz,
    recovery_sent_at timestamptz,
    last_sign_in_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    created_at timestamptz,
    updated_at timestamptz,
    confirmation_token varchar(255),
    email_change varchar(255),
    email_change_token_new varchar(255),
    recovery_token varchar(255)
  );
  create table auth.identities (
    id uuid not null,
    user_id uuid not null,
    provider_id text not null,
    identity_data jsonb not null,
    provider text not null,
    last_sign_in_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
  );
  -- auth.uid() on Supabase reads the JWT 'sub' claim; here it reads a GUC
  -- we can flip per scenario.
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('app.jwt_sub', true), '')::uuid;
  $$;
`);

// ── Apply every migration file, in order ──
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  console.log(`· applied migration ${file}`);
}
check(`${files.length} migrations apply cleanly`, files.length >= 3);

// ── Seed (twice, for idempotency) ──
let seedSql = readFileSync("supabase/seed.sql", "utf8");
let cryptOk = true;
try {
  await db.query("select crypt('probe', gen_salt('bf')) as ok");
} catch {
  cryptOk = false;
  // pgcrypto isn't bundled here — the login-password hash is irrelevant to
  // these checks, so substitute a literal (real Supabase has pgcrypto).
  seedSql = seedSql.replace(
    /crypt\('password123', gen_salt\('bf'\)\)/g,
    "'pglite-test-password-hash'"
  );
}
await db.exec(seedSql);
await db.exec(seedSql);
check("seed.sql loads idempotently (run twice)", true, cryptOk ? "pgcrypto OK" : "password hash stubbed (pgcrypto unavailable in PGlite)");

// ── Schema sanity ──
const { rows: rlsRows } = await db.query(
  `select relname, relrowsecurity from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = any($1) order by relname`,
  [["briefs", "brief_sources", "brief_questions", "brief_edit_history", "workspaces", "workspace_members", "profiles"]]
);
check(
  "all 7 tables exist with RLS enabled",
  rlsRows.length === 7 && rlsRows.every((r) => r.relrowsecurity),
  rlsRows.map((r) => `${r.relname}=${r.relrowsecurity}`).join(" ")
);

// ── Trigger: auth user → profile + initials ──
const { rows: [profile] } = await db.query(
  "select full_name, avatar_initials from public.profiles where id = $1",
  [SEED_UID]
);
check(
  "profile trigger + derived initials for seed user",
  profile?.full_name === "Maya Chen" && profile?.avatar_initials === "MC",
  JSON.stringify(profile)
);

// ── Seed content ──
const { rows: [brief] } = await db.query(
  "select title, status, client_name, jsonb_array_length(deliverables) as dcount from public.briefs where id = $1",
  [SEED_BRIEF]
);
check(
  "seed brief present (Brightloop, in_review, 3 deliverables)",
  brief?.title === "Brightloop Co. — Brand Identity Refresh" && brief?.status === "in_review" && Number(brief?.dcount) === 3,
  brief?.title
);

const { rows: counts } = await db.query(`
  select
    (select count(*)::int from public.brief_sources where brief_id = '${SEED_BRIEF}') as sources,
    (select count(*)::int from public.brief_questions where brief_id = '${SEED_BRIEF}' and status = 'open') as open_q,
    (select count(*)::int from public.brief_questions where brief_id = '${SEED_BRIEF}' and status = 'resolved') as resolved_q,
    (select count(*)::int from public.brief_edit_history where brief_id = '${SEED_BRIEF}') as history
`);
check(
  "seed: 1 source, 1 open + 2 resolved questions, 2 history entries",
  counts[0].sources === 1 && counts[0].open_q === 1 && counts[0].resolved_q === 2 && counts[0].history === 2,
  JSON.stringify(counts[0])
);

// ── create_workspace() RPC ──
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
const { rows: [rpc] } = await db.query(
  "select public.create_workspace('RPC Test Co.') as id"
);
const { rows: [member] } = await db.query(
  "select role from public.workspace_members where workspace_id = $1 and user_id = $2",
  [rpc.id, SEED_UID]
);
check("create_workspace RPC → workspace + owner membership", !!rpc.id && member?.role === "owner", rpc.id);

// ── update_brief_field() RPC: text field + jsonb + whitelist ──
await db.query("select public.update_brief_field($1, 'budget_timeline', $2::jsonb, $3)", [
  SEED_BRIEF,
  JSON.stringify("Budget → $10k fixed, Sep 29 kickoff"),
  SEED_UID,
]);
const { rows: [afterEdit] } = await db.query(
  "select budget_timeline from public.briefs where id = $1",
  [SEED_BRIEF]
);
const { rows: [editLog] } = await db.query(
  "select action_type, description, user_id from public.brief_edit_history where brief_id = $1 and action_type = 'field_edited' order by created_at desc limit 1",
  [SEED_BRIEF]
);
check(
  "update_brief_field: value updated + 'edited Budget & timeline' logged",
  afterEdit?.budget_timeline?.startsWith("Budget → $10k") &&
    editLog?.description === "edited Budget & timeline" &&
    editLog?.user_id === SEED_UID,
  editLog?.description
);

await db.query("select public.update_brief_field($1, 'deliverables', $2::jsonb, $3)", [
  SEED_BRIEF,
  JSON.stringify([{ id: "d1", text: "Only item", checked: false }]),
  SEED_UID,
]);
const { rows: [dAfter] } = await db.query(
  "select jsonb_array_length(deliverables) as n from public.briefs where id = $1",
  [SEED_BRIEF]
);
check("update_brief_field: jsonb deliverables replace works", Number(dAfter?.n) === 1);

let whitelistRejected = false;
try {
  await db.query("select public.update_brief_field($1, 'status', '\"approved\"'::jsonb, $2)", [SEED_BRIEF, SEED_UID]);
} catch (e) {
  whitelistRejected = /field_not_editable/.test(e.message);
}
check("update_brief_field rejects 'status' (whitelist)", whitelistRejected);

// ── Status-change trigger ──
const { rows: [beforeTs] } = await db.query("select updated_at from public.briefs where id = $1", [SEED_BRIEF]);
await new Promise((r) => setTimeout(r, 20));
await db.query("update public.briefs set status = 'approved' where id = $1", [SEED_BRIEF]);
const { rows: [statusLog] } = await db.query(
  "select action_type, description, user_id from public.brief_edit_history where brief_id = $1 and action_type = 'status_changed' order by created_at desc limit 1",
  [SEED_BRIEF]
);
const { rows: [afterTs] } = await db.query("select updated_at from public.briefs where id = $1", [SEED_BRIEF]);
check(
  "status trigger logs 'status changed from in_review to approved' with actor",
  statusLog?.description === "status changed from in_review to approved" && statusLog?.user_id === SEED_UID,
  statusLog?.description
);
check("updated_at touch trigger fires", new Date(afterTs.updated_at) > new Date(beforeTs.updated_at));

// ── RLS simulation: non-superuser role + faked JWT claims ──
await db.exec(`
  create role nstester nologin;
  grant usage on schema public to nstester;
  grant usage on schema auth to nstester;
  grant execute on function auth.uid() to nstester;
  grant select, insert, update, delete on
    public.workspaces, public.workspace_members, public.profiles,
    public.briefs, public.brief_sources, public.brief_questions, public.brief_edit_history
    to nstester;
`);
// a foreign workspace + brief the seed user does NOT belong to
await db.exec(`
  insert into public.workspaces (id, name) values ('00000000-0000-0000-0000-000000000099', 'Foreign Co') on conflict do nothing;
  insert into public.briefs (id, workspace_id, title) values ('00000000-0000-0000-0000-000000000098', '00000000-0000-0000-0000-000000000099', 'Foreign brief') on conflict do nothing;
`);

await db.query("set role nstester");
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
const { rows: [subCheck] } = await db.query("select auth.uid() as uid");
check("auth.uid() simulation active", subCheck.uid === SEED_UID);

const { rows: visibleBriefs } = await db.query("select id from public.briefs");
check(
  "RLS: member sees own-workspace briefs only",
  visibleBriefs.length === 1 && visibleBriefs[0].id === SEED_BRIEF,
  `${visibleBriefs.length} visible`
);

let insertBlocked = false;
try {
  await db.query("insert into public.briefs (workspace_id, title) values ('00000000-0000-0000-0000-000000000099', 'nope')");
} catch (e) {
  insertBlocked = true;
}
check("RLS: cannot insert brief into foreign workspace", insertBlocked);

// brief_sources: no UPDATE policy → update silently affects 0 rows
await db.query("update public.brief_sources set raw_content = 'tampered' where brief_id = $1", [SEED_BRIEF]);
const { rows: [srcAfter] } = await db.query("select raw_content = 'tampered' as tampered from public.brief_sources where brief_id = $1", [SEED_BRIEF]);
check("RLS: brief_sources is NOT updatable (immutable raw_content)", srcAfter?.tampered === false);
await db.query("reset role");
const { rows: [updPolicies] } = await db.query(
  "select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = 'brief_sources' and cmd = 'UPDATE'"
);
check("brief_sources truly has zero UPDATE policies", updPolicies.n === 0);

// member CAN still resolve a question (update) + insert history
await db.query("set role nstester");
const { rows: updQ } = await db.query(
  "update public.brief_questions set status = 'resolved', answer_text = 'Identity only.', answered_by = 'Priya (client)', resolved_at = now() where question_text like 'Does the $8%' returning status"
);
check("RLS: member can resolve questions (update allowed)", updQ[0]?.status === "resolved");
const { rowCount: histInserted } = await db.query(
  "insert into public.brief_edit_history (brief_id, user_id, action_type, description) values ($1, $2, 'question_resolved', 'resolved question “Does the $8–12k budget include…”')",
  [SEED_BRIEF, SEED_UID]
);
check("RLS: member can append edit history", histInserted === 1);
await db.query("reset role");

// ── create_brief_bundle() RPC (Step 4 intake) ──
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
const { rows: [bundle] } = await db.query(
  "select public.create_brief_bundle($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb) as id",
  [
    SEED_WS,
    "Bundle Test — Landing Page",
    "Client wants a landing page refresh.",
    JSON.stringify([{ id: "d1", text: "New hero section", checked: false }]),
    "$2k, two weeks",
    "Bundle Test Co.",
    SEED_UID,
    "manual",
    "Pasted source text for the bundle test.",
    JSON.stringify({ char_count: 42 }),
    JSON.stringify([
      { question_text: "Is the copy provided?", context_note: "Client said \"maybe\"" },
      { question_text: "   ", context_note: "blank rows are filtered" },
    ]),
  ]
);
const { rows: bundleCounts } = await db.query(
  `select
     (select count(*)::int from public.briefs where id = $1 and status = 'draft') as brief,
     (select count(*)::int from public.brief_sources where brief_id = $1) as sources,
     (select count(*)::int from public.brief_questions where brief_id = $1 and status = 'open') as open_q,
     (select count(*)::int from public.brief_edit_history where brief_id = $1 and action_type = 'generated') as gen_log`,
  [bundle.id]
);
check(
  "create_brief_bundle: brief + source + questions (blank filtered) + 'generated' log, atomically",
  bundleCounts[0].brief === 1 && bundleCounts[0].sources === 1 && bundleCounts[0].open_q === 1 && bundleCounts[0].gen_log === 1,
  JSON.stringify(bundleCounts[0])
);

let bundleGuard = false;
try {
  await db.query(
    "select public.create_brief_bundle('00000000-0000-0000-0000-000000000099', 'x', null, '[]'::jsonb, null, null, null, 'manual', 'text', '{}'::jsonb, '[]'::jsonb)"
  );
} catch (e) {
  bundleGuard = /not_authorized/.test(e.message);
}
check("create_brief_bundle rejects non-member workspaces", bundleGuard);

let emptySourceGuard = false;
try {
  await db.query(
    "select public.create_brief_bundle($1, 'x', null, '[]'::jsonb, null, null, null, 'manual', '   ', '{}'::jsonb, '[]'::jsonb)",
    [SEED_WS]
  );
} catch (e) {
  emptySourceGuard = /source_required/.test(e.message);
}
check("create_brief_bundle rejects empty source text", emptySourceGuard);

console.log(failures === 0 ? "\nAll database checks passed ✔" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
