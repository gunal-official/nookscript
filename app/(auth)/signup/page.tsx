"use client";

import Link from "next/link";
import { useState } from "react";

import { createWorkspaceAction } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/AuthCard";
import { ConfigNotice } from "@/components/auth/ConfigNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Single-step signup: creates the auth user → the profiles row is created by
 * the on_auth_user_created trigger → the workspace + owner membership are
 * created by the createWorkspaceAction server action (via SECURITY DEFINER
 * RPC), all in one submit.
 *
 * If the Supabase project has email confirmation ON, signUp returns no
 * session; we then show a "confirm your email" notice and the workspace is
 * collected on first login via /onboarding instead.
 */
export default function SignupPage() {
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
    //    confirm-then-onboard flow.
    if (!data.session || !data.user) {
      setPending(false);
      setNotice(
        "Account created — check your email to confirm it, then log in. You’ll name your workspace on the way in."
      );
      return;
    }

    // 3. Session exists (email confirmation OFF) → create the workspace +
    //    membership server-side, then the action redirects to /intake.
    const result = await createWorkspaceAction({
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
      title="Create your workspace"
      subtitle="One account for you, one workspace for your work."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {!configured && <ConfigNotice />}

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

        {error && <p className="text-sm text-error">{error}</p>}

        <Button
          type="submit"
          className="w-full"
          disabled={pending || !configured}
        >
          {pending ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </AuthCard>
  );
}
