# Security

## Known vulnerabilities (npm audit) — deferred by decision

**Status as of 2026-09-23:** `npm audit` reports **5 vulnerabilities (4 high, 1 critical)**, all inside the Next.js dependency tree:

- **`next` (critical + high)** — 21 published advisories apply to the pinned line (14.2.x): HTTP request smuggling in rewrites; unbounded `next/image` disk-cache growth; Server Components DoS (×2); Middleware/Proxy redirect cache-poisoning; CSP-nonce XSS in App Router; RSC cache-busting cache poisoning; `beforeInteractive` XSS; Image Optimization DoS; WebSocket-upgrade SSRF; RSC response cache poisoning; Middleware/Proxy bypass in Pages-Router + i18n apps; Server Actions DoS; Server Actions SSRF on custom servers; response-body cache confusion (×2); unbounded Server Action payload in Edge runtime; rewrites SSRF via attacker-controlled hostname; unauthenticated disclosure of internal Server Function endpoints; **unauthenticated RCE on Windows-hosted servers**; unauthenticated RCE in Image Optimization with AVIF files.
- **`postcss <=8.5.22` (high)** — nested under `next`: XSS via unescaped `</style>` in stringify output, and attacker-controlled `sourceMappingURL` arbitrary-file-read/disclosure (3 advisories).

`npm audit fix --force` resolves these by installing **next@16.3.6** — a breaking change.

### Why this is deferred (not an oversight)

Closing these requires a **coordinated 3-package major bump**, not a drop-in fix:

1. `next` 14 → 16 — includes the Promise-based `cookies()` / `params` / `searchParams` API changes (every Server Component and page touching `next/headers` or dynamic route params is affected), plus the `middleware` → `proxy` file-convention change.
2. `eslint` 8 → 9 — **required because** `eslint-config-next@16` demands `eslint>=9`.
3. `eslint-config-next` 14 → 16 — same coercion; and ESLint 9 removes the legacy `.eslintrc` format, forcing a migration to **flat config** (`eslint.config.mjs`).

A 14→16 upgrade was attempted and deliberately **rolled back** when this cascade became clear — shipping a verified working product beats an untestable half-upgrade. This is a conscious risk-acceptance decision, documented here so it doesn't need to be re-litigated per audit run.

### What is already done

- `lib/supabase/server.ts`'s `createClient()` was proactively converted to the **Next 15+ async `cookies()` pattern in commit `95bb87d`** (behavior-identical on Next 14), so that entire call-site migration (37 sites) is pre-done and out of the way.
- The route surface is fully built and gated (`npm run verify:db` 66→69 checks, `npm run verify:live` for live-schema drift), so a future upgrade has a strong regression floor to run against.

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
