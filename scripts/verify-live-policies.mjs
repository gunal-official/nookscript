/**
 * Step 28: live POLICY probe — the behavioral sibling of
 * scripts/verify-live-schema.mjs (npm run verify:live).
 *
 *   npm run verify:live:policies
 *
 * Why this exists: verify:live checks that tables + RPCs EXIST via the
 * anon key. Policy-only migrations create neither — forget to run
 * migration 10 (workspace rename), 16 (roles), 17 (leave), or 18
 * (workspace deletion) and every existence check still passes while
 * the app's writes silently no-op or die at runtime. This probe closes
 * that gap: it BEHAVES like the app against the real project and
 * asserts the allow/deny verdict of each policy surface.
 *
 * Mechanism (scripts/verify-auth.mjs precedent): throwaway signups +
 * a scratch workspace — every write is confined to that scratch data,
 * and the sequence self-cleans (the workspace is deleted by the last
 * checks; only the two test users remain — cleanup notes at the end).
 * Needs email confirmation OFF (same prereq as verify-auth).
 *
 * Output conventions mirror verify-db/verify-live (✓/✗ lines; failures
 * name the exact supabase/migrations file; exit 0 pass / 1 fail).
 *
 * The policy SEMANTICS asserted here are proven offline against real
 * Postgres by `npm run verify:db` (136 checks); this script's job is
 * detecting drift on the HOSTED project.
 */

import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

// ── env: process.env wins; otherwise lightly parse .env.local ──
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*\S)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    if (process.env[match[1]]) continue;
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error(
    "✗ Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (set them in .env.local or the environment)"
  );
  process.exit(1);
}

const M = {
  init: "20260922000000_workspace_auth_init.sql",
  rename: "20260923060000_workspaces_rename_policy.sql",
  roles: "20260925120000_role_management.sql",
  leave: "20260925180000_workspace_members_leave.sql",
  deletion: "20260925200000_workspace_deletion.sql",
};

let failures = 0;
function check(label, ok, extra = "", migration = null) {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) {
    failures++;
    if (migration) {
      console.log(`     (expected from supabase/migrations/${migration})`);
    }
  }
}

const stamp = Date.now();
const password = `Test-${stamp}-Pw!`;
const wsName = `RLS Policy Probe ${stamp}`;
const clientA = createClient(url, anon); // owner persona
const clientB = createClient(url, anon); // member persona

// ── personas + scratch workspace ──
const { data: signUpA, error: errA } = await clientA.auth.signUp({
  email: `nookscript-policy-a-${stamp}@example.com`,
  password,
  options: { data: { full_name: "Policy Probe A" } },
});
check(
  "signup (owner persona) + session",
  !errA && !!signUpA?.user && !!signUpA?.session,
  errA?.message ?? ""
);
if (!signUpA?.session) {
  console.error(
    "\n✗ No session at signup — email confirmation is ON in your project.\n" +
      "  Disable it: Dashboard → Authentication → Providers → Email → “Confirm email” off."
  );
  process.exit(1);
}

const { data: wsId, error: wsErr } = await clientA.rpc("create_workspace", {
  workspace_name: wsName,
});
check("create_workspace RPC (scratch workspace)", !wsErr && !!wsId, wsErr?.message ?? "");
if (!wsId) process.exit(1);

const { data: signUpB, error: errB } = await clientB.auth.signUp({
  email: `nookscript-policy-b-${stamp}@example.com`,
  password,
  options: { data: { full_name: "Policy Probe B" } },
});
check(
  "signup (member persona) + session",
  !errB && !!signUpB?.user && !!signUpB?.session,
  errB?.message ?? ""
);
if (!signUpB?.session) process.exit(1);
const uidA = signUpA.user.id;
const uidB = signUpB.user.id;

// ── baseline insert policy (migration 2) ──
const { error: insErr } = await clientA
  .from("workspace_members")
  .insert({ workspace_id: wsId, user_id: uidB, role: "member" });
check("policy: owner CAN add a member", !insErr, insErr?.message ?? "", M.init);

// ── workspace rename (migration 10 — policy-only) ──
const renamed = await clientA
  .from("workspaces")
  .update({ name: `${wsName} R` })
  .eq("id", wsId)
  .select("id");
