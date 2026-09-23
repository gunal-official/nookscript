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
const SEED_PROPOSAL = "00000000-0000-0000-0000-000000000020";
const SEED_PLAN = "00000000-0000-0000-0000-000000000030";
const SEED_UPDATE_SENT = "00000000-0000-0000-0000-000000000040";
const SEED_UPDATE_DRAFT = "00000000-0000-0000-0000-000000000041";
const FOREIGN_WS = "00000000-0000-0000-0000-000000000099";
const FOREIGN_BRIEF = "00000000-0000-0000-0000-000000000098";
const FOREIGN_PROPOSAL = "00000000-0000-0000-0000-000000000097";
const FOREIGN_PLAN = "00000000-0000-0000-0000-000000000096";
const FOREIGN_UPDATE = "00000000-0000-0000-0000-000000000095";
const SEED_SHARE_LINK = "00000000-0000-0000-0000-000000000050";
const SEED_SHARE_TOKEN = "00000000-0000-0000-0000-000000000051";
const REVOKED_SHARE_TOKEN = "00000000-0000-0000-0000-000000000052";
const REVOKED_SHARE_LINK = "00000000-0000-0000-0000-000000000053";
const FOREIGN_SHARE_LINK = "00000000-0000-0000-0000-000000000094";
const MEMBER_UID = "00000000-0000-0000-0000-000000000070";
const TEAMMATE_UID = "00000000-0000-0000-0000-000000000071";
const SEED_INVITE_TOKEN = "00000000-0000-0000-0000-000000000063";
const EXPIRED_INVITE_TOKEN = "00000000-0000-0000-0000-000000000066";
const SECOND_WS = "00000000-0000-0000-0000-000000000064";

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
  [["briefs", "brief_sources", "brief_questions", "brief_edit_history", "proposals", "plans", "updates", "share_links", "templates", "workspaces", "workspace_members", "profiles", "team_invites"]]
);
check(
  "all 13 tables exist with RLS enabled",
  rlsRows.length === 13 && rlsRows.every((r) => r.relrowsecurity),
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
  "seed: 2 sources, 1 open + 2 resolved questions, 3 history entries",
  counts[0].sources === 2 && counts[0].open_q === 1 && counts[0].resolved_q === 2 && counts[0].history === 3,
  JSON.stringify(counts[0])
);

// ── Seed threading (Step 12): the follow-up source must be newer than the
// original, and its 'source_added' audit row must exist exactly as the
// add_brief_source() RPC would write it ──
const { rows: [threadSeed] } = await db.query(`
  select
    (select created_at from public.brief_sources where id = '00000000-0000-0000-0000-000000000054')
      > (select created_at from public.brief_sources where id = '00000000-0000-0000-0000-000000000011') as followup_is_newer,
    (select count(*)::int from public.brief_edit_history
      where brief_id = '${SEED_BRIEF}' and action_type = 'source_added'
        and description = 'added a new source (email)') as source_added_rows
`);
check(
  "seed follow-up source (.0054) threads after the original (.0011), with a 'source_added' audit row",
  threadSeed?.followup_is_newer === true && threadSeed?.source_added_rows === 1,
  JSON.stringify(threadSeed)
);

// ── Seed proposal (Step 7) ──
const { rows: [seedProposal] } = await db.query(
  "select brief_id, status, title, jsonb_array_length(deliverables) as dcount from public.proposals where id = $1",
  [SEED_PROPOSAL]
);
check(
  "seed proposal present (from Brightloop brief, draft, 3 deliverables)",
  seedProposal?.brief_id === SEED_BRIEF &&
    seedProposal?.status === "draft" &&
    seedProposal?.title === "Brightloop Co. — Brand Identity Refresh" &&
    Number(seedProposal?.dcount) === 3,
  seedProposal?.title
);

// ── proposals constraints: status CHECK + brief FK (Step 7) ──
let statusRejected = false;
try {
  await db.query(
    "insert into public.proposals (workspace_id, brief_id, title, status) values ($1, $2, 'x', 'maybe')",
    [SEED_WS, SEED_BRIEF]
  );
} catch (e) {
  statusRejected = /violates check constraint/.test(e.message);
}
check("proposals.status CHECK rejects invalid value", statusRejected);

let fkRejected = false;
try {
  await db.query(
    "insert into public.proposals (workspace_id, brief_id, title) values ($1, '00000000-0000-0000-0000-000000000077', 'x')",
    [SEED_WS]
  );
} catch (e) {
  fkRejected = /violates foreign key constraint/.test(e.message);
}
check("proposals.brief_id FK enforces a real brief", fkRejected);

