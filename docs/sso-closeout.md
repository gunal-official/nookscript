# SSO closeout — Google sign-in (2026-09-26)

**Scope:** the future-list item "SSO" — the global product's sign-in gap.
Email/password stays the default path; "Continue with Google" joins it on
/auth pages for SSO sign-in. Deliberately thin: **Supabase Auth owns the
OAuth handshake**, so the app ships one call, zero new app env vars, and no
new routes.

## 1. What's in the app now

- **`/login` and `/signup`** — "Continue with Google" button (outline
  variant, 44px, `Chrome` icon 16px stroke 1.5 decorative per
  `docs/icon-audit.md` rules, `aria-label="Continue with Google"`) above
  an "or continue with email" divider; the email form is unchanged.
- **`lib/auth/oauth.ts`** — `signInWithGoogle(supabase, redirectTo)` =
  `auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`.
  Exists so the exact call shape is unit-tested and a future second
  provider (Microsoft, Okta) has one seam instead of per-page logic.
- **`components/auth/GoogleSignInButton.tsx`** — the client island:
  starts the flow with `redirectTo = window.location.origin + next`
  (`next` = the already-guarded same-site landing path, so a
  `?next=/...` deep link is preserved across the round trip; /signup
  returns to `/` and lets middleware route by workspace state —
  /onboarding or /intake). On success the browser leaves for Google and
  returns to the app's own origin; the browser client's session
  detection restores the session automatically — no callback route
  needed. If the flow can't start (provider not enabled on the project),
  the button shows an inline error instead of failing silently.

## 2. Operator setup (once — Supabase dashboard, NO app env vars)

1. **Authentication → Providers → Google**: enable; paste the OAuth
   Client ID/Secret from a Google Cloud OAuth client (type: Web
   application).
2. In that Google OAuth client, add the app's origin
   (`https://<your-domain>`) to authorized redirect URIs — Supabase
   appends `/auth/v1/callback` itself.
3. **SAML / OIDC SSO (Okta, Microsoft Entra, …)**: no app code at all —
   Authentication → SSO in the same dashboard.
4. Invitee note: an invitee who signs in with Google keeps their invite
   token in the invite link (re-open it after sign-in) — nothing is
   lost; same documented behavior as the email flow.

## 3. Verification

- `npx tsc --noEmit` · `npm run lint` · `npm test` (135/135 — incl.
  `tests/lib/oauth.test.ts`: exact call shape, success pass-through,
  error pass-through) · `npm run build`.
- `npm run verify:responsive` full sweep — `/login` + `/signup` at all
  seven widths pick the new button up in the standing overflow /
  cut / small-tap / motion checks.
- The live OAuth round trip (Google consent → return → session) requires
  a browser that can reach `accounts.google.com` and a project with the
  provider enabled — operator-side, by design.

## 4. Known limitations / decisions

- One provider (Google) in the UI for now; the seam (`lib/auth/oauth.ts`)
  is what a Microsoft button would extend — no page changes.
- No app-side redirect allowlist beyond the existing same-site `?next=`
  guard (open-redirect safe: same-site absolute paths only, never
  `//host`).
- The button is disabled whenever Supabase itself is unconfigured
  (`isSupabaseConfigured()`), matching the email forms' behavior.
