/**
 * Live-schema probe — checks that the REAL hosted Supabase project's
 * schema matches what supabase/migrations expects (all app tables +
 * app-facing RPCs exist), using only the ANON key and no logged-in
 * session, so it runs from any shell or CI box with .env.local filled in.
 *
 *   npm run verify:live
 *
 * Why this exists: `npm run verify:db` proves the committed migrations
 * apply cleanly to a FRESH in-memory Postgres (PGlite). It cannot see
 * drift on a real hosted project — the Step-10 lesson, where the offline
 * gate passed 100% while /share/:token 404ed at runtime with PGRST205
 * ("table not found") because the share_links migration had never been
 * applied to the live project. This probe closes that gap: run it after
 * `supabase db push`, before deploying UI that depends on new schema, or
 * whenever something 404s mysteriously at runtime.
 *
 * How existence is detected client-side WITHOUT any new database objects:
 *   - Tables: `select * limit 0` via PostgREST. A table missing from the
 *     schema cache returns PGRST205 — the EXACT error signature drift
 *     produces at runtime. An existing table returns success (RLS filters
 *     rows; `limit 0` never requires row access), and even a permission
 *     error would still prove the relation resolved — only PGRST205 /
 *     "Could not find the table" means "missing".
 *   - RPCs: called once each with guard-tripping arguments. A missing
 *     function returns PGRST202 ("Could not find the function ... in the
 *     schema cache"). A present function reaches its own guard
 *     (not_authenticated / not_authorized / brief_not_found / whatever it
 *     raises first) — any response OTHER than PGRST202 proves existence.
 *     Write-safety: every app-facing RPC checks auth.uid() / workspace
 *     membership BEFORE inserting (read the bodies in supabase/migrations),
 *     and under the anon key auth.uid() is null and membership is empty,
 *     so each call dies in the guard with nothing written.
 *
 * Output conventions mirror scripts/verify-db.mjs (✓/✗ lines + banner,
 * exit 0 pass / 1 fail) so the two gates read the same way.
 */

