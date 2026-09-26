import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { hasTokenKey } from "@/lib/email/crypto";
import {
  gmailAuthUrl,
  outlookAuthUrl,
  providerEnv,
} from "@/lib/email/oauth";
import { buildOAuthState } from "@/lib/email/state";
import { createClient } from "@/lib/supabase/server";

/**
 * Mailbox connect — step 1 of 2 (future-list item "Gmail/Outlook").
 * Owner clicks "Connect Gmail/Outlook" (an <a> to this route) → 302 to
 * the provider's consent screen with a SIGNED state claim
 * (user + workspace + provider — see lib/email/state). Step 2 is
 * /api/email/callback.
 *
 * All missing-env cases redirect to /settings with ?email=error=… — the
 * EmailNotice island toasts the actionable reason (no dead ends).
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") === "outlook" ? "outlook" : "gmail";
  const back = (kind: string) =>
    NextResponse.redirect(`${url.origin}/settings?email=error=${kind}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      `${url.origin}/login?next=${encodeURIComponent("/settings")}`
    );
  }

  const context = await getWorkspaceContext();
  if (!context || context.role !== "owner") return back("forbidden");

  const env = providerEnv(provider);
  if (!env) return back("not_configured");
  if (!hasTokenKey(process.env.EMAIL_TOKEN_ENCRYPTION_KEY)) {
    return back("token_key");
  }
  // The callback persists the account through the service client.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return back("service");

  const state = buildOAuthState(user.id, context.id, provider);
  if (!state) return back("state");

  const redirectUri = `${url.origin}/api/email/callback`;
  const target =
    provider === "gmail"
      ? gmailAuthUrl(env.clientId, redirectUri, state)
      : outlookAuthUrl(env.clientId, env.tenant ?? "common", redirectUri, state);

  return NextResponse.redirect(target);
}
