#!/usr/bin/env node
/**
 * verify:responsive — real-browser responsive audit (Step 32).
 *
 * Boots the app (next dev) against an in-process Supabase stub with
 * rich fixtures, then renders EVERY page at every breakpoint in headless
 * Chromium (@sparticuz/chromium binary + playwright-core) and measures
 * what a real viewport sees:
 *
 *   • horizontal overflow (scrollWidth > viewport) + offending elements
 *   • cut-off text (overflow:hidden + scrolled content, ellipsis exempt)
 *   • tap targets below 44×44 (reported per width; phone widths gated)
 *   • fixed-position elements escaping the viewport (timer pill, etc.)
 *   • dialogs opened and measured on the narrow widths
 * plus full screenshots as evidence (pages/320|768, complex/*, dialog/*).
 *
 * Usage:  node scripts/verify-responsive.mjs [--mode before|after]
 * Env:    SHOTS_DIR (default /home/user/responsive-evidence/<mode>)
 * Exit:   1 when any page×width has overflow, escaping fixed elements,
 *         or true cut-offs (tap-target gaps gate only at phone widths).
 */
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODE = (process.argv.includes("--mode") ? process.argv[process.argv.indexOf("--mode") + 1] : "after") || "after";
const SHOTS = process.env.SHOTS_DIR || join(tmpdir(), "..", "home", "user", "responsive-evidence", `step32-${MODE}`);
const STUB_PORT = 54330;
const APP_PORT = Number(process.env.APP_PORT ?? 3200 + Math.floor(Math.random() * 700));
const BASE = `http://127.0.0.1:${APP_PORT}`;
const freePort = (port) => { try { execFileSync("bash", ["-c", `ss -tlnp 2>/dev/null | grep ":${port} " | grep -o "pid=[0-9]*" | cut -d= -f2 | sort -u | xargs -r kill -9`], { stdio: "ignore" }); } catch {} };

const WIDTHS_ALL = [
  { w: 320, h: 568 },
  { w: 375, h: 667 },
  { w: 414, h: 736 },
  { w: 600, h: 800 }, // in-between probe (mobile nav stretched)
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 1440, h: 900 },
];
const WIDTH_FILTER = (process.env.WIDTHS ?? "").split(",").map(Number).filter(Boolean);
const WIDTHS = WIDTH_FILTER.length ? WIDTHS_ALL.filter((x) => WIDTH_FILTER.includes(x.w)) : WIDTHS_ALL;
const RUN_DIALOG = process.env.RUN_DIALOG === "1";
const SUM_SUFFIX = WIDTH_FILTER.length ? `-${WIDTH_FILTER.join("_")}` : "-all";
const PHONE = (w) => w < 768;

const U = {
  brief: "00000000-0000-0000-0000-000000000111",
  proposal: "00000000-0000-0000-0000-000000000112",
  plan: "00000000-0000-0000-0000-000000000113",
  update: "00000000-0000-0000-0000-000000000114",
  invoice: "00000000-0000-0000-0000-000000000115",
  contract: "00000000-0000-0000-0000-000000000116",
};

const PAGES = [
  { slug: "marketing-home", url: "/", auth: false },
  { slug: "marketing-about", url: "/about", auth: false },
  { slug: "marketing-pricing", url: "/pricing", auth: false },
  { slug: "marketing-vs-notion", url: "/vs/notion", auth: false },
  { slug: "login", url: "/login", auth: false },
  { slug: "signup", url: "/signup", auth: false },
  { slug: "invite-token", url: "/invite/tok-inv-1", auth: false },
  { slug: "share-token", url: "/share/tok-share-1", auth: false },
  { slug: "invoice-token", url: "/invoice/tok-bill-1", auth: false },
  { slug: "onboarding", url: "/onboarding", auth: true },
  { slug: "intake", url: "/intake", auth: true },
  { slug: "intake-inbox", url: "/intake/inbox", auth: true },
  { slug: "briefs", url: "/briefs", auth: true },
  { slug: "brief-detail", url: `/briefs/${U.brief}`, auth: true },
  { slug: "proposals", url: "/proposals", auth: true },
  { slug: "proposal-detail", url: `/proposals/${U.proposal}`, auth: true },
  { slug: "plans", url: "/plans", auth: true },
  { slug: "plan-detail", url: `/plans/${U.plan}`, auth: true },
  { slug: "updates", url: "/updates", auth: true },
  { slug: "update-detail", url: `/updates/${U.update}`, auth: true },
  { slug: "invoices", url: "/invoices", auth: true },
  { slug: "invoice-detail", url: `/invoices/${U.invoice}`, auth: true },
  { slug: "contracts", url: "/contracts", auth: true },
  { slug: "contract-detail", url: `/contracts/${U.contract}`, auth: true },
  { slug: "time", url: "/time", auth: true },
  { slug: "reports", url: "/reports", auth: true },
  { slug: "settings", url: "/settings", auth: true },
];
const COMPLEX = new Set(["invoice-detail", "time", "reports", "settings"]);