// ── Seed plan (Step 8) ──
const { rows: [seedPlan] } = await db.query(
  "select proposal_id, status, title, jsonb_array_length(tasks) as tcount from public.plans where id = $1",
  [SEED_PLAN]
);
check(
  "seed plan present (from Brightloop proposal, not_started, 3 tasks)",
  seedPlan?.proposal_id === "00000000-0000-0000-0000-000000000020" &&
    seedPlan?.status === "not_started" &&
    seedPlan?.title === "Brightloop Co. — Brand Identity Refresh" &&
    Number(seedPlan?.tcount) === 3,
  seedPlan?.title
);

// ── plans constraints: status CHECK + proposal FK (Step 8) ──
let planStatusRejected = false;
try {
  await db.query(
    "insert into public.plans (workspace_id, proposal_id, title, status) values ($1, $2, 'x', 'active')",
    [SEED_WS, "00000000-0000-0000-0000-000000000020"]
  );
} catch (e) {
  planStatusRejected = /violates check constraint/.test(e.message);
}
check("plans.status CHECK rejects invalid value", planStatusRejected);

let planFkRejected = false;
try {
  await db.query(
    "insert into public.plans (workspace_id, proposal_id, title) values ($1, '00000000-0000-0000-0000-000000000077', 'x')",
    [SEED_WS]
  );
} catch (e) {
  planFkRejected = /violates foreign key constraint/.test(e.message);
}
check("plans.proposal_id FK enforces a real proposal", planFkRejected);

// ── Seed updates (Step 9) ──
const { rows: seedUpdates } = await db.query(
  "select id, status, plan_id from public.updates where id = any($1) order by id",
  [[SEED_UPDATE_SENT, SEED_UPDATE_DRAFT]]
);
check(
  "seed updates present (from Brightloop plan: 1 sent + 1 draft)",
  seedUpdates.length === 2 &&
    seedUpdates.every((u) => u.plan_id === SEED_PLAN) &&
    seedUpdates.find((u) => u.id === SEED_UPDATE_SENT)?.status === "sent" &&
    seedUpdates.find((u) => u.id === SEED_UPDATE_DRAFT)?.status === "draft",
  JSON.stringify(seedUpdates.map((u) => u.status))
);

// ── updates constraints: status CHECK + plan FK (Step 9) ──
let updateStatusRejected = false;
try {
  await db.query(
    "insert into public.updates (workspace_id, plan_id, title, status) values ($1, $2, 'x', 'archived')",
    [SEED_WS, SEED_PLAN]
  );
} catch (e) {
  updateStatusRejected = /violates check constraint/.test(e.message);
}
check("updates.status CHECK rejects invalid value", updateStatusRejected);

let updateFkRejected = false;
try {
  await db.query(
    "insert into public.updates (workspace_id, plan_id, title) values ($1, '00000000-0000-0000-0000-000000000077', 'x')",
    [SEED_WS]
  );
} catch (e) {
  updateFkRejected = /violates foreign key constraint/.test(e.message);
}
check("updates.plan_id FK enforces a real plan", updateFkRejected);

// ── Seed share link (Step 10) ──
const { rows: [seedShare] } = await db.query(
  "select update_id, token, revoked_at from public.share_links where id = $1",
  [SEED_SHARE_LINK]
);
check(
  "seed share link present (for Week 1 update, active token …0051)",
  seedShare?.update_id === "00000000-0000-0000-0000-000000000040" &&
    seedShare?.token === SEED_SHARE_TOKEN &&
    seedShare?.revoked_at === null,
  seedShare?.token
);

// ── share_links uniqueness: one link per update + unique tokens ──
let dupUpdateRejected = false;
try {
  await db.query(
    "insert into public.share_links (workspace_id, update_id, token) values ($1, $2, '00000000-0000-0000-0000-000000000055')",
    [SEED_WS, "00000000-0000-0000-0000-000000000040"]
  );
} catch (e) {
  dupUpdateRejected = /duplicate key/.test(e.message);
}
check("share_links unique(update_id) — one link per update", dupUpdateRejected);

let dupTokenRejected = false;
try {
  await db.query(
    "insert into public.share_links (workspace_id, update_id, token) values ($1, $2, $3)",
    [SEED_WS, "00000000-0000-0000-0000-000000000041", SEED_SHARE_TOKEN]
  );
} catch (e) {
  dupTokenRejected = /duplicate key/.test(e.message);
}
check("share_links unique(token) enforces token uniqueness", dupTokenRejected);

