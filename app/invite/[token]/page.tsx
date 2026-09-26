import Link from "next/link";

import { AuthCard } from "@/components/auth/AuthCard";
import { ConfigNotice } from "@/components/auth/ConfigNotice";
import { InviteAcceptPanel } from "@/components/invite/InviteAcceptPanel";
import { getTeamInvitePreview } from "@/lib/data/team";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

/**
 * Public invite landing (Step 15). Deliberately OUTSIDE the (app) route
 * group and the middleware's protected prefixes — anyone holding the link
 * can open it, exactly like /share/:token. Three states:
 *   dead link   → "Invite unavailable" (invalid/revoked/accepted/expired
 *                 are indistinguishable by design)
 *   logged out  → create-account / log-in links that carry the token
 *   logged in   → Join button; every guard is applied server-side by the
 *                 accept RPC, so the target email is never exposed here
 */

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
    const configured = isSupabaseConfigured();
  const preview =
    configured && isUuid(token) ? await getTeamInvitePreview(token) : null;

  let loggedIn = false;
  let userEmail: string | null = null;
  if (preview) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    loggedIn = Boolean(user);
    userEmail = user?.email ?? null;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-12">
      {!configured ? (
        <AuthCard title="Team invite">
          <ConfigNotice />
        </AuthCard>
      ) : !preview ? (
        <AuthCard
          title="Invite unavailable"
          subtitle="This link was already accepted, revoked, or expired — or it never existed."
          footer={
            <Link href="/" className="inline-flex min-h-11 min-w-11 items-center text-accent hover:underline">
              Back to nookscript
            </Link>
          }
        >
          <p className="text-sm text-muted-foreground">
            Ask the workspace owner to send you a fresh invite link.
          </p>
        </AuthCard>
      ) : (
        <AuthCard
          title={`Join ${preview.workspace_name}`}
          subtitle="You've been invited to join this workspace as a member."
        >
          <InviteAcceptPanel
            token={token}
            loggedIn={loggedIn}
            userEmail={userEmail}
          />
        </AuthCard>
      )}
    </div>
  );
}