// ───────────────────────── fixtures (rich rows — every page renders) ──
const NOW = "2026-09-25T10:00:00Z";
const USERS = { "usr-a": { full_name: "Maya Chen", avatar_initials: "MC" } };
const WS = { id: "ws-1", name: "Atelier North" };
const ROSTER = [
  { user_id: "usr-a", full_name: "Maya Chen", avatar_initials: "MC", role: "owner", joined_at: NOW },
  { user_id: "usr-b", full_name: "Leo Fox", avatar_initials: "LF", role: "member", joined_at: NOW },
  { user_id: "usr-c", full_name: "Tess Ray", avatar_initials: "TR", role: "viewer", joined_at: NOW },
];
const TEMPLATES = [
  { id: "tpl-1", workspace_id: WS.id, title: "Weekly cadence", body: "## Cadence\n\nLong reusable body text that wraps across several lines in the dialog editor.", created_at: NOW, updated_at: NOW },
  { id: "tpl-2", workspace_id: WS.id, title: "Handover checklist", body: "Items…", created_at: NOW, updated_at: NOW },
];
const BRIEF_ROW = {
  id: U.brief, workspace_id: WS.id, title: "Harbor Lane rebrand", objective: "Refresh the identity.", deliverables: [{ id: "d1", text: "Logo suite with wordmark and monogram variants", checked: true }, { id: "d2", text: "Brand guidelines document", checked: false }],
  budget_timeline: "£12k, six weeks", status: "in_review", owner_id: "usr-a", client_name: "Harbor Lane Studio", created_at: NOW, updated_at: NOW,
};
const BRIEF_DETAIL = {
  ...BRIEF_ROW,
  sources: [{ id: "s1", brief_id: U.brief, source_type: "email", raw_content: "Client wrote: we need a refreshed identity before the spring campaign launch, including logo, colors, and a guidelines document for the franchisees.", metadata: {}, created_at: NOW }],
  questions: [{ id: "q1", brief_id: U.brief, question_text: "Who signs off on the final logo direction?", context_note: "Three stakeholders named so far", status: "open", answer_text: null, answered_by: null, created_at: NOW, resolved_at: null }],
  edit_history: [{ id: "h1", brief_id: U.brief, user_id: null, action_type: "generated", description: "Brief generated from email", created_at: NOW }],
};
const PROPOSAL = { id: U.proposal, workspace_id: WS.id, brief_id: U.brief, title: "Harbor Lane — phase 1 proposal", client_name: "Harbor Lane Studio", status: "sent", deliverables: [{ id: "d1", text: "Logo suite with wordmark and monogram variants", checked: true }, { id: "d2", text: "Brand guidelines document", checked: false }], body: "Scope and terms…", created_at: NOW, updated_at: NOW, brief: { id: U.brief, title: BRIEF_ROW.title } };
const PLAN = { id: U.plan, workspace_id: WS.id, proposal_id: U.proposal, title: "Harbor Lane — delivery plan", client_name: "Harbor Lane Studio", status: "in_progress", tasks: [{ id: "t1", text: "Discovery workshop and stakeholder interviews", checked: true }, { id: "t2", text: "Moodboards", checked: false }, { id: "t3", text: "Logo exploration rounds", checked: false }], created_at: NOW, updated_at: NOW, proposal: { id: U.proposal, title: PROPOSAL.title } };
const UPDATE_ROW = { id: U.update, workspace_id: WS.id, plan_id: U.plan, title: "Weekly update — week 3", body: "## Progress\n\nDiscovery wrapped. Two moodboard directions ready for review.\n\n## Next\n\nLogo exploration.", client_name: "Harbor Lane Studio", status: "draft", created_at: NOW, updated_at: NOW, plan: { id: U.plan, title: PLAN.title } };
const INV_ITEMS = [
  { id: "i1", description: "Discovery and brand strategy workshop with franchise stakeholders", quantity: 1, unit_amount_cents: 45000 },
  { id: "i2", description: "Logo design", quantity: 3, unit_amount_cents: 12000 },
  { id: "i3", description: "Brand guidelines document", quantity: 1, unit_amount_cents: 38000 },
];
const INVOICE = { id: U.invoice, workspace_id: WS.id, invoice_number: 7, title: "Harbor Lane — phase 1", client_name: "Harbor Lane Studio", status: "sent", items: INV_ITEMS, tax_percent: 20, notes: "Net 14 — please pay within 14 days of the due date. Bank transfer preferred.", due_date: "2026-10-15", sent_at: NOW, paid_at: null, created_at: NOW, updated_at: NOW };
const INVOICE_LINK = { id: "il-1", workspace_id: WS.id, invoice_id: U.invoice, token: "tok-bill-1", created_at: NOW, revoked_at: null };
const CONTRACT = { id: U.contract, workspace_id: WS.id, brief_id: U.brief, client_name: "Harbor Lane Studio", title: "Harbor Lane — engagement letter", status: "sent", terms: "Scope: brand identity refresh as per the attached proposal. Fee: £12,000 excl. VAT, invoiced 50% up front and 50% on delivery. Payment: net 14. Cancellation: 30 days notice in writing. Exclusivity: 90 days post-delivery within the hospitality sector.", expires_on: "2026-12-01", signed_by: "Dana Whitfield (Brightloop)", sent_at: NOW, signed_at: null, created_at: NOW, updated_at: NOW };
const TIME_ENTRIES = [
  { id: "te-1", workspace_id: WS.id, brief_id: U.brief, description: "Discovery workshop and stakeholder interviews", worked_on: "2026-09-24", duration_minutes: 150, created_at: NOW, updated_at: NOW },
  { id: "te-2", workspace_id: WS.id, brief_id: null, description: "Studio admin and long description that wraps on narrow screens to test layout", worked_on: "2026-09-23", duration_minutes: 45, created_at: NOW, updated_at: NOW },
  { id: "te-3", workspace_id: WS.id, brief_id: U.brief, description: "Moodboards", worked_on: "2026-09-22", duration_minutes: 240, created_at: NOW, updated_at: NOW },
];
const INVITES = [{ id: "inv-1", email: "new-teammate@studio.com", token: "tok-inv-1", expires_at: "2026-10-02T10:00:00Z", created_at: NOW }];
const SHARED_DOC = { title: UPDATE_ROW.title, client_name: UPDATE_ROW.client_name, status: "draft", body: UPDATE_ROW.body, updated_at: NOW };
const SHARED_INVOICE = { invoice_number: 7, title: INVOICE.title, client_name: INVOICE.client_name, status: INVOICE.status, items: INV_ITEMS, tax_percent: 20, notes: INVOICE.notes, due_date: INVOICE.due_date, sent_at: NOW, paid_at: null, workspace_name: WS.name };
const INVITE_PREVIEW = { workspace_name: WS.name, email: "new-teammate@studio.com", expires_at: "2026-10-02T10:00:00Z" };

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString("base64url"); }
function jwt(sub) { return [b64url({ alg: "HS256", typ: "JWT" }), b64url({ sub, aud: "authenticated", exp: 2000000000, iat: 1750000000 }), "stub"].join("."); }