// ── Seed templates (Step 11) ──
const { rows: seedTemplates } = await db.query(
  "select id, title from public.templates where id = any($1) order by title",
  [["00000000-0000-0000-0000-000000000060", "00000000-0000-0000-0000-000000000061"]]
);
check(
  "seed templates present (2 snippets on the demo workspace)",
  seedTemplates.length === 2 && seedTemplates.every((t) => t.title.length > 0),
  seedTemplates.map((t) => t.title).join(" | ")
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
    public.briefs, public.brief_sources, public.brief_questions, public.brief_edit_history,
    public.proposals, public.plans, public.updates, public.share_links, public.templates,
    public.team_invites
    to nstester;
`);
// fixtures the seed user does NOT belong to, plus one own-workspace REVOKED
// share link (fixture for the RPC's revoked-filter check)
await db.exec(`
  insert into public.workspaces (id, name) values ('${FOREIGN_WS}', 'Foreign Co') on conflict do nothing;
  insert into public.briefs (id, workspace_id, title) values ('${FOREIGN_BRIEF}', '${FOREIGN_WS}', 'Foreign brief') on conflict do nothing;
  insert into public.proposals (id, workspace_id, brief_id, title) values ('${FOREIGN_PROPOSAL}', '${FOREIGN_WS}', '${FOREIGN_BRIEF}', 'Foreign proposal') on conflict do nothing;
  insert into public.plans (id, workspace_id, proposal_id, title) values ('${FOREIGN_PLAN}', '${FOREIGN_WS}', '${FOREIGN_PROPOSAL}', 'Foreign plan') on conflict do nothing;
  insert into public.updates (id, workspace_id, plan_id, title) values ('${FOREIGN_UPDATE}', '${FOREIGN_WS}', '${FOREIGN_PLAN}', 'Foreign update') on conflict do nothing;
  insert into public.share_links (id, workspace_id, update_id, token) values ('${FOREIGN_SHARE_LINK}', '${FOREIGN_WS}', '${FOREIGN_UPDATE}', '00000000-0000-0000-0000-000000000093') on conflict do nothing;
  insert into public.share_links (id, workspace_id, update_id, token, revoked_at) values ('${REVOKED_SHARE_LINK}', '${SEED_WS}', '00000000-0000-0000-0000-000000000041', '${REVOKED_SHARE_TOKEN}', now()) on conflict do nothing;
  -- a second user who is only a MEMBER of the demo workspace (Step 11:
  -- owner-vs-member split checks) — auth trigger creates their profile
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '${MEMBER_UID}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'leo@nookscript.dev', 'pglite-test-password-hash', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Leo Park"}'::jsonb,
    now(), now(), '', '', '', ''
  ) on conflict (id) do nothing;
  insert into public.workspace_members (workspace_id, user_id, role) values ('${SEED_WS}', '${MEMBER_UID}', 'member') on conflict (workspace_id, user_id) do nothing;
  -- Step 15 fixtures: the invite accepter (NOT a member of any workspace —
  -- inserted after the seed, so its catch-all member insert missed them)
  -- and an EXPIRED invite addressed to the member user.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '${TEAMMATE_UID}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'teammate@brightloop.co', 'pglite-test-password-hash', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Tess Amara"}'::jsonb,
    now(), now(), '', '', '', ''
  ) on conflict (id) do nothing;
  insert into public.team_invites (
    id, workspace_id, email, token, invited_by, expires_at
  ) values (
    '00000000-0000-0000-0000-000000000065', '${SEED_WS}', 'leo@nookscript.dev',
    '${EXPIRED_INVITE_TOKEN}', '${SEED_UID}', now() - interval '1 day'
  ) on conflict do nothing;
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

// ── RLS on proposals (Step 7) ──
// updated_at value before the member's status update, for the touch-trigger
// check below (seed sets it to now() - 12h, so any update advances it).
const { rows: [propBefore] } = await db.query(
  "select updated_at from public.proposals where id = $1",
  [SEED_PROPOSAL]
);

await db.query("set role nstester");
const { rows: visibleProposals } = await db.query("select id from public.proposals");
check(
  "RLS: member sees own-workspace proposals only",
  visibleProposals.length === 1 && visibleProposals[0].id === SEED_PROPOSAL,
  `${visibleProposals.length} visible`
);

