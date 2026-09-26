"use client";

import { useState } from "react";

import { Chrome } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/auth/oauth";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * "Continue with Google" (SSO item). Supabase Auth owns the OAuth
 * handshake — the operator enables the provider in the dashboard — so
 * this island only starts the flow and surfaces an actionable inline
 * error if it can't (e.g. the provider is not enabled on the project).
 * On success the browser leaves for Google and returns to the same
 * origin, where the browser client's session detection restores the
 * session automatically.
 *
 * `next` is the ALREADY-GUARDED same-site landing path (the caller owns
 * the open-redirect guard); the return URL keeps it so a deep-linked
 * user lands where they were headed.
 */
export function GoogleSignInButton({ next = "/" }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  async function handleClick() {
    if (!configured || pending) return;
    setError(null);
    setPending(true);

    const supabase = createClient();
    const { error: oauthError } = await signInWithGoogle(
      supabase,
      window.location.origin + next
    );

    if (oauthError) {
      setError("Google sign-in could not start — " + oauthError.message);
      setPending(false);
    }
    // On success the browser navigates away to Google — nothing to do
    // locally; the return lands back on this origin with a session.
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-error">{error}</p>}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending || !configured}
        onClick={handleClick}
        aria-label="Continue with Google"
      >
        {pending ? (
          "Redirecting to Google…"
        ) : (
          <>
            <Chrome size={16} strokeWidth={1.5} aria-hidden />
            Continue with Google
          </>
        )}
      </Button>
    </div>
  );
}

/** "or continue with email" divider between the SSO button and the
 *  email form. */
export function OAuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" aria-hidden />
      <span className="text-xs text-muted-foreground">
        or continue with email
      </span>
      <div className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}
