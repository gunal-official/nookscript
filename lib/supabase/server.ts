import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Supabase client for Server Components, Server Actions, and Route
 * Handlers. Reads the user session from request cookies. For client
 * components, import from "@/lib/supabase/client" instead.
 *
 * NOTE (Next 15+/16 forward-compat): `cookies()` becomes Promise-based in
 * Next 15. This function is `async` and awaits it already, so the signature
 * works identically on Next 14 (awaiting a sync value is a no-op) and
 * keeps working unchanged after any future major upgrade. Every call site
 * must therefore `await createClient()`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, which cannot write cookies.
            // Safe to ignore: middleware refreshes the session cookie.
          }
        },
      },
    }
  );
}
