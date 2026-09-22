/**
 * True when the Supabase env vars are present. Used to degrade gracefully
 * (clear UI notices + fail-closed middleware) instead of crashing when
 * .env.local hasn't been created yet.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