let insertProposalBlocked = false;
try {
  await db.query(
    "insert into public.proposals (workspace_id, brief_id, title) values ($1, $2, 'nope')",
    [FOREIGN_WS, FOREIGN_BRIEF]
  );
} catch (e) {
  insertProposalBlocked = true;
}
check("RLS: cannot insert proposal into foreign workspace", insertProposalBlocked);

const { rows: updP } = await db.query(
  "update public.proposals set status = 'sent' where id = $1 returning status",
  [SEED_PROPOSAL]
);
check("RLS: member can update proposal status", updP[0]?.status === "sent");
await db.query("reset role");

const { rows: [propAfter] } = await db.query(
  "select updated_at from public.proposals where id = $1",
  [SEED_PROPOSAL]
);
check(
  "proposals updated_at touch trigger fires",
  new Date(propAfter.updated_at) > new Date(propBefore.updated_at)
);

// ── RLS on plans (Step 8) ──
const { rows: [planBefore] } = await db.query(
  "select updated_at from public.plans where id = $1",
  [SEED_PLAN]
);

await db.query("set role nstester");
const { rows: visiblePlans } = await db.query("select id from public.plans");
check(
  "RLS: member sees own-workspace plans only",
  visiblePlans.length === 1 && visiblePlans[0].id === SEED_PLAN,
  `${visiblePlans.length} visible`
);

let insertPlanBlocked = false;
try {
  await db.query(
    "insert into public.plans (workspace_id, proposal_id, title) values ($1, $2, 'nope')",
    [FOREIGN_WS, FOREIGN_PROPOSAL]
  );
} catch (e) {
  insertPlanBlocked = true;
}
check("RLS: cannot insert plan into foreign workspace", insertPlanBlocked);

const { rows: updPl } = await db.query(
  "update public.plans set status = 'in_progress' where id = $1 returning status",
  [SEED_PLAN]
);
check("RLS: member can update plan status", updPl[0]?.status === "in_progress");
await db.query("reset role");

const { rows: [planAfter] } = await db.query(
  "select updated_at from public.plans where id = $1",
  [SEED_PLAN]
);
check(
  "plans updated_at touch trigger fires",
  new Date(planAfter.updated_at) > new Date(planBefore.updated_at)
);

// ── RLS on updates (Step 9) ──
const { rows: [updateBefore] } = await db.query(
  "select updated_at from public.updates where id = $1",
  [SEED_UPDATE_DRAFT]
);

await db.query("set role nstester");
const { rows: visibleUpdates } = await db.query("select id from public.updates");
check(
  "RLS: member sees own-workspace updates only",
  visibleUpdates.length === 2 &&
    visibleUpdates.every((u) => u.id === SEED_UPDATE_SENT || u.id === SEED_UPDATE_DRAFT),
  `${visibleUpdates.length} visible`
);

let insertUpdateBlocked = false;
try {
  await db.query(
    "insert into public.updates (workspace_id, plan_id, title) values ($1, $2, 'nope')",
    [FOREIGN_WS, FOREIGN_PLAN]
  );
} catch (e) {
  insertUpdateBlocked = true;
}
check("RLS: cannot insert update into foreign workspace", insertUpdateBlocked);

const { rows: updU } = await db.query(
  "update public.updates set status = 'sent' where id = $1 returning status",
  [SEED_UPDATE_DRAFT]
);
check("RLS: member can update update status", updU[0]?.status === "sent");
await db.query("reset role");

const { rows: [updateAfter] } = await db.query(
  "select updated_at from public.updates where id = $1",
  [SEED_UPDATE_DRAFT]
);
check(
  "updates updated_at touch trigger fires",
  new Date(updateAfter.updated_at) > new Date(updateBefore.updated_at)
);

// ── RLS on share_links + public RPC (Step 10) ──
await db.query("set role nstester");
const { rows: visibleLinks } = await db.query("select id from public.share_links order by id");
check(
  "RLS: member sees own-workspace share links only",
  visibleLinks.length === 2 &&
    visibleLinks.every((l) => l.id === SEED_SHARE_LINK || l.id === REVOKED_SHARE_LINK),
  `${visibleLinks.length} visible`
);

let insertLinkBlocked = false;
try {
  await db.query(
    "insert into public.share_links (workspace_id, update_id) values ($1, $2)",
    [FOREIGN_WS, FOREIGN_UPDATE]
  );
} catch (e) {
  insertLinkBlocked = true;
}
check("RLS: cannot insert share link into foreign workspace", insertLinkBlocked);

