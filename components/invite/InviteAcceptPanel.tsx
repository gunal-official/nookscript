"use client";

/**
 * The tail of /invite/:token after the preview confirms a live invite.
 * Logged-out visitors get links that carry the token through auth
 * (signup becomes invite-aware; login honors ?next=). Logged-in users
 * get the Join button. Email mismatches only surface AFTER an accept
 * attempt — the invited address is deliberately never shown pre-auth.
 */

import Link from "next/link";
import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

import { acceptTeamInviteAction } from "@/app/invite/actions";
import { Button } from "@/components/ui/button";

export function InviteAcceptPanel({
  token,
  loggedIn,
  userEmail,
}: {
  token: string;
  loggedIn: boolean;
  userEmail: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setPending(true);
    setError(null);
    const result = await acceptTeamInviteAction({ token });
    // On success the server action redirects to /intake.
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="space-y-3">
        <Button asChild className="w-full">
          <Link href={`/signup?invite=${token}`}>Create an account</Link>
        </Button>
        <Button asChild variant="secondary" className="w-full">
          <Link href={`/login?next=/invite/${token}`}>Log in to accept</Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          Use the email address the invite was sent to.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleAccept} disabled={pending} className="w-full">
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin"  aria-hidden="true" />
        ) : (
          <UserPlus className="mr-2 h-4 w-4"  aria-hidden="true" />
        )}
        {pending ? "Joining…" : "Join workspace"}
      </Button>
      {error && <p className="text-sm text-error">{error}</p>}
      {userEmail && (
        <p className="text-xs text-muted-foreground">
          You’re logged in as {userEmail}.
        </p>
      )}
    </div>
  );
}
