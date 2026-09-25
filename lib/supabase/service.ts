import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — BYPASSES RLS. Server-side only, used by
 * exactly ONE caller: the Stripe webhook route (app/api/stripe/webhook),
 * whose trust boundary is the verified `Stripe-Signature` (test-mode keys
 * only). Never import this from a page, component, or server action that
 * runs as a user — user paths use lib/supabase/server.
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