// get_shared_document — called as nstester (a non-member role), proving the
// definer RPC is anon-callable and self-gated
const { rows: sharedDoc } = await db.query(
  "select title, client_name, status, body from public.get_shared_document($1)",
  [SEED_SHARE_TOKEN]
);
check(
  "get_shared_document returns the update for a valid active token",
  sharedDoc.length === 1 &&
    sharedDoc[0].title.startsWith("Update — Week 1") &&
    sharedDoc[0].status === "sent" &&
    sharedDoc[0].body.includes("social media kit"),
  sharedDoc[0]?.title
);

const { rows: revokedDoc } = await db.query(
  "select title from public.get_shared_document($1)",
  [REVOKED_SHARE_TOKEN]
);
check(
  "get_shared_document returns nothing for a revoked token",
  revokedDoc.length === 0
);

const { rows: missingDoc } = await db.query(
  "select title from public.get_shared_document('10000000-0000-0000-0000-000000000000')"
);
check(
  "get_shared_document returns nothing for a nonexistent token",
  missingDoc.length === 0
);
await db.query("reset role");

// ── templates: owner-only writes (Step 11) — the first "member ✗ / owner ✓" split ──

// as a plain MEMBER: read yes, write no
await db.query("select set_config('app.jwt_sub', $1, false)", [MEMBER_UID]);
await db.query("set role nstester");
const { rows: memberTemplates } = await db.query(
  "select id from public.templates order by id"
);
check(
  "RLS: plain member can VIEW templates (read allowed)",
  memberTemplates.length === 2,
  `${memberTemplates.length} visible`
);
let memberInsertRejected = false;
try {
  await db.query(
    "insert into public.templates (workspace_id, title) values ($1, 'nope')",
    [SEED_WS]
  );
} catch (e) {
  memberInsertRejected = true;
}
check("RLS: plain member CANNOT insert template (owner-only)", memberInsertRejected);

// as the OWNER (seed user): full CRUD + touch trigger on a throwaway row
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
const { rows: [tempTpl] } = await db.query(
  "insert into public.templates (workspace_id, title, body) values ($1, 'Temp template', 'temp') returning id, updated_at",
  [SEED_WS]
);
check("RLS: OWNER can insert template", Boolean(tempTpl?.id), tempTpl?.id);

await new Promise((r) => setTimeout(r, 20));
const { rows: [tempAfter] } = await db.query(
  "update public.templates set body = 'updated' where id = $1 returning updated_at, body",
  [tempTpl.id]
);
check("RLS: OWNER can update template", tempAfter?.body === "updated");
check(
  "templates updated_at touch trigger fires",
  new Date(tempAfter.updated_at) > new Date(tempTpl.updated_at)
);

const { rowCount: tplDeleted } = await db.query(
  "delete from public.templates where id = $1",
  [tempTpl.id]
);
check("RLS: OWNER can delete template (first delete policy)", tplDeleted === 1);

// workspace scoping still holds even for an owner: no writing in foreign ws
let foreignTplBlocked = false;
try {
  await db.query(
    "insert into public.templates (workspace_id, title) values ($1, 'nope')",
    [FOREIGN_WS]
  );
} catch (e) {
  foreignTplBlocked = true;
}
check("RLS: owner cannot insert template into foreign workspace", foreignTplBlocked);
await db.query("reset role");

// ── add_brief_source() RPC (Step 12 inbox threading) ──
// atomic pair: insert brief_sources row + log 'source_added' history row,
// guarded by workspace membership via workspace_id_of_brief().

// happy path as a plain MEMBER (Leo) — members, not just owners, may thread
await db.query("select set_config('app.jwt_sub', $1, false)", [MEMBER_UID]);
await db.query("set role nstester");
const NEW_SOURCE_RAW = "Follow-up from Priya: keep two hero layout candidates open for now.";
let newSourceId = null;
let addSourceErr = null;
try {
  const { rows: [src] } = await db.query(
    "select public.add_brief_source($1, $2, $3, $4) as id",
    [
      SEED_BRIEF,
      "email",
      NEW_SOURCE_RAW,
      JSON.stringify({
        pasted_at: new Date().toISOString(),
        char_count: NEW_SOURCE_RAW.length,
      }),
    ]
  );
  newSourceId = src?.id ?? null;
} catch (e) {
  addSourceErr = e;
}
check(
  "add_brief_source: member can thread a source onto a brief",
  Boolean(newSourceId) && addSourceErr === null,
  addSourceErr ? String(addSourceErr.message).slice(0, 80) : newSourceId
);