function subFrom(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers["authorization"] ?? "");
  if (m) { try { return JSON.parse(Buffer.from(m[1].split(".")[1], "base64url").toString()).sub ?? null; } catch { return null; } }
  const cm = /sb-127-auth-token=([^;]+)/.exec(String(req.headers["cookie"] ?? ""));
  if (!cm) return null;
  try { const s = JSON.parse(Buffer.from(decodeURIComponent(cm[1]).replace(/^base64-/, ""), "base64url").toString()); return JSON.parse(Buffer.from(s.access_token.split(".")[1], "base64url").toString()).sub ?? null; } catch { return null; }
}

function startStub() {
  return new Promise((resolveServer, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${STUB_PORT}`);
      const p = url.pathname;
      const sub = subFrom(req);
      const wantsObject = String(req.headers["accept"] ?? "").includes("vnd.pgrst.object");
      const one = (row) => (wantsObject && row ? row : row ? [row] : []);
      const send = (body) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      const eq = (k) => { const v = url.searchParams.get(k) ?? ""; return v.startsWith("eq.") ? v.slice(3) : null; };

      if (p === "/auth/v1/user") {
        const u = USERS[sub];
        return send({ id: sub, email: `${sub}@example.com`, user_metadata: { full_name: u?.full_name ?? "Sam Member" }, app_metadata: { provider: "email", providers: ["email"] }, aud: "authenticated", created_at: NOW, updated_at: NOW });
      }
      if (p.startsWith("/rest/v1/rpc/get_workspace_members")) return send(ROSTER);
      if (p.startsWith("/rest/v1/rpc/get_team_invite_preview")) return send([INVITE_PREVIEW]);
      if (p.startsWith("/rest/v1/rpc/get_shared_document")) return send([SHARED_DOC]);
      if (p.startsWith("/rest/v1/rpc/get_shared_invoice")) return send([SHARED_INVOICE]);
      if (p.startsWith("/rest/v1/workspace_members")) return send([{ workspace_id: WS.id, role: "owner", workspace: WS }]);
      if (p.startsWith("/rest/v1/profiles")) return send(one({ id: sub, full_name: USERS[sub]?.full_name ?? "Sam Member", avatar_initials: "MC", active_workspace_id: WS.id }));
      if (p.startsWith("/rest/v1/team_invites")) return send(INVITES);
      if (p.startsWith("/rest/v1/templates")) return send(TEMPLATES);
      if (p.startsWith("/rest/v1/brief_sources")) return send([]);
      if (p.startsWith("/rest/v1/brief_questions")) return send([]);
      if (p.startsWith("/rest/v1/brief_edit_history")) return send([]);
      if (p.startsWith("/rest/v1/briefs")) {
        if (eq("id")) return send(one(BRIEF_DETAIL));
        const rows = [{ id: U.brief, title: BRIEF_ROW.title, client_name: BRIEF_ROW.client_name, status: BRIEF_ROW.status, updated_at: NOW, questions: [{ status: "open" }, { status: "resolved" }] }];
        return send(rows);
      }
      if (p.startsWith("/rest/v1/proposals")) return send(eq("id") ? one(PROPOSAL) : [{ id: PROPOSAL.id, title: PROPOSAL.title, client_name: PROPOSAL.client_name, status: PROPOSAL.status, updated_at: NOW, deliverables: PROPOSAL.deliverables }]);
      if (p.startsWith("/rest/v1/plans")) return send(eq("id") ? one(PLAN) : [{ id: PLAN.id, title: PLAN.title, client_name: PLAN.client_name, status: PLAN.status, updated_at: NOW, tasks: PLAN.tasks }]);
      if (p.startsWith("/rest/v1/updates")) return send(eq("id") ? one(UPDATE_ROW) : [{ id: UPDATE_ROW.id, title: UPDATE_ROW.title, client_name: UPDATE_ROW.client_name, status: UPDATE_ROW.status, updated_at: NOW, body: UPDATE_ROW.body }]);
      if (p.startsWith("/rest/v1/invoice_links")) return send(eq("id") || eq("invoice_id") ? one(INVOICE_LINK) : [INVOICE_LINK]);
      if (p.startsWith("/rest/v1/invoices")) return send(eq("id") ? one(INVOICE) : [{ id: INVOICE.id, invoice_number: 7, title: INVOICE.title, client_name: INVOICE.client_name, status: INVOICE.status, items: INVOICE.items, tax_percent: 20, due_date: INVOICE.due_date, updated_at: NOW }]);
      if (p.startsWith("/rest/v1/contracts")) return send(eq("id") ? one(CONTRACT) : [{ id: CONTRACT.id, title: CONTRACT.title, client_name: CONTRACT.client_name, status: CONTRACT.status, brief_id: CONTRACT.brief_id, expires_on: CONTRACT.expires_on, updated_at: NOW }]);
      if (p.startsWith("/rest/v1/time_entries")) return send(TIME_ENTRIES);
      if (p.startsWith("/rest/v1/share_links")) return send([]);
      if (p.startsWith("/rest/v1/workspaces")) return send([WS]);
      send([]);
    });
    server.on("error", () => {
      freePort(STUB_PORT);
      setTimeout(() => server.listen(STUB_PORT, "127.0.0.1"), 800);
    });
    server.listen(STUB_PORT, "127.0.0.1", () => resolveServer(server));
  });
}
const cleanup = () => {
  freePort(STUB_PORT); freePort(APP_PORT);
};
process.on("SIGTERM", () => { cleanup(); process.exit(1); });
process.on("SIGINT", () => { cleanup(); process.exit(1); });
process.on("exit", cleanup);

// ───────────────────────── chromium bootstrap (npm-shipped binary) ──
async function ensureChromium() {
  const base = join(tmpdir(), "resp-audit");
  const exec = join(base, "chromium");
  const libDir = join(base, "al2023-lib", "lib");
  if (!existsSync(exec) || !existsSync(join(libDir, "libnss3.so"))) {
    mkdirSync(join(base, "al2023-lib"), { recursive: true });
    const binDir = join(ROOT, "node_modules", "@sparticuz", "chromium", "bin");
    writeFileSync(join(base, "chromium.z"), readFileSync(join(binDir, "chromium.br")));
    writeFileSync(join(base, "chromium.raw"), zlib.brotliDecompressSync(readFileSync(join(base, "chromium.z"))));
    rmSync(join(base, "chromium.z"));
    execFileSync("bash", ["-c", `cat '${join(base, "chromium.raw")}' | gzip -dc > '${exec}' 2>/dev/null || cp '${join(base, "chromium.raw")}' '${exec}'`]);
    writeFileSync(join(base, "al2023.tar"), zlib.brotliDecompressSync(readFileSync(join(binDir, "al2023.tar.br"))));
    execFileSync("tar", ["-xf", join(base, "al2023.tar"), "-C", join(base, "al2023-lib")]);
    execFileSync("chmod", ["+x", exec]);
  }
  return { exec, libDir };
}

// ───────────────────────── metrics ──
const METRICS_FN = () => {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const de = document.scrollingElement;
  const overflowX = de.scrollWidth - de.clientWidth;
  const all = [...document.querySelectorAll("body *")];
  const offenders = [];
  const cutoffs = [];
  const fixed = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    const cls = typeof el.className === "string" ? el.className : "";
    if (r.width === 0 || r.height === 0) continue;
    if (cls.includes("sr-only")) continue; // visually hidden by design
    const st = getComputedStyle(el);
    if (r.right > vw + 1 || r.left < -1) {
      let clipped = st.position === "fixed";
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ast = getComputedStyle(a);
        if (["hidden", "auto", "scroll", "clip"].includes(ast.overflowX) || ["hidden", "auto", "scroll", "clip"].includes(ast.overflow)) { clipped = true; break; }
      }
      if (!clipped) {
        offenders.push({ tag: el.tagName, cls: cls.slice(0, 70), left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || "").trim().slice(0, 36) });
      }
      continue;
    }
    if (st.position === "fixed") {
      fixed.push({ cls: cls.slice(0, 60), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), escapes: r.right > vw + 1 || r.left < -1 || r.bottom > vh + 24 || r.top < -1 });
    }
    if (st.overflowX === "hidden" && st.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 2 && (el.textContent || "").trim()) {
      cutoffs.push({ tag: el.tagName, cls: cls.slice(0, 60), text: (el.textContent || "").trim().slice(0, 36), sw: el.scrollWidth, cw: el.clientWidth });
    }
    if (offenders.length > 14) break;
  }
  const small = [];
  for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if ((typeof el.className === "string" ? el.className : "").includes("sr-only")) continue;
    if (el.getAttribute("role") === "checkbox" || el.type === "checkbox" || el.type === "radio") continue; // label row is the effective target
    if (r.width < 43.5 || r.height < 43.5) {
      small.push({ tag: el.tagName, w: Math.round(r.width), h: Math.round(r.height), label: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 28) });
      if (small.length > 15) break;
    }
  }
  return { vw, vh, overflowX, offenders, cutoffs: cutoffs.slice(0, 8), fixed, small };
};

// ───────────────────────── main ──
async function main() {
  if (process.env.FRESH_SHOTS === "1") rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  const stub = await startStub();
  const { exec, libDir } = await ensureChromium();
  const app = spawn(process.execPath, [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(APP_PORT)], {
    env: { ...process.env, HOST: "stub-project.supabase.co", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub-anon-key", AUTH_SECRET: "stub-auth-secret" },
    stdio: ["pipe", "pipe", "pipe"],
    cwd: ROOT,
    detached: true,
  });
  let appLog = "";
  const alive = () => new Promise((res) => {
    const rq = http.get(`${BASE}/`, (rs) => { rs.resume(); res(true); });
    rq.on("error", () => res(false));
    rq.setTimeout(4000, () => { rq.destroy(); res(false); });
  });
  const readAppLog = () => { try { return readFileSync(join(SHOTS, "app.log"), "utf8"); } catch { return ""; } };
  // Run `next dev` as a detached daemon (nohup + stdio ignore), matching the
  // manual-run conditions that proved stable. The managed-child form kept
  // exiting gracefully (code 0) mid-run under automation.
  const startApp = () => {
    freePort(APP_PORT);
    const child = spawn("bash", ["-c", `NEXT_DIST_DIR="${DIST}" nohup ${process.execPath} '${join(ROOT, "node_modules", "next", "dist", "bin", "next")}' start -p ${APP_PORT} > '${join(SHOTS, "app.log")}' 2>&1 &`], { stdio: "ignore", detached: true });
    child.unref?.();
    return child;
  };
  // Production server: `next dev` kept gracefully self-exiting under
  // automation. `next build` + `next start` renders the same app, fast and
  // stable. NEXT_PUBLIC_* is inlined at build time against the stub.
  const DIST = process.env.NEXT_DIST_DIR ?? "resp-next";
  rmSync(join(ROOT, DIST), { recursive: true, force: true });
  const APP_ENV = { ...process.env, NEXT_DIST_DIR: DIST, HOST: "stub-project.supabase.co", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub-anon-key", AUTH_SECRET: "stub-auth-secret" };
  if (!(process.env.SKIP_BUILD === "1" && existsSync(join(ROOT, DIST, "routes-manifest.json")))) await new Promise((res, rej) => {
    // Non-blocking: the stub must keep serving during build-time prerender.
    const b = spawn(process.execPath, [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "build"], { env: APP_ENV, stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
    let out = "";
    b.stdout.on("data", (c) => (out += c));
    b.stderr.on("data", (c) => (out += c));
    b.on("exit", (c) => {
      try { writeFileSync(join(SHOTS, "build.log"), out); } catch {}
      if (c === 0 && existsSync(join(ROOT, DIST, "routes-manifest.json"))) res();
      else rej(new Error("next build failed code=" + c + "\n" + out.slice(-1500)));
    });
    b.stdin?.on("error", () => {});
  });
  let appRef = startApp();
  let readySeen = false;
  const appReady = await new Promise((r) => {
    let n = 0;
    const t = setInterval(() => {
      n++;
      appLog = readAppLog();
      if (/Ready in/.test(appLog)) {
        alive().then((up) => { if (up) { readySeen = true; clearInterval(t); r(true); } });
      }
      if (n > 55) { clearInterval(t); r(false); }
    }, 1000);
  });
  if (!appReady) {
    console.error("APP FAILED TO START. Log tail:\n" + readAppLog().slice(-1200));
    freePort(APP_PORT);
    stub.close();
    process.exit(2);
  }
  let respawns = 0, downStreak = 0;
  const watchdog = setInterval(async () => {
    if (!readySeen) return;
    if (await alive()) { downStreak = 0; return; }
    downStreak++;
    if (downStreak >= 2 && respawns < 8) {
      respawns++; downStreak = 0;
      try { writeFileSync(join(SHOTS, "app-exit.txt"), `respawn #${respawns}\n` + readAppLog().slice(-1500)); } catch {}
      appRef = startApp();
      for (let i = 0; i < 25 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 1000));
    }
  }, 4000);
  globalThis.__watchdog = watchdog;

  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({
    executablePath: exec,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    env: { ...process.env, LD_LIBRARY_PATH: libDir },
  });

  const results = [];
  let failures = 0;
  const logStream = createWriteStream(join(SHOTS, "run.log"), { flags: "w" });
  const say = (line) => { const t = new Date().toISOString().slice(11, 19); console.log(t + " " + line); try { logStream.write(t + " " + line + "\n"); } catch {} };
  const authCookie = {
    name: "sb-127-auth-token",
    value: `base64-${b64url({ access_token: jwt("usr-a"), token_type: "bearer", expires_at: 2000000000, refresh_token: "r", user: { id: "usr-a", email: "maya@example.com" } })}`,
    domain: "127.0.0.1",
    path: "/",
  };

  for (const { w, h } of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addCookies([authCookie]);
    for (const pg of PAGES) {
      const page = await ctx.newPage();
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 120)));
      try {
        await page.goto(BASE + pg.url, { waitUntil: "load", timeout: 15000 });
        await page.waitForTimeout(350);
      } catch (e) {
        // App may have self-exited (dev-CLI quirk); wait for watchdog respawn once.
        for (let i = 0; i < 20 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 1000));
        try {
          await page.goto(BASE + pg.url, { waitUntil: "load", timeout: 15000 });
          await page.waitForTimeout(350);
        } catch (e2) {
          pageErrors.push("nav:" + String(e2).slice(0, 100));
        }
      }
      let m = null;
      try { m = await page.evaluate(METRICS_FN); } catch (e) { pageErrors.push("eval:" + String(e).slice(0, 80)); }
      const shot = (dir, name) => page.screenshot({ path: join(SHOTS, dir, String(w), `${name}.png`), fullPage: COMPLEX.has(pg.slug) && (w === 320 || w === 768) }).catch(() => {});
      if (w === 320 || w === 768) { mkdirSync(join(SHOTS, "pages", String(w)), { recursive: true }); await shot("pages", pg.slug); }
      if (COMPLEX.has(pg.slug)) { mkdirSync(join(SHOTS, "complex", String(w)), { recursive: true }); await shot("complex", pg.slug); }

      const bad = !m || (m.overflowX > 0 || m.offenders.length > 0 || m.cutoffs.length > 0 || m.fixed.some((f) => f.escapes));
      const tapGate = !!m && m.small.length > 0;
      if (bad || tapGate || pageErrors.length) failures += 1;
      results.push({ page: pg.slug, width: w, overflowX: m?.overflowX ?? -1, offenders: m?.offenders ?? [], cutoffs: m?.cutoffs ?? [], fixedEscapes: (m?.fixed ?? []).filter((f) => f.escapes), smallTaps: m?.small ?? [], pageErrors });
      const flag = pageErrors.length ? "✗E" : bad ? "✗" : tapGate ? "△" : "✓";
      say(`${flag} ${String(w).padStart(4)} ${pg.slug.padEnd(18)} overflowX=${m?.overflowX ?? "?"} off=${m?.offenders.length ?? "?"} cut=${m?.cutoffs.length ?? "?"} tap<44=${m?.small.length ?? "?"}${pageErrors.length ? ` ERR:${pageErrors[0]}` : ""}`);
    }
    await ctx.close();
  }

  // dialog probe at 320 + 768: open TemplateDialog on /settings and measure
  for (const w of (RUN_DIALOG ? [320, 768] : [])) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w === 320 ? 568 : 1024 } });
    await ctx.addCookies([authCookie]);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/settings`, { waitUntil: "load", timeout: 15000 });
      const trigger = page.locator('button:has-text("template")').first();
      await trigger.click({ timeout: 5000 });
      await page.waitForTimeout(400);
      const dm = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return null;
        const r = d.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        return {
          left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height),
          fitsWidth: r.left >= -1 && r.right <= vw + 1,
          fitsHeight: r.top >= -1 && r.bottom <= vh + 1,
          scrolls: getComputedStyle(d).overflowY === "auto" || getComputedStyle(d).overflowY === "scroll" || d.scrollHeight > d.clientHeight,
          innerScroll: d.scrollHeight > d.clientHeight,
        };
      });
      mkdirSync(join(SHOTS, "dialog", String(w)), { recursive: true });
      await page.screenshot({ path: join(SHOTS, "dialog", String(w), "template-dialog.png") });
      results.push({ page: "dialog-template", width: w, dialog: dm });
      const ok = !!dm && dm.fitsWidth && (dm.fitsHeight || dm.scrolls);
      if (!ok) failures++;
      say(`${ok ? "✓" : "✗"} ${String(w).padStart(4)} dialog-template        fitsW=${dm?.fitsWidth} fitsH=${dm?.fitsHeight} innerScroll=${dm?.innerScroll} rect=${dm ? `${dm.w}x${dm.h}@${dm.left},${dm.top}` : "null"}`);
    } catch (e) {
      failures++;
      results.push({ page: "dialog-template", width: w, dialog: null, error: String(e).slice(0, 120) });
      say(`✗ ${String(w).padStart(4)} dialog-template        trigger/measurement failed: ${String(e).slice(0, 80)}`);
    }
    await ctx.close();
  }

  // ── interaction-state probes (RUN_INTERACT=1): drive the timer pill, its
  // stop form, a select popover, and the inline destructive confirm at 320+768.
  if (process.env.RUN_INTERACT === "1") {
    for (const w of [320, 768]) {
      const vh2 = w === 320 ? 568 : 1024;
      const ctx = await browser.newContext({ viewport: { width: w, height: vh2 } });
      await ctx.addCookies([authCookie]);
      const page = await ctx.newPage();
      const dir = join(SHOTS, "interact", String(w));
      mkdirSync(dir, { recursive: true });
      const extra = () => page.evaluate(() => {
        const vw = document.documentElement.clientWidth; const vh = window.innerHeight;
        const fixed = [];
        for (const el of document.querySelectorAll("body *")) {
          if (getComputedStyle(el).position !== "fixed") continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2) continue;
          fixed.push({ cls: (typeof el.className === "string" ? el.className : "").slice(0, 56), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), escapes: r.right > vw + 1 || r.left < -1 || r.bottom > vh + 24 || r.top < -1 });
        }
        const pop = document.querySelector('[role="listbox"]');
        let listbox = null;
        if (pop) {
          const r = pop.getBoundingClientRect();
          listbox = { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), fitsW: r.left >= -1 && r.right <= vw + 1, fitsH: r.top >= -1 && r.bottom <= vh + 1, innerScroll: pop.scrollHeight > pop.clientHeight };
        }
        return { fixed, listbox };
      });
      const record = async (name, ok, m) => {
        await page.screenshot({ path: join(dir, `${name}.png`) }).catch(() => {});
        results.push({ page: `interact-${name}`, width: w, smallTaps: m?.small ?? [], overflowX: m?.overflowX ?? -1, ...(await extra()) });
        say(`${ok ? "✓" : "✗"} ${String(w).padStart(4)} interact-${name.padEnd(14)}`);
        if (!ok) failures++;
      };

      try {
        // A) timer: idle -> running pill -> stop form -> cancel -> discard
        await page.goto(`${BASE}/time`, { waitUntil: "load", timeout: 20000 });
        await page.waitForTimeout(300);
        await page.click('button:has-text("Start timer")', { timeout: 8000 });
        await page.waitForTimeout(300);
        let m = await page.evaluate(METRICS_FN);
        let x = await extra();
        let ok = !x.fixed.some((f) => f.escapes) && m.overflowX === 0 && m.small.length === 0;
        await record("timer-running", ok, m);

        await page.click('button:has-text("Stop")', { timeout: 8000 });
        await page.waitForTimeout(300);
        m = await page.evaluate(METRICS_FN);
        x = await extra();
        ok = !x.fixed.some((f) => f.escapes) && m.overflowX === 0 && m.small.length === 0;
        await record("timer-stop-form", ok, m);

        const cancel = page.locator('button:has-text("Cancel")').first();
        if (await cancel.count()) await cancel.click().catch(() => {});
        await page.waitForTimeout(200);
        const disc = page.locator('button[aria-label="Discard this session"]').first();
        if (await disc.count()) await disc.click().catch(() => {});

        // B) select popover on brief detail
        await page.goto(`${BASE}/briefs/${U.brief}`, { waitUntil: "load", timeout: 20000 });
        await page.waitForTimeout(300);
        await page.click('button[role="combobox"]', { timeout: 8000 });
        await page.waitForTimeout(300);
        m = await page.evaluate(METRICS_FN);
        x = await extra();
        ok = !!x.listbox && x.listbox.fitsW && (x.listbox.fitsH || x.listbox.innerScroll) && m.small.length === 0;
        await record("select-open", ok, m);
        await page.keyboard.press("Escape");

        // C) inline destructive confirm on /settings
        await page.goto(`${BASE}/settings`, { waitUntil: "load", timeout: 20000 });
        await page.waitForTimeout(300);
        await page.click('button[aria-label="Remove Leo Fox"]', { timeout: 8000 });
        await page.waitForTimeout(250);
        m = await page.evaluate(METRICS_FN);
        x = await extra();
        ok = m.overflowX === 0 && m.small.length === 0 && m.offenders.length === 0;
        await record("team-confirm", ok, m);
        const no = page.locator('button:has-text("Cancel")').first();
        if (await no.count()) await no.click().catch(() => {});
      } catch (e) {
        failures++;
        say(`✗ ${String(w).padStart(4)} interact-error          ${String(e).slice(0, 70)}`);
        results.push({ page: "interact-error", width: w, error: String(e).slice(0, 140) });
      }
      await ctx.close();
    }
  }

  writeFileSync(join(SHOTS, `summary${SUM_SUFFIX}.json`), JSON.stringify({ mode: MODE, results }, null, 2));
  await browser.close();
  freePort(APP_PORT);
  stub.close();
  say(failures === 0 ? `\nresponsive audit passed ✔  (evidence: ${SHOTS})` : `\n${failures} page×width finding(s) — see ${SHOTS}/summary.json`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
