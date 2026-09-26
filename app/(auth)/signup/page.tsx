"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { createWorkspaceAction } from "@/app/(auth)/actions";
import { acceptTeamInviteAction } from "@/app/invite/actions";
import { AuthCard } from "@/components/auth/AuthCard";
import { ConfigNotice } from "@/components/auth/ConfigNotice";
import { GoogleSignInButton, OAuthDivider } from "@/components/auth/GoogleSignInButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isUuid } from "@/lib/utils";

/**
 * Single-step signup, with an invite-aware variant (Step 15):
 *
 * Default: creates the auth user → profiles row via trigger → workspace +
 * owner membership via createWorkspaceAction, all in one submit.
 *
 * ?invite=<token>: the user is joining an EXISTING workspace — the
 * workspace-name field disappears and success calls
 * acceptTeamInviteAction instead of createWorkspaceAction, so invitees
 * never end up owning a fresh empty workspace.
 *
 * If the Supabase project has email confirmation ON, signUp returns no
 * session; we then show a "confirm your email" notice. Default flow
 * collects the workspace name on first login via /onboarding; the invite
 * flow asks the user to re-open the invite link after logging in (the
 * token lives in the link, so nothing is lost).
 */
function SignupForm() {
  const searchParams = useSearchParams();
  const inviteParam = searchParams.get("invite");
  const inviteToken = inviteParam && isUuid(inviteParam) ? inviteParam : null;

  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) return;

    setError(null);
    setNotice(null);
    setPending(true);

    const supabase = createClient();

    // 1. Create the auth user (profiles row is created by the DB trigger,
    //    which also derives avatar_initials from full_name).
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setPending(false);
      return;
    }

    // 2. Email confirmation enabled → no session yet. Fall back to the
    //    confirm-then-onboard flow (or re-open-the-invite-link flow).
    if (!data.session || !data.user) {
      setPending(false);
      setNotice(
        inviteToken
          ? "Account created — check your email to confirm it, then log in and re-open your invite link to join the workspace."
          : "Account created — check your email to confirm it, then log in. You’ll name your workspace on the way in."
      );
      return;
    }

    // 3. Session exists (email confirmation OFF) → join the inviting
    //    workspace, or create a new one, server-side. Both actions
    //    redirect to /intake on success.
    const result = inviteToken
      ? await acceptTeamInviteAction({ token: inviteToken })
      : await createWorkspaceAction({
          workspaceName,
          userId: data.user.id,
        });

    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
    // On success the server action redirects; nothing else to do.
  }

  if (notice) {
    return (
      <AuthCard title="Check your email">
        <div className="space-y-4">
          <Badge variant="secondary">One more step</Badge>
          <p className="text-sm text-muted-foreground">{notice}</p>
          <Button asChild className="w-full" variant="secondary">
            <Link href="/login">Go to login</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={inviteToken ? "Join your team" : "Create your workspace"}
      subtitle={
        inviteToken
          ? "Create your account to accept the workspace invite."
          : "One account for you, one workspace for your work."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={
              inviteToken ? `/login?next=/invite/${inviteToken}` : "/login"
            }
            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-accent hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      {!configured && <ConfigNotice />}

      <div className="mb-6">
        {/* Returns to "/" on purpose: after a fresh Google sign-in the
            middleware routes by workspace state (/onboarding or
            /intake). Invitees keep their token in the invite link. */}
        <GoogleSignInButton />
        <div className="mt-4">
          <OAuthDivider />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="full-name" className="text-sm font-medium text-text">
            Full name
          </label>
          <Input
            id="full-name"
            type="text"
            required
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-text">
            Email
          </label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@studio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {inviteToken && (
            <p className="text-xs text-muted-foreground">
              Use the address the invite was sent to — the accept step
              checks it.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-text">
            Password
          </label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="6+ characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {!inviteToken && (
          <div className="space-y-1.5">
            <label
              htmlFor="workspace-name"
              className="text-sm font-medium text-text"
            >
              Workspace name
            </label>
            <Input
              id="workspace-name"
              type="text"
              required
              maxLength={80}
              placeholder="Acme Studio"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-sm text-error">{error}</p>}

        <Button
          type="submit"
          className="w-full"
          disabled={pending || !configured}
        >
          {pending
            ? inviteToken
              ? "Joining…"
              : "Creating…"
            : inviteToken
              ? "Create account & join"
              : "Create workspace"}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