const { rows: [insertedSource] } = await db.query(
  "select source_type, raw_content, metadata->>'char_count' as char_count from public.brief_sources where id = $1",
  [newSourceId]
);
check(
  "add_brief_source: inserted brief_sources row is correct (type/content/metadata)",
  insertedSource?.source_type === "email" &&
    insertedSource?.raw_content === NEW_SOURCE_RAW &&
    Number(insertedSource?.char_count) === NEW_SOURCE_RAW.length
);

const { rows: [addedHist] } = await db.query(
  "select action_type, description, user_id from public.brief_edit_history where brief_id = $1 order by created_at desc limit 1",
  [SEED_BRIEF]
);
check(
  "add_brief_source: 'source_added' history row logged with the caller as actor",
  addedHist?.action_type === "source_added" &&
    addedHist?.description === "added a new source (email)" &&
    addedHist?.user_id === MEMBER_UID
);

// unauthorized: the demo owner is NOT a member of the foreign workspace
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
let foreignSourceId = null;
let foreignSourceErr = null;
try {
  const { rows: [f] } = await db.query(
    "select public.add_brief_source($1, 'email', 'unauthorized marker text here', '{}'::jsonb) as id",
    [FOREIGN_BRIEF]
  );
  foreignSourceId = f?.id ?? null;
} catch (e) {
  foreignSourceErr = e;
}
check(
  "add_brief_source rejects non-member workspaces",
  foreignSourceId === null && foreignSourceErr !== null,
  foreignSourceErr
    ? String(foreignSourceErr.message).slice(0, 80)
    : "unexpectedly succeeded"
);

// a rejected call must leave NOTHING behind (the pair is one transaction)
const { rows: [atomicity] } = await db.query(
  `select
    (select count(*)::int from public.brief_sources
      where brief_id = $1 and raw_content like 'unauthorized marker%') as leftover_sources,
    (select count(*)::int from public.brief_edit_history
      where brief_id = $2 and action_type = 'source_added') as leftover_history`,
  [FOREIGN_BRIEF, FOREIGN_BRIEF]
);
check(
  "add_brief_source rejection is atomic — no partial source/history rows",
  atomicity?.leftover_sources === 0 && atomicity?.leftover_history === 0,
  JSON.stringify(atomicity)
);

// bad source_type guard (explicit, mirroring create_brief_bundle)
let badTypeErr = null;
try {
  await db.query(
    "select public.add_brief_source($1, 'tweet', 'a realistic reply from the client here', '{}'::jsonb)",
    [SEED_BRIEF]
  );
} catch (e) {
  badTypeErr = e;
}
check(
  "add_brief_source rejects invalid source_type",
  badTypeErr !== null && /bad_source_type/.test(String(badTypeErr.message))
);
await db.query("reset role");

// ── workspaces rename policy (post-roadmap item): owner-only UPDATE ──
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
await db.query("set role nstester");
const { rowCount: renameCount } = await db.query(
  "update public.workspaces set name = 'Atelier North (renamed)' where id = $1",
  [SEED_WS]
);
const { rows: [renamedWs] } = await db.query(
  "select name from public.workspaces where id = $1",
  [SEED_WS]
);
check(
  "RLS: OWNER can rename the workspace",
  renameCount === 1 && renamedWs?.name === "Atelier North (renamed)",
  renamedWs?.name
);

await db.query("select set_config('app.jwt_sub', $1, false)", [MEMBER_UID]);
const { rowCount: memberRenameCount } = await db.query(
  "update public.workspaces set name = 'hijacked name' where id = $1",
  [SEED_WS]
);
const { rows: [afterMemberAttempt] } = await db.query(
  "select name from public.workspaces where id = $1",
  [SEED_WS]
);
check(
  "RLS: plain member CANNOT rename the workspace (owner-only)",
  memberRenameCount === 0 && afterMemberAttempt?.name === "Atelier North (renamed)"
);

await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
const { rowCount: foreignRenameCount } = await db.query(
  "update public.workspaces set name = 'hijacked' where id = $1",
  [FOREIGN_WS]
);
check(
  "RLS: cannot rename a foreign workspace",
  foreignRenameCount === 0
);
// restore the seeded name so the file stays self-describing
await db.query("update public.workspaces set name = 'Atelier North' where id = $1", [SEED_WS]);
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

