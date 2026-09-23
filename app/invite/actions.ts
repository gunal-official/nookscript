"use server";

/**
 * Accept-action for /invite/:token (Step 15). Every guard — liveness,
 * expiry, invited-email match, duplicate membership — lives inside the
 * accept_team_invite() SECURITY DEFINER RPC in one transaction; this
 * action only translates its snake_case exceptions into UI copy.
 * Called from the invite page AND from /signup?invite=… right after the
 * account is created (the invite-aware signup path).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

export type AcceptInviteResult = { error?: string } | undefined;

export async function acceptTeamInviteAction(input: {
  token: string;
}): Promise<AcceptInviteResult> {
  const token = input.token?.trim();
  if (!token || !isUuid(token)) {
    return { error: "This invite link isn't valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_team_invite", {
    p_token: token,
  });

  if (error) {
    if (error.message.includes("invite_email_mismatch")) {
      return {
        error:
          "This invite was sent to a different email address. Log back in with the invited address to accept it (or sign up with it).",
      };
    }
    if (error.message.includes("invite_invalid_or_expired")) {
      return {
        error:
          "This invite is no longer valid — it was already accepted, revoked, or expired. Ask the workspace owner for a fresh link.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/", "layout"); // membership changed → app shell re-reads it
  redirect("/intake");
}
