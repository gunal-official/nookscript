import { NextResponse } from "next/server";

import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { hasTokenKey, tokenEncrypt } from "@/lib/email/crypto";
import {
  exchangeCode,
  providerEnv,
  type EmailProvider,
} from "@/lib/email/oauth";
import { verifyOAuthState } from "@/lib/email/state";
import { fetchAccountEmail } from "@/lib/email/sync";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Mailbox connect — step 2 of 2 (future-list item "Gmail/Outlook").
 * The provider bounces back here with ?code=…&state=…. The state claim
 * (signed: user + workspace + provider) is verified BEFORE any code is
 * redeemed, so a tampered/leaked callback can never route one user's
 * tokens into another workspace. Tokens are AES-256-GCM encrypted
 * before they touch the DB, and the account row is upserted through the
 * service role (no user write policies on email_accounts by design).
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const fail = (kind: string) =>
    NextResponse.redirect(`${origin}/settings?email=error=${kind}`);

  // The provider's own cancel/error path lands here without a code.
  if (url.searchParams.get("error")) return fail("canceled");

  const code = url.searchParams.get("code");
  if (!code) return fail("state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("auth");

  const context = await getWorkspaceContext();
  if (!context || context.role !== "owner") return fail("forbidden");

  const provider = verifyOAuthState(
    url.searchParams.get("state"),
    user.id,
    context.id
  );
  if (provider !== "gmail" && provider !== "outlook") return fail("state");

  const env = providerEnv(provider);
  const keyHex = process.env.EMAIL_TOKEN_ENCRYPTION_KEY ?? "";
  if (!env || !hasTokenKey(keyHex) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail("not_configured");
  }

  try {
    const tokens = await exchangeCode({
      provider: provider as EmailProvider,
      code,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      redirectUri: `${origin}/api/email/callback`,
    });
    // Without a refresh token the connection would silently die in ~1h —
    // fail now instead (the user re-runs with consent).
    if (!tokens.refreshToken) return fail("reauth");

    const address =
      (await fetchAccountEmail({
        provider: provider as EmailProvider,
        accessToken: tokens.accessToken,
      })) ?? tokens.email ?? `unresolved@${provider}.local`;

    const service = createServiceClient();
    await service.from("email_accounts").upsert(
      {
        workspace_id: context.id,
        service: provider,
        email_address: address,
        display_name: null,
        access_token_enc: tokenEncrypt(tokens.accessToken, keyHex),
        refresh_token_enc: tokenEncrypt(tokens.refreshToken, keyHex),
        token_expires_at: tokens.expiresAt,
        status: "active",
        last_error: null,
      },
      { onConflict: "workspace_id,service,email_address" }
    );

    return NextResponse.redirect(`${origin}/settings?email=connected`);
  } catch {
    // Provider rejected the code (expired, replayed, revoked consent) —
    // the user simply re-runs the connect flow.
    return fail("exchange");
  }
}