// ── Step 15: team_invites (RLS + token RPCs + members list) ──
await db.query("reset role");

// owner reads invites; members are blind to the table
await db.query("set role nstester");
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
const { rows: ownerInvites } = await db.query(
  "select email from public.team_invites where token = $1",
  [SEED_INVITE_TOKEN]
);
check(
  "RLS: owner sees workspace invites",
  ownerInvites.length === 1 && ownerInvites[0].email === "teammate@brightloop.co",
  JSON.stringify(ownerInvites)
);

await db.query("select set_config('app.jwt_sub', $1, false)", [MEMBER_UID]);
const { rows: memberInvites } = await db.query("select id from public.team_invites");
check("RLS: member sees ZERO invites (owner-only table)", memberInvites.length === 0);

let memberInviteBlocked = false;
try {
  await db.query(
    "insert into public.team_invites (workspace_id, email, invited_by, expires_at) values ($1, 'nope@x.co', $2, now() + interval '14 days')",
    [SEED_WS, MEMBER_UID]
  );
} catch (e) {
  memberInviteBlocked = true;
}
check("RLS: member cannot create invites", memberInviteBlocked);

// one PENDING invite per (workspace, email): owner insert passes RLS but
// the partial unique index rejects the duplicate
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
let dupPendingBlocked = false;
try {
  await db.query(
    "insert into public.team_invites (workspace_id, email, invited_by, expires_at) values ($1, 'teammate@brightloop.co', $2, now() + interval '14 days')",
    [SEED_WS, SEED_UID]
  );
} catch (e) {
  dupPendingBlocked = /duplicate key/.test(e.message);
}
check("duplicate PENDING invite per (workspace, email) is rejected", dupPendingBlocked);

// public preview probe: indistinguishable zero rows for unknown tokens
const { rows: previewBad } = await db.query(
  "select * from public.get_team_invite_preview('00000000-0000-0000-0000-0000000000ff')"
);
check("get_team_invite_preview: unknown token → zero rows", previewBad.length === 0);

const { rows: previewOk } = await db.query(
  "select * from public.get_team_invite_preview($1)",
  [SEED_INVITE_TOKEN]
);
check(
  "get_team_invite_preview: live token → workspace name only",
  previewOk.length === 1 &&
    previewOk[0].workspace_name === "Atelier North" &&
    Object.keys(previewOk[0]).sort().join(",") === "expires_at,workspace_name",
  JSON.stringify(previewOk[0] ?? null)
);

// accept guards: expired → generic invalid; wrong email → mismatch
await db.query("select set_config('app.jwt_sub', $1, false)", [MEMBER_UID]);
let expiredGuard = false;
try {
  await db.query("select public.accept_team_invite($1)", [EXPIRED_INVITE_TOKEN]);
} catch (e) {
  expiredGuard = /invite_invalid_or_expired/.test(e.message);
}
check("accept_team_invite: expired token → invite_invalid_or_expired", expiredGuard);

let mismatchGuard = false;
try {
  await db.query("select public.accept_team_invite($1)", [SEED_INVITE_TOKEN]);
} catch (e) {
  mismatchGuard = /invite_email_mismatch/.test(e.message);
}
check("accept_team_invite: wrong account email → invite_email_mismatch", mismatchGuard);

// happy path: targeted user accepts → member row + consumed invite
await db.query("select set_config('app.jwt_sub', $1, false)", [TEAMMATE_UID]);
const { rows: [acceptRow] } = await db.query(
  "select public.accept_team_invite($1) as ws",
  [SEED_INVITE_TOKEN]
);
check("accept_team_invite: invitee joins, workspace id returned", acceptRow?.ws === SEED_WS);

await db.query("reset role");
const { rows: [newMember] } = await db.query(
  `select wm.role, ti.accepted_at is not null as consumed, ti.accepted_by
     from public.workspace_members wm, public.team_invites ti
    where wm.workspace_id = $1 and wm.user_id = $2 and ti.token = $3`,
  [SEED_WS, TEAMMATE_UID, SEED_INVITE_TOKEN]
);
check(
  "accept writes 'member' row + stamps accepted_at/accepted_by",
  newMember?.role === "member" &&
    newMember.consumed === true &&
    newMember.accepted_by === TEAMMATE_UID,
  JSON.stringify(newMember)
);

