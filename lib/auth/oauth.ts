/**
 * Google SSO (future-list item "SSO" — the global-product auth gap).
 *
 * The app side is deliberately thin: Supabase Auth owns the OAuth
 * handshake (the operator enables the Google provider in the Supabase
 * dashboard), so the only runtime path is `signInWithOAuth({ provider:
 * "google" })`. This module exists so that exact call shape is
 * unit-testable (tests/lib/oauth.test.ts) and so a future extra provider
 * (Microsoft, Okta) has one seam to extend instead of per-page logic.
 *
 * Zero app-side env vars: the browser client already knows the project
 * URL, and `redirectTo` is the page's own origin + landing path, so the
 * flow works on whatever host serves the app (preview or production)
 * without configuration. On return, the browser client's session
 * detection picks the session up from the URL automatically.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Start the Google OAuth flow. `redirectTo` must be an absolute URL on
 *  the app's own origin (the caller composes it from
 *  `window.location.origin` + a same-site landing path). */
export async function signInWithGoogle(
  supabase: SupabaseClient,
  redirectTo: string
) {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}
