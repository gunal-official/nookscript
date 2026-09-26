/**
 * Step 2 verification: Supabase auth + workspace model (run LOCALLY — the
 * sandbox can't reach *.supabase.co).
 *
 * Prereqs:
 *   1. Supabase project created, migration applied (see README.md)
 *   2. .env.local filled in (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)
 *   3. Email confirmation OFF: Dashboard → Authentication → Providers →
 *      Email → disable "Confirm email" (required for sessions at signup)
 *
 * Run:  node scripts/verify-auth.mjs
 *
 * Exercises exactly what the app does: signup → profile trigger → initials →
 * RLS reads → create_workspace RPC → membership join → owner-only insert.
 * Creates two throwaway users — cleanup notes printed at the end.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    return readFileSync(".env.local", "utf8")
      .split("\n")
      .reduce((acc, line) => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m) acc[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        return acc;
      }, {});
  } catch {
    return {};
  }
}

const env = { ...loadEnvLocal(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error(
    "✗ Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (set them in .env.local or the environment)"
  );
  process.exit(1);
}

const stamp = Date.now();
const email = `nookscript-test-${stamp}@example.com`;
const password = `Test-${stamp}-Pw!`;
const fullName = "Test Person";
const workspaceName = `Test Workspace ${stamp}`;

const client = createClient(url, anon);

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

// 1 ── Signup issues a session (requires email confirmation OFF)
const { data: signUp, error: signUpErr } = await client.auth.signUp({
  email,
  password,
  options: { data: { full_name: fullName } },
});
check("signup succeeds", !signUpErr && !!signUp.user, signUpErr?.message ?? email);
if (signUpErr || !signUp.user) process.exit(1);

if (!signUp.session) {
  console.error(
    "\n✗ No session at signup — email confirmation is ON in your project.\n" +
      "  Disable it: Dashboard → Authentication → Providers → Email → “Confirm email” off.\n" +
      "  (The app itself still works via /onboarding; this script needs a session.)"
  );
  process.exit(1);
}
check("session issued at signup", true);

const userId = signUp.user.id;

// 2 ── Profile trigger + derived initials
const { data: profile, error: profileErr } = await client
  .from("profiles")
  .select("full_name, avatar_initials")
  .eq("id", userId)
  .single();
check(
  "profiles row auto-created by trigger",
  !profileErr && profile?.full_name === fullName,
  JSON.stringify(profile)
);
check('avatar_initials auto-derived ("TP")', profile?.avatar_initials === "TP");

// 3 ── RLS: profiles are private to their owner
const { data: otherProfiles } = await client
  .from("profiles")
  .select("id")
  .neq("id", userId);
check("RLS: cannot read other users' profiles", (otherProfiles ?? []).length === 0);

// 4 ── Workspace bootstrap RPC (same call the signup server action makes)
const { data: wsId, error: wsErr } = await client.rpc("create_workspace", {
  workspace_name: workspaceName,
});
check("create_workspace RPC succeeds", !wsErr && !!wsId, wsErr?.message);

// 5 ── Membership + workspace readable through RLS
const { data: membership, error: memErr } = await client
  .from("workspace_members")
  .select("role, workspace:workspaces(id, name)")
  .eq("user_id", userId)
  .single();
check("membership created with role 'owner'", !memErr && membership?.role === "owner");
check(
  "workspace readable via membership (RLS)",
  membership?.workspace?.name === workspaceName
);

// 6 ── Owner-only insert policy: a stranger cannot add themselves
const { data: stranger, error: strangerErr } = await client.auth.signUp({
  email: `nookscript-stranger-${stamp}@example.com`,
  password,
});
if (strangerErr || !stranger.session) {
  check("second signup for RLS test", false, strangerErr?.message ?? "no session");
} else {
  const { error: insertErr } = await client
    .from("workspace_members")
    .insert({ workspace_id: wsId, user_id: stranger.user.id, role: "member" });
  check("RLS: non-owner cannot insert members", !!insertErr, insertErr?.code);

  const { data: foreignWs } = await client
    .from("workspaces")
    .select("id")
    .eq("id", wsId);
  check("RLS: non-member cannot see the workspace", (foreignWs ?? []).length === 0);
}

// 7 ── Anonymous clients see nothing
const anonClient = createClient(url, anon);
const { data: anonRows } = await anonClient.from("workspaces").select("id");
check("RLS: anonymous select returns nothing", (anonRows ?? []).length === 0);

// 8 ── Sign-out works
const { error: signOutErr } = await client.auth.signOut();
check("signOut succeeds", !signOutErr);

console.log(
  failures === 0
    ? "\nAll Step 2 checks passed ✔"
    : `\n${failures} check(s) FAILED`
);
console.log(
  "Cleanup: Dashboard → Authentication → Users → delete the two " +
    "nookscript-* test users (profile/membership rows cascade). The empty " +
    `"${workspaceName}" row in workspaces can be deleted in Table Editor.`
);
process.exit(failures === 0 ? 0 : 1);