import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// ── env: process.env wins; otherwise lightly parse .env.local (no new deps) ──
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*\S)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    if (process.env[match[1]]) continue; // never clobber a real env var
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}
loadEnvFile(".env.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

function bail(message, hint) {
  console.error(`✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

if (
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY ||
  SUPABASE_URL.includes("your-project-ref")
) {
  bail(
    "Live Supabase credentials are not configured.",
    "Copy .env.local.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL " +
      "and NEXT_PUBLIC_SUPABASE_ANON_KEY from Project Settings → API " +
      "(this probe is read-only — the anon key is all it needs)."
  );
}

// ── What the committed migrations promise ─────────────────────────────────
// (migration: which file added the object, for actionable failure messages)
const TABLES = [
  { name: "profiles", migration: "20260922000000_workspace_auth_init.sql" },
  { name: "workspaces", migration: "20260922000000_workspace_auth_init.sql" },
  { name: "workspace_members", migration: "20260922000000_workspace_auth_init.sql" },
  { name: "briefs", migration: "20260922123000_briefs_schema.sql" },
  { name: "brief_sources", migration: "20260922123000_briefs_schema.sql" },
  { name: "brief_questions", migration: "20260922123000_briefs_schema.sql" },
  { name: "brief_edit_history", migration: "20260922123000_briefs_schema.sql" },
  { name: "proposals", migration: "20260923000000_proposals_schema.sql" },
  { name: "plans", migration: "20260923010000_plans_schema.sql" },
  { name: "updates", migration: "20260923020000_updates_schema.sql" },
  { name: "share_links", migration: "20260923030000_share_links_schema.sql" },
  { name: "templates", migration: "20260923040000_templates_schema.sql" },
];

const RPCS = [
  {
    name: "create_workspace",
    migration: "20260922000000_workspace_auth_init.sql",
    args: { workspace_name: "nookscript-live-probe" },
    // guard: raises 'not_authenticated' under the anon key, before any insert
  },
  {
    name: "create_brief_bundle",
    migration: "20260922130000_create_brief_bundle_rpc.sql",
    args: {
      p_workspace_id: NIL_UUID,
      p_title: "probe",
      p_objective: null,
      p_deliverables: [],
      p_budget_timeline: null,
      p_client_name: null,
      p_owner_id: NIL_UUID,
      p_source_type: "manual",
      p_raw_content: "probe",
      p_source_metadata: {},
      p_questions: [],
    },
    // guard: is_workspace_member(nil) is false → 'not_authorized', no write
  },
  {
    name: "update_brief_field",
    migration: "20260922123000_briefs_schema.sql",
    args: {
      brief_uuid: NIL_UUID,
      field_name: "title",
      new_value: "probe",
      editor_id: NIL_UUID,
    },
    // guard: brief doesn't exist / membership empty → raises before any write
  },
  {
    name: "get_shared_document",
    migration: "20260923030000_share_links_schema.sql",
    args: { p_token: NIL_UUID },
    // token not found → clean empty result (function exists); anyone may run it
  },
  {
    name: "add_brief_source",
    migration: "20260923050000_add_brief_source_rpc.sql",
    args: {
      p_brief_id: NIL_UUID,
      p_source_type: "manual",
      p_raw_content: "probe",
      p_metadata: {},
    },
    // guard: 'brief_not_found' before any insert under the nil brief id
  },
];

console.log(
  `Probing live schema at ${SUPABASE_URL} (anon key, read-only)…`
);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let connectivityDead = false;

// ── Tables: `select * limit 0`; only PGRST205 means "missing" ──
for (const table of TABLES) {
  const { error } = await supabase.from(table.name).select("*").limit(0);

  if (!error) {
    check(`table: ${table.name}`, true);
    continue;
  }
  if (error.code === "PGRST205" || /could not find the table/i.test(error.message)) {
    check(`table: ${table.name}`, false, "NOT FOUND in live schema");
    console.log(
      `   ↳ Table '${table.name}' not found in live schema — did you forget to run \`supabase db push\`?\n` +
        `     (expected from supabase/migrations/${table.migration})`
    );
    continue;
  }
  if (/fetch|network|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/i.test(error.message)) {
    connectivityDead = true;
    break;
  }
  // Any other error (e.g. permission denied) still proves the relation resolved
  check(`table: ${table.name}`, true, `exists (responded ${error.code || "error"})`);
}
if (connectivityDead) {
  bail(
    `Could not reach ${SUPABASE_URL}.`,
    "Check your network connection and that NEXT_PUBLIC_SUPABASE_URL in " +
      ".env.local points at a live Supabase project."
  );
}

// ── RPCs: call with guard-tripping args; only PGRST202 means "missing" ──
for (const rpc of RPCS) {
  const { data, error } = await supabase.rpc(rpc.name, rpc.args);

  if (!error) {
    check(`rpc: ${rpc.name}`, true, "exists (callable)");
    if (Array.isArray(data) && data.length > 0) {
      // Should be impossible under the nil guard args — flag loudly if not.
      console.error(
        `   ↳ WARNING: ${rpc.name} returned rows under probe args — inspect before trusting this gate`
      );
    }
    continue;
  }
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
    check(`rpc: ${rpc.name}`, false, "NOT FOUND in live schema");
    console.log(
      `   ↳ RPC '${rpc.name}' not found in live schema — did you forget to run \`supabase db push\`?\n` +
        `     (expected from supabase/migrations/${rpc.migration})`
    );
    continue;
  }
  // Reached the function's own guard (e.g. not_authenticated / brief_not_found)
  check(`rpc: ${rpc.name}`, true, `exists (guard: ${error.message})`);
}

const total = TABLES.length + RPCS.length;
console.log(
  failures === 0
    ? `\nAll live schema checks passed ✔ (${total} items)`
    : `\n${failures} live schema check(s) FAILED (${total - failures}/${total} present)\n` +
        "Apply the missing migration file(s) above to the live project " +
        "(`supabase db push`, or SQL Editor paste), then re-run `npm run verify:live`."
);
process.exit(failures === 0 ? 0 : 1);
