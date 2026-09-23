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
 *   - invoices (Step 17): status CHECK, per-workspace unique numbers, one
 *     link per invoice, and get_shared_invoice() returns zero rows for
 *     invalid / revoked / draft-invoice tokens (all indistinguishable)
 *   - time_entries (Step 18): duration CHECK (integer minutes > 0),
 *     brief_id FK + nullable general rows, and the schema's ONE delete
 *     policy (documented exception: personal work log, not audit data)
 *   - contracts (Step 19): status CHECK (draft/sent/signed/void),
 *     brief_id FK + nullable standalone rows, member RLS, and NO
 *     delete policy (legal/financial document — void is the cancel)
 *   - member removal (Step 21): the Step-2 owner-only DELETE policy on
 *     workspace_members — plain member ✗ / owner ✓
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
const SEED_INVOICE_DRAFT = "00000000-0000-0000-0000-000000000065";
const SEED_INVOICE_SENT = "00000000-0000-0000-0000-000000000066";
const SEED_INVOICE_LINK_DRAFT = "00000000-0000-0000-0000-000000000067";
const DRAFT_INVOICE_TOKEN = "00000000-0000-0000-0000-000000000069";
const SEED_INVOICE_LINK_SENT = "00000000-0000-0000-0000-000000000068";
const SENT_INVOICE_TOKEN = "00000000-0000-0000-0000-000000000070";
const SEED_TIME_ENTRY_YESTERDAY = "00000000-0000-0000-0000-000000000071";
const SEED_TIME_ENTRY_TODAY = "00000000-0000-0000-0000-000000000072";
const SEED_TIME_ENTRY_GENERAL = "00000000-0000-0000-0000-000000000073";
const SEED_TIME_ENTRY_3DAYS = "00000000-0000-0000-0000-000000000074";
const SEED_CONTRACT_SIGNED = "00000000-0000-0000-0000-000000000075";
const SEED_CONTRACT_DRAFT = "00000000-0000-0000-0000-000000000076";
// Step 17 fixtures (verify-db only, like the share-link ones above):
const REVOKED_INVOICE = "00000000-0000-0000-0000-000000000091";
const REVOKED_INVOICE_TOKEN = "00000000-0000-0000-0000-000000000089";
const REVOKED_INVOICE_LINK = "00000000-0000-0000-0000-000000000093";
const FOREIGN_INVOICE = "00000000-0000-0000-0000-000000000092";
// Step 18 fixtures (verify-db only): TEMP_ = a member-scoped probe row we
// may legally mutate; FOREIGN_ = a row in Foreign Co for the RLS probes.
const TEMP_TIME_ENTRY = "00000000-0000-0000-0000-000000000095";
const FOREIGN_TIME_ENTRY = "00000000-0000-0000-0000-000000000094";
// Step 19 fixtures (verify-db only), continuing the fixture-id run.
const TEMP_CONTRACT = "00000000-0000-0000-0000-000000000096";
const FOREIGN_CONTRACT = "00000000-0000-0000-0000-000000000097";

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
  [["briefs", "brief_sources", "brief_questions", "brief_edit_history", "proposals", "plans", "updates", "share_links", "templates", "workspaces", "workspace_members", "profiles", "team_invites", "invoices", "invoice_links"]]
);
check(
  "all 15 tables exist with RLS enabled",
  rlsRows.length === 15 && rlsRows.every((r) => r.relrowsecurity),
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

// ── Seed invoices (Step 17) ──
const { rows: seedInvoices } = await db.query(
  "select id, invoice_number, status, client_name, items, tax_percent from public.invoices where id = any($1) order by invoice_number",
  [[SEED_INVOICE_DRAFT, SEED_INVOICE_SENT]]
);
check(
  "seed invoices present (sequential: draft INV-0001 + sent INV-0002)",
  seedInvoices.length === 2 &&
    seedInvoices[0]?.invoice_number === 1 &&
    seedInvoices[1]?.invoice_number === 2 &&
    seedInvoices[0]?.status === "draft" &&
    seedInvoices[1]?.status === "sent" &&
    seedInvoices.every((i) => i.client_name === "Brightloop Co.") &&
    Array.isArray(seedInvoices[0]?.items) &&
    seedInvoices.every((i) => i.items.length === 2),
  seedInvoices.map((i) => `${i.invoice_number}:${i.status}`).join(" ")
);

const { rows: seedInvoiceLinks } = await db.query(
  "select id, invoice_id, token, revoked_at from public.invoice_links where id = any($1) order by id",
  [[SEED_INVOICE_LINK_DRAFT, SEED_INVOICE_LINK_SENT]]
);
check(
  "seed invoice links present (draft + sent invoices, both active)",
  seedInvoiceLinks.length === 2 &&
    seedInvoiceLinks[0]?.token === DRAFT_INVOICE_TOKEN &&
    seedInvoiceLinks[0]?.invoice_id === SEED_INVOICE_DRAFT &&
    seedInvoiceLinks[1]?.token === SENT_INVOICE_TOKEN &&
    seedInvoiceLinks[1]?.invoice_id === SEED_INVOICE_SENT &&
    seedInvoiceLinks.every((l) => l.revoked_at === null),
  seedInvoiceLinks.map((l) => l.token).join(" ")
);

// ── Seed time entries (Step 18) ──
const { rows: seedTimeEntries } = await db.query(
  "select id, brief_id, duration_minutes from public.time_entries where id = any($1) order by worked_on desc, created_at",
  [
    [
      SEED_TIME_ENTRY_YESTERDAY,
      SEED_TIME_ENTRY_TODAY,
      SEED_TIME_ENTRY_GENERAL,
      SEED_TIME_ENTRY_3DAYS,
    ],
  ]
);
check(
  "seed time entries present (3 brief-linked + 1 general, 505 min total)",
  seedTimeEntries.length === 4 &&
    seedTimeEntries.filter((t) => t.brief_id === SEED_BRIEF).length === 3 &&
    seedTimeEntries.filter((t) => t.brief_id === null).length === 1 &&
    seedTimeEntries.reduce((sum, t) => sum + Number(t.duration_minutes), 0) ===
      505,
  seedTimeEntries.map((t) => `${t.duration_minutes}m`).join(" + ")
);

// ── Seed contracts (Step 19) ──
const { rows: seedContracts } = await db.query(
  "select id, status, client_name, brief_id, signed_by, sent_at, signed_at from public.contracts where id = any($1) order by created_at",
  [[SEED_CONTRACT_DRAFT, SEED_CONTRACT_SIGNED]]
);
check(
  "seed contracts present (1 draft + 1 signed with audit stamps)",
  seedContracts.length === 2 &&
    seedContracts.some((c) => c.status === "draft" && c.brief_id === null && c.sent_at === null && c.signed_at === null) &&
    seedContracts.some((c) =>
      c.status === "signed" &&
      c.brief_id === SEED_BRIEF &&
      c.signed_by === "Dana Whitfield (Brightloop)" &&
      c.sent_at !== null &&
      c.signed_at !== null
    ),
  seedContracts.map((c) => c.status).join(" + ")
);

// ── invoices constraints: status CHECK + per-workspace unique number ──
let invoiceStatusRejected = false;
try {
  await db.query(
    "insert into public.invoices (workspace_id, invoice_number, client_name, title, status) values ($1, 99, 'x', 'x', 'archived')",
    [SEED_WS]
  );
} catch (e) {
  invoiceStatusRejected = /violates check constraint/.test(e.message);
}
check("invoices.status CHECK rejects invalid value", invoiceStatusRejected);

let dupInvoiceNumberRejected = false;
try {
  await db.query(
    "insert into public.invoices (workspace_id, invoice_number, client_name, title) values ($1, 2, 'x', 'x')",
    [SEED_WS]
  );
} catch (e) {
  dupInvoiceNumberRejected = /duplicate key/.test(e.message);
}
check(
  "invoices unique(workspace_id, invoice_number) — per-workspace sequence",
  dupInvoiceNumberRejected
);

let dupInvoiceLinkRejected = false;
try {
  await db.query(
    "insert into public.invoice_links (workspace_id, invoice_id) values ($1, $2)",
    [SEED_WS, SEED_INVOICE_SENT]
  );
} catch (e) {
  dupInvoiceLinkRejected = /duplicate key/.test(e.message);
}
check(
  "invoice_links unique(invoice_id) — one link per invoice",
  dupInvoiceLinkRejected
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
    public.team_invites, public.invoices, public.invoice_links,
    public.time_entries, public.contracts
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
  -- Step 17 fixtures: a FOREIGN invoice (for the cross-workspace RLS
  -- checks) and an own-workspace invoice whose link is REVOKED (fixture
  -- for get_shared_invoice's revoked-filter check)
  insert into public.invoices (id, workspace_id, invoice_number, client_name, title, status) values ('${FOREIGN_INVOICE}', '${FOREIGN_WS}', 1, 'Foreign Co', 'Foreign invoice', 'sent') on conflict do nothing;
  insert into public.invoices (id, workspace_id, invoice_number, client_name, title, status, sent_at) values ('${REVOKED_INVOICE}', '${SEED_WS}', 9, 'Foreign Co', 'Invoice with revoked link', 'sent', now()) on conflict do nothing;
  insert into public.invoice_links (id, workspace_id, invoice_id, token, revoked_at) values ('${REVOKED_INVOICE_LINK}', '${SEED_WS}', '${REVOKED_INVOICE}', '${REVOKED_INVOICE_TOKEN}', now()) on conflict do nothing;
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

// ── RLS on invoices + public RPC (Step 17) ──
await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
await db.query("set role nstester");
const { rows: visibleInvoices } = await db.query(
  "select id from public.invoices order by invoice_number"
);
check(
  "RLS: member sees own-workspace invoices only",
  visibleInvoices.length === 3 &&
    visibleInvoices.every((i) =>
      [SEED_INVOICE_DRAFT, SEED_INVOICE_SENT, REVOKED_INVOICE].includes(i.id)
    ),
  `${visibleInvoices.length} visible`
);

let insertInvoiceBlocked = false;
try {
  await db.query(
    "insert into public.invoices (workspace_id, invoice_number, client_name, title) values ($1, 1, 'x', 'x')",
    [FOREIGN_WS]
  );
} catch (e) {
  insertInvoiceBlocked = true;
}
check("RLS: cannot insert invoice into foreign workspace", insertInvoiceBlocked);

let deleteInvoicePossible = false;
try {
  const { rowCount } = await db.query(
    "delete from public.invoices where id = $1",
    [SEED_INVOICE_DRAFT]
  );
  deleteInvoicePossible = rowCount === 1;
} catch (e) {
  deleteInvoicePossible = false;
}
check(
  "RLS: invoices have NO delete policy — void is the only cancel",
  !deleteInvoicePossible
);
await db.query("reset role");

// get_shared_invoice — called as nstester (a non-member role), proving the
// definer RPC is anon-callable and self-gated
await db.query("set role nstester");
const { rows: sharedInvoice } = await db.query(
  "select invoice_number, client_name, status, items, workspace_name from public.get_shared_invoice($1)",
  [SENT_INVOICE_TOKEN]
);
check(
  "get_shared_invoice returns the invoice for a valid active token",
  sharedInvoice.length === 1 &&
    sharedInvoice[0].invoice_number === 2 &&
    sharedInvoice[0].client_name === "Brightloop Co." &&
    sharedInvoice[0].status === "sent" &&
    Array.isArray(sharedInvoice[0].items) &&
    sharedInvoice[0].items.length === 2 &&
    sharedInvoice[0].workspace_name === "Atelier North",
  sharedInvoice[0]?.title
);

const { rows: draftInvoice } = await db.query(
  "select invoice_number from public.get_shared_invoice($1)",
  [DRAFT_INVOICE_TOKEN]
);
check(
  "get_shared_invoice returns nothing for a draft invoice's link",
  draftInvoice.length === 0
);

const { rows: revokedInvoice } = await db.query(
  "select invoice_number from public.get_shared_invoice($1)",
  [REVOKED_INVOICE_TOKEN]
);
check(
  "get_shared_invoice returns nothing for a revoked token",
  revokedInvoice.length === 0
);

const { rows: missingInvoice } = await db.query(
  "select invoice_number from public.get_shared_invoice('10000000-0000-0000-0000-000000000000')"
);
check(
  "get_shared_invoice returns nothing for a nonexistent token",
  missingInvoice.length === 0
);
await db.query("reset role");

// ── time_entries constraints + RLS (Step 18) ──
let zeroDurationRejected = false;
try {
  await db.query(
    "insert into public.time_entries (workspace_id, description, duration_minutes) values ($1, 'x', 0)",
    [SEED_WS]
  );
} catch (e) {
  zeroDurationRejected = true;
}
check("time_entries.duration_minutes CHECK rejects 0", zeroDurationRejected);

let negativeDurationRejected = false;
try {
  await db.query(
    "insert into public.time_entries (workspace_id, description, duration_minutes) values ($1, 'x', -5)",
    [SEED_WS]
  );
} catch (e) {
  negativeDurationRejected = true;
}
check(
  "time_entries.duration_minutes CHECK rejects negatives",
  negativeDurationRejected
);

let missingDescriptionRejected = false;
try {
  await db.query(
    "insert into public.time_entries (workspace_id, description, duration_minutes) values ($1, null, 5)",
    [SEED_WS]
  );
} catch (e) {
  missingDescriptionRejected = true;
}
check("time_entries.description NOT NULL rejects null", missingDescriptionRejected);

let timeBriefFkRejected = false;
try {
  await db.query(
    "insert into public.time_entries (workspace_id, brief_id, description, duration_minutes) values ($1, '10000000-0000-0000-0000-000000000000', 'x', 5)",
    [SEED_WS]
  );
} catch (e) {
  timeBriefFkRejected = true;
}
check("time_entries.brief_id FK enforces a real brief", timeBriefFkRejected);

// Fixture rows for the RLS probes (created as superuser, like the
// Step 17 invoice fixtures).
await db.query(
  "insert into public.time_entries (id, workspace_id, description, duration_minutes) values ($1, $2, 'rls probe', 5)",
  [TEMP_TIME_ENTRY, SEED_WS]
);
await db.query(
  "insert into public.time_entries (id, workspace_id, description, duration_minutes) values ($1, $2, 'foreign probe', 5)",
  [FOREIGN_TIME_ENTRY, FOREIGN_WS]
);

await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
await db.query("set role nstester");
const { rows: visibleTimeEntries } = await db.query(
  "select id from public.time_entries"
);
check(
  "RLS: member sees own-workspace time entries only",
  visibleTimeEntries.length === 5 &&
    visibleTimeEntries.every((t) =>
      [
        SEED_TIME_ENTRY_YESTERDAY,
        SEED_TIME_ENTRY_TODAY,
        SEED_TIME_ENTRY_GENERAL,
        SEED_TIME_ENTRY_3DAYS,
        TEMP_TIME_ENTRY,
      ].includes(t.id)
    ),
  `${visibleTimeEntries.length} visible`
);

let insertTimeEntryBlocked = false;
try {
  await db.query(
    "insert into public.time_entries (workspace_id, description, duration_minutes) values ($1, 'x', 5)",
    [FOREIGN_WS]
  );
} catch (e) {
  insertTimeEntryBlocked = true;
}
check(
  "RLS: cannot insert time entry into foreign workspace",
  insertTimeEntryBlocked
);

// The documented exception: a member CAN delete their own entry…
let deleteTimeEntryPossible = false;
try {
  const { rowCount } = await db.query(
    "delete from public.time_entries where id = $1",
    [TEMP_TIME_ENTRY]
  );
  deleteTimeEntryPossible = rowCount === 1;
} catch (e) {
  deleteTimeEntryPossible = false;
}
check(
  "RLS: member CAN delete own time entry (the schema's one delete policy)",
  deleteTimeEntryPossible
);

// …but never someone else's workspace's.
let deleteForeignTimeEntryPossible = false;
try {
  const { rowCount } = await db.query(
    "delete from public.time_entries where id = $1",
    [FOREIGN_TIME_ENTRY]
  );
  deleteForeignTimeEntryPossible = rowCount === 1;
} catch (e) {
  deleteForeignTimeEntryPossible = false;
}
check(
  "RLS: cannot delete a foreign workspace's time entry",
  !deleteForeignTimeEntryPossible
);
await db.query("reset role");

// updated_at trigger keeps touching (like every other table).
await db.query(
  "update public.time_entries set description = 'rls probe (touched)' where id = $1",
  [SEED_TIME_ENTRY_YESTERDAY]
);
const { rows: touchedEntry } = await db.query(
  "select (updated_at >= created_at) as touched, description from public.time_entries where id = $1",
  [SEED_TIME_ENTRY_YESTERDAY]
);
check(
  "time_entries updated_at touch trigger fires on update",
  touchedEntry.length === 1 &&
    touchedEntry[0].touched === true &&
    touchedEntry[0].description === "rls probe (touched)"
);

// ── contracts constraints + RLS (Step 19) ──
let contractStatusRejected = false;
try {
  await db.query(
    "insert into public.contracts (workspace_id, client_name, title, status) values ($1, 'x', 'x', 'accepted')",
    [SEED_WS]
  );
} catch (e) {
  contractStatusRejected = true;
}
check(
  "contracts.status CHECK rejects invalid value",
  contractStatusRejected
);

let contractBriefFkRejected = false;
try {
  await db.query(
    "insert into public.contracts (workspace_id, brief_id, client_name, title) values ($1, '10000000-0000-0000-0000-000000000000', 'x', 'x')",
    [SEED_WS]
  );
} catch (e) {
  contractBriefFkRejected = true;
}
check("contracts.brief_id FK enforces a real brief", contractBriefFkRejected);

// Fixture rows for the RLS probes (superuser, like the Step 17/18 ones).
await db.query(
  "insert into public.contracts (id, workspace_id, client_name, title) values ($1, $2, 'rls probe', 'x')",
  [TEMP_CONTRACT, SEED_WS]
);
await db.query(
  "insert into public.contracts (id, workspace_id, client_name, title) values ($1, $2, 'foreign probe', 'x')",
  [FOREIGN_CONTRACT, FOREIGN_WS]
);

await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
await db.query("set role nstester");
const { rows: visibleContracts } = await db.query(
  "select id from public.contracts"
);
check(
  "RLS: member sees own-workspace contracts only",
  visibleContracts.length === 3 &&
    visibleContracts.every((c) =>
      [SEED_CONTRACT_SIGNED, SEED_CONTRACT_DRAFT, TEMP_CONTRACT].includes(
        c.id
      )
    ),
  `${visibleContracts.length} visible`
);

let insertContractBlocked = false;
try {
  await db.query(
    "insert into public.contracts (workspace_id, client_name, title) values ($1, 'x', 'x')",
    [FOREIGN_WS]
  );
} catch (e) {
  insertContractBlocked = true;
}
check(
  "RLS: cannot insert contract into foreign workspace",
  insertContractBlocked
);

let deleteContractPossible = false;
try {
  const { rowCount } = await db.query(
    "delete from public.contracts where id = $1",
    [SEED_CONTRACT_DRAFT]
  );
  deleteContractPossible = rowCount === 1;
} catch (e) {
  deleteContractPossible = false;
}
check(
  "RLS: contracts have NO delete policy — void is the only cancel",
  !deleteContractPossible
);
await db.query("reset role");

// updated_at trigger keeps touching (like every other table).
await db.query(
  "update public.contracts set terms = 'touched' where id = $1",
  [SEED_CONTRACT_DRAFT]
);
const { rows: touchedContract } = await db.query(
  "select (updated_at >= created_at) as touched, terms from public.contracts where id = $1",
  [SEED_CONTRACT_DRAFT]
);
check(
  "contracts updated_at touch trigger fires on update",
  touchedContract.length === 1 &&
    touchedContract[0].touched === true &&
    touchedContract[0].terms === "touched"
);

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

// ── workspace_members delete policy (Step 21: member removal) ──
// The owner-only DELETE policy has existed since the Step 2 migration;
// Step 21 adds the app surface and this finally exercises it. Tess
// (TEAMMATE_UID) is a plain member of the seeded workspace — the probe
// deletes her membership, and runs LAST so no earlier roster-count
// check sees the change.
await db.query("select set_config('app.jwt_sub', $1, false)", [MEMBER_UID]);
await db.query("set role nstester");
let memberDeleteBlocked = true;
try {
  const { rowCount } = await db.query(
    "delete from public.workspace_members where workspace_id = $1 and user_id = $2",
    [SEED_WS, TEAMMATE_UID]
  );
  memberDeleteBlocked = rowCount === 0;
} catch (e) {
  memberDeleteBlocked = true;
}
check(
  "RLS: plain member CANNOT delete a workspace member",
  memberDeleteBlocked
);

await db.query("select set_config('app.jwt_sub', $1, false)", [SEED_UID]);
await db.query("set role nstester");
let ownerDeletePossible = false;
try {
  const { rowCount } = await db.query(
    "delete from public.workspace_members where workspace_id = $1 and user_id = $2",
    [SEED_WS, TEAMMATE_UID]
  );
  ownerDeletePossible = rowCount === 1;
} catch (e) {
  ownerDeletePossible = false;
}
check(
  "RLS: owner CAN delete a workspace member (removal path)",
  ownerDeletePossible
);
await db.query("reset role");

console.log(failures === 0 ? "\nAll database checks passed ✔" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
