"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createWorkspaceAction } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/AuthCard";
import { ConfigNotice } from "@/components/auth/ConfigNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Fallback workspace naming screen. Reached when a logged-in user has no
 * workspace — e.g. they signed up while email confirmation was ON (no
 * session at signup time, so workspace creation was deferred). The (app)
 * layout redirects here when no membership is found.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
      } else {
        setUserId(data.user.id);
      }
    });
  }, [configured, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    setError(null);
    setPending(true);

    const result = await createWorkspaceAction({ workspaceName, userId });

    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
    // On success the server action redirects to /intake.
  }

  return (
    <AuthCard
      title="Name your workspace"
      subtitle="One last thing before you’re in."
    >
      {!configured && <ConfigNotice />}

      <form onSubmit={handleSubmit} className="space-y-4">
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
          disabled={pending || !userId || !configured}
        >
          {pending ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </AuthCard>
  );
}
