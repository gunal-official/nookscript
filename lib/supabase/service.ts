import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — BYPASSES RLS. Server-side only; every
 * caller has its own trust boundary:
 *   1. the Stripe webhook route (app/api/stripe/webhook) — gated by the
 *      verified `Stripe-Signature` (test-mode keys only);
 *   2. the webhook retry sweep (app/api/cron/webhooks) — gated by
 *      `Authorization: Bearer <CRON_SECRET>`;
 *   3. the mailbox OAuth callback (app/api/email/callback) — gated by
 *      the signed state claim (lib/email/state);
 *   4. the mailbox server actions (app/(app)/settings/email-actions) —
 *      owner/editor-gated before the service write;
 *   5. the mailbox sync sweep (app/api/cron/email) — gated by
 *      `Authorization: Bearer <CRON_SECRET>`.
 * Never import this from a page, component, or server action that runs
 * as a user without first passing its user-facing authorization checks —
 * plain user reads use lib/supabase/server.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Billing webhooks need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set."
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
