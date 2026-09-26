/** Shown on auth pages when NEXT_PUBLIC_SUPABASE_* env vars are missing. */
export function ConfigNotice() {
  return (
    <div className="mb-4 rounded-md border border-border bg-muted px-3 py-2.5 text-sm text-text">
      <p className="font-medium">Supabase isn’t configured yet</p>
      <p className="mt-0.5 text-muted-foreground">
        Copy <code className="text-text">.env.local.example</code> to{" "}
        <code className="text-text">.env.local</code>, add your project URL
        and anon key, then restart the dev server.
      </p>
    </div>
  );
}