check(
  "policy: owner CAN rename the workspace",
  !renamed.error && renamed.data?.length === 1,
  renamed.error?.message ?? "",
  M.rename
);
const deniedRename = await clientB
  .from("workspaces")
  .update({ name: `${wsName} X` })
  .eq("id", wsId)
  .select("id");
check(
  "policy: member rename is DENIED (0 rows)",
  !deniedRename.error && deniedRename.data?.length === 0,
  deniedRename.error?.message ?? "",
  M.rename
);

// ── role management (migration 16 — policy + triggers only) ──
const promoted = await clientA
  .from("workspace_members")
  .update({ role: "owner" })
  .eq("workspace_id", wsId)
  .eq("user_id", uidB)
  .select("user_id");
check(
  "policy: owner CAN promote a member",
  !promoted.error && promoted.data?.length === 1,
  promoted.error?.message ?? "",
  M.roles
);
const demoted = await clientA
  .from("workspace_members")
  .update({ role: "member" })
  .eq("workspace_id", wsId)
  .eq("user_id", uidB)
  .select("user_id");
check(
  "policy: owner CAN demote an owner",
  !demoted.error && demoted.data?.length === 1,
  demoted.error?.message ?? "",
  M.roles
);
const selfChange = await clientA
  .from("workspace_members")
  .update({ role: "member" })
  .eq("workspace_id", wsId)
  .eq("user_id", uidA)
  .select("user_id");
check(
  "policy: self role-change is DENIED (guard)",
  !!selfChange.error || selfChange.data?.length === 0,
  selfChange.error?.message ?? "",
  M.roles
);

// ── workspace deletion gating (migration 18 — policy-only) ──
const delByMember = await clientB
  .from("workspaces")
  .delete()
  .eq("id", wsId)
  .select("id");
check(
  "policy: member CANNOT delete the workspace (0 rows)",
  !delByMember.error && delByMember.data?.length === 0,
  delByMember.error?.message ?? "",
  M.deletion
);

// ── leave (migration 17 — policy + triggers only) ──
await clientB
  .from("profiles")
  .update({ active_workspace_id: wsId })
  .eq("id", uidB)
  .select("id"); // silent setup — pins the pointer for the trigger probe
const leaveB = await clientB
  .from("workspace_members")
  .delete()
  .eq("workspace_id", wsId)
  .eq("user_id", uidB)
  .select("user_id");
check(
  "policy: member CAN leave (self-delete)",
  !leaveB.error && leaveB.data?.length === 1,
  leaveB.error?.message ?? "",
  M.leave
);
const { data: ptrRow } = await clientB
  .from("profiles")
  .select("active_workspace_id")
  .eq("id", uidB)
  .maybeSingle();
check(
  "policy: leaving CLEARS the active pointer (trigger)",
  ptrRow?.active_workspace_id === null,
  JSON.stringify(ptrRow),
  M.leave
);
const leaveA = await clientA
  .from("workspace_members")
  .delete()
  .eq("workspace_id", wsId)
  .eq("user_id", uidA)
  .select("user_id");
check(
  "policy: the last owner CANNOT leave (guard)",
  !!leaveA.error || leaveA.data?.length === 0,
  leaveA.error?.message ?? "",
  M.leave
);

// ── workspace deletion (migration 18) — also the cleanup ──
const delByOwner = await clientA
  .from("workspaces")
  .delete()
  .eq("id", wsId)
  .select("id");
check(
  "policy: owner CAN delete a solo workspace (cascade past own row)",
  !delByOwner.error && delByOwner.data?.length === 1,
  delByOwner.error?.message ?? "",
  M.deletion
);
const { data: wsLeft } = await clientA.from("workspaces").select("id").eq("id", wsId);
check("deletion applied (scratch workspace gone)", (wsLeft ?? []).length === 0, "", M.deletion);

console.log(
  failures === 0
    ? "\nAll live policy checks passed ✔"
    : `\n${failures} live policy check(s) FAILED`
);
console.log(
  "Cleanup: Dashboard → Authentication → Users → delete the two " +
    "nookscript-policy-* test users (their profile rows cascade). " +
    "The scratch workspace is deleted by the run itself — if the run " +
    "failed early, delete the “" + wsName + "” row in Table Editor."
);
process.exit(failures === 0 ? 0 : 1);
