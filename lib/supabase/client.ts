import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (client components only). Persists the session in
 * cookies so Next.js server code (middleware, RSC, actions) can read it.
 * For server-side use, import from "@/lib/supabase/server" instead.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see .env.local.example)."
    );
  }

  return createBrowserClient(url, key);
}
