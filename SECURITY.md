# Security

## Production checklist (things code alone cannot fix)

Items wired **in code** (Step 14) live in the repo; the items below are the
human-side checklist that must be confirmed in dashboards before real
users touch this app.

**Rate limiting**
- ✅ In-code: `/share/*`, `/invite/*` and `/invoice/` (public routes that
  probe Postgres per request) share a 30 req/min per-IP cap via a
  sliding-window limiter (middleware). Store: the Step 14 **in-memory
  window, permanently** — the product decision is no third-party service
  dependencies (the once-optional Upstash Redis store was rejected and
  removed from the repo; `UPSTASH_*` is never set). Known limitation
  (accepted): in-memory state does NOT survive redeploys and is NOT
  shared across serverless instances — in a multi-instance deploy the
  effective ceiling multiplies by instance count. Treat it as
  casual-abuse mitigation; if a hard multi-instance ceiling is ever
  needed, enforce it at the edge (CDN/WAF) rather than adding a service.
- ⚠️ Login/signup abuse protection is **delegated entirely to Supabase**:
  those pages are client components whose auth calls go browser→Supabase
  Auth API directly, so this repo's middleware never sees them. Confirm
  the project's auth rate limits in the Supabase dashboard (**Project →
  Authentication → Rate Limits**). Do not "fix" this in middleware — it
  would be ineffective and misleading.
- ⚠️ README's local-setup step says to turn **Confirm email OFF** (single-
  step signup). That is a development convenience — reconsider enabling
  email confirmation before accepting real signups (bot-signup friction +
  deliverability sanity).
- [ ] **Backups**: confirm the Supabase project tier + backup settings in
  the dashboard (scheduled snapshots on free; PITR is a paid-tier option).
  Nothing in the repo can verify this. Decide a restore story for client
  data (`brief_sources`, share links) — these are client communications.
- [ ] **Observability**: Sentry only activates when `SENTRY_DSN` is set —
  the wiring ships inert by default, so set the env var in production or
  error tracking silently stays off. Wire source-map upload separately
  (Sentry wizard) if stack traces should be readable.
- [ ] **CI gate**: `.github/workflows/verify.yml` runs tsc + build +
  verify:db on every push — but `npm run verify:live` is **intentionally
  not automated** (it needs production credentials). Run it manually
  before every production deploy.

## Known vulnerabilities (npm audit) — deferred by decision

**Status as of 2026-09-25:** `npm audit` reports **2 vulnerable packages (1 high, 1 critical)**, all inside the Next.js dependency tree:

- **`next` (critical + high)** — 23 published advisories apply to the pinned line (14.2.x): HTTP request smuggling in rewrites; unbounded `next/image` disk-cache growth; Server Components DoS (×2); Middleware/Proxy redirect cache-poisoning; CSP-nonce XSS in App Router; RSC cache-busting cache poisoning; `beforeInteractive` XSS; Image Optimization DoS; WebSocket-upgrade SSRF; RSC response cache poisoning; Middleware/Proxy bypass in Pages-Router + i18n apps; Server Actions DoS; Server Actions SSRF on custom servers; response-body cache confusion (×2); unbounded Server Action payload in Edge runtime; rewrites SSRF via attacker-controlled hostname; unauthenticated disclosure of internal Server Function endpoints; **unauthenticated RCE on Windows-hosted servers**; unauthenticated RCE in Image Optimization with AVIF files; Image Optimizer `remotePatterns` DoS; insecure RSC request-deserialization DoS.
- **`postcss <=8.5.22` (high)** — nested under `next`: XSS via unescaped `</style>` in stringify output, and attacker-controlled `sourceMappingURL` arbitrary-file-read/disclosure (3 advisories).

`npm audit fix --force` resolves these by installing **next@16.3.6** — a breaking change. (Upgrading past 14.2.x is blocked by the standing freeze: Next.js stays at 14.2.35 until the user lifts it.)

### Why this is deferred (not an oversight)

Closing these requires a **coordinated 3-package major bump**, not a drop-in fix:

1. `next` 14 → 16 — includes the Promise-based `cookies()` / `params` / `searchParams` API changes (every Server Component and page touching `next/headers` or dynamic route params is affected), plus the `middleware` → `proxy` file-convention change.
2. `eslint` 8 → 9 — **required because** `eslint-config-next@16` demands `eslint>=9`.
3. `eslint-config-next` 14 → 16 — same coercion; and ESLint 9 removes the legacy `.eslintrc` format, forcing a migration to **flat config** (`eslint.config.mjs`).

A 14→16 upgrade was attempted and deliberately **rolled back** when this cascade became clear — shipping a verified working product beats an untestable half-upgrade. This is a conscious risk-acceptance decision, documented here so it doesn't need to be re-litigated per audit run.

### What is already done

- `lib/supabase/server.ts`'s `createClient()` was proactively converted to the **Next 15+ async `cookies()` pattern in commit `95bb87d`** (behavior-identical on Next 14), so that entire call-site migration (37 sites) is pre-done and out of the way.
- The route surface is fully built and gated (`npm run verify:db` 144
  checks / 19 migrations, `npm run verify:live` + `verify:live:policies`
  for live drift), so a future upgrade has a strong regression floor to
  run against.

### Recommendation

Treat the `next@16` + `eslint@9` upgrade as **its own scheduled project with a full manual regression pass** (auth flow, every `(app)` page, share-link public route, build + tsc + both verify gates) — not an emergency fix triggered by audit output.

### TODO for whoever picks this up

Before prioritizing, confirm which of the listed advisories actually apply to **this** deployment — several target surfaces we may not use:

- **Windows-hosted servers** (the critical RCE) — deployment target is likely Linux; confirm.
- **`next/image` remotePatterns/AVIF optimization** — this app serves no remote images today; confirm whether `images.remotePatterns` stays unused.
- **Pages Router + i18n middleware bypass** — this app is App Router only, no i18n config.
- **Custom servers** (Server Actions SSRF) — the app runs standard `next start`, no custom server.
- **Edge runtime** (unbounded action payload) — routes are Node.js runtime by default.
- **Rewrites SSRF** — no `next.config` rewrites exist today.

Any surface that *does* apply should be patched or mitigated independently of the full upgrade (e.g. proxy/WAF rules) if remediation can't wait.