// single-use: second accept of the consumed token fails like an invalid one
await db.query("set role nstester");
await db.query("select set_config('app.jwt_sub', $1, false)", [TEAMMATE_UID]);
let secondAccept = false;
try {
  await db.query("select public.accept_team_invite($1)", [SEED_INVITE_TOKEN]);
} catch (e) {
  secondAccept = /invite_invalid_or_expired/.test(e.message);
}
check("accept_team_invite: consumed token → invite_invalid_or_expired (single-use)", secondAccept);

const { rows: previewAfter } = await db.query(
  "select * from public.get_team_invite_preview($1)",
  [SEED_INVITE_TOKEN]
);
check("preview returns zero rows for an accepted token (indistinguishable)", previewAfter.length === 0);

// members list RPC: owner and member both read it; outsiders get zero rows
const { rows: membersOwner } = await db.query(
  "select * from public.get_workspace_members()"
);
// (jwt still TEAMMATE — a member) → members can read the list too
check(
  "get_workspace_members: member sees the roster (Maya + Leo + Tess)",
  membersOwner.length === 3 &&
    membersOwner[0].full_name === "Maya Chen" &&
    membersOwner[0].role === "owner" &&
    membersOwner.filter((m) => m.role === "member").length === 2,
  `${membersOwner.length} rows`
);

await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
const { rows: membersAsOwner } = await db.query(
  "select * from public.get_workspace_members()"
);
check("get_workspace_members: owner sees the same roster", membersAsOwner.length === 3);

await db.query("select set_config('app.jwt_sub', $1, false)", ["00000000-0000-0000-0000-000000000090"]);
const { rows: membersOutsider } = await db.query(
  "select * from public.get_workspace_members()"
);
check("get_workspace_members: non-member → zero rows", membersOutsider.length === 0);
await db.query("reset role");
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);

// ── Step 16: active workspace (profiles pointer + resolver) ──
const { rows: [awsCol] } = await db.query(
  `select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'active_workspace_id'`
);
check("profiles.active_workspace_id column exists (uuid)", awsCol?.data_type === "uuid");

const { rows: [awsFk] } = await db.query(
  `select c.confdeltype from pg_constraint c
     join pg_class t on t.oid = c.conrelid
     join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where t.relname = 'profiles' and c.contype = 'f'
      and a.attname = 'active_workspace_id'`
);
check(
  "active_workspace_id FK references workspaces, ON DELETE SET NULL",
  awsFk?.confdeltype === "n",
  `confdeltype=${awsFk?.confdeltype}`
);

// RLS: the existing profiles update-own policy governs the pointer
await db.query("set role nstester");
const { rowCount: selfSet } = await db.query(
  "update public.profiles set active_workspace_id = $1 where id = $2",
  [SECOND_WS, SEED_UID]
);
check("RLS: user can set their OWN active workspace", selfSet === 1);

await db.query("select set_config('app.jwt_sub', $1, false)", [MEMBER_UID]);
const { rowCount: foreignSet } = await db.query(
  "update public.profiles set active_workspace_id = $1 where id = $2",
  [SECOND_WS, SEED_UID] // Leo tries to move MAYA's pointer
);
check("RLS: cannot set another user's active workspace", foreignSet === 0);

// resolver: pointer → pointer's roster (ws B has Maya alone)
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
const { rows: wsBMembers } = await db.query(
  "select * from public.get_workspace_members()"
);
check(
  "get_workspace_members follows the active pointer (ws B = Maya alone)",
  wsBMembers.length === 1 && wsBMembers[0].user_id === SEED_UID,
  `${wsBMembers.length} rows`
);

// resolver: stale pointer (not a member of it) heals to first-joined
await db.query("reset role");
await db.query(
  "update public.profiles set active_workspace_id = $1 where id = $2",
  [FOREIGN_WS, SEED_UID]
);
await db.query("set role nstester");
const { rows: healed } = await db.query(
  "select * from public.get_workspace_members()"
);
check(
  "stale active pointer falls back to first-joined workspace",
  healed.length === 3 && healed[0].full_name === "Maya Chen",
  `${healed.length} rows`
);

// resolver: NULL pointer (every pre-existing account) → first-joined.
// Also restores Maya's pointer so fixture state stays canonical.
await db.query("reset role");
await db.query(
  "update public.profiles set active_workspace_id = null where id = $1",
  [SEED_UID]
);
await db.query("set role nstester");
const { rows: nulled } = await db.query(
  "select * from public.get_workspace_members()"
);
check("null active pointer resolves to first-joined workspace", nulled.length === 3);
await db.query("reset role");

console.log(failures === 0 ? "\nAll database checks passed ✔" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
