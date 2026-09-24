/**
 * Invite email delivery (Step 23 — Resend). The Team card's invites were
 * copy-link by design (no email anywhere); this step adds the email as
 * the PRIMARY delivery, keeping copy-link as the fallback:
 *
 *   - RESEND_API_KEY unset  → the send is skipped SILENTLY (dev mode —
 *     the copy-link flow is unchanged, nothing to warn about);
 *   - send fails            → the invite row still exists (it was
 *     created first); the caller surfaces a warning with a copy link.
 *
 * Delivery can never block or undo invite creation — email is a best
 * effort on top of a durable row.
 *
 * Env:
 *   RESEND_API_KEY   — required for any email to go out;
 *   RESEND_FROM      — sender (e.g. "NookScript <invites@yourdomain.com>");
 *                      defaults to NookScript <no-reply@<site host>> —
 *                      set it to a domain verified in your Resend
 *                      account or sends will be rejected;
 *   RESEND_BASE_URL  — only for sandbox/testing; points the SDK at a
 *                      stub instead of https://api.resend.com.
 *
 * This module imports NO next/ stuff — the caller (server action)
 * resolves the site URL from request headers and passes it in, which is
 * also what keeps it unit-testable with plain node.
 */

import { Resend } from "resend";

export type InviteEmailResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-configured" | "send-failed";
      detail?: string;
    };

const DEFAULT_FROM_NAME = "NookScript";

export async function sendInviteEmail(input: {
  to: string;
  /** Site host (e.g. "app.nookscript.com") — used only to build the
   *  default From address when RESEND_FROM is unset. */
  fromHost: string;
  workspaceName: string;
  inviterName: string | null;
  inviteUrl: string;
  expiresAt: Date;
}): Promise<InviteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "not-configured" };

  const from =
    process.env.RESEND_FROM ||
    `${DEFAULT_FROM_NAME} <no-reply@${input.fromHost}>`;

  const resend = new Resend(
    apiKey,
    process.env.RESEND_BASE_URL
      ? { baseUrl: process.env.RESEND_BASE_URL }
      : undefined
  );

  const who = input.inviterName ? `${input.inviterName} ` : "";
  const subject = `You're invited to ${input.workspaceName} on NookScript`;
  const expires = input.expiresAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const text = [
    `${who}invited you to join ${input.workspaceName} on NookScript as a member.`,
    "",
    `Open the invite (it expires ${expires}):`,
    input.inviteUrl,
    "",
    "Already have an account? Sign in first, then open the link.",
    "",
    "— NookScript",
  ].join("\n");

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;color:#18181b;">
      <p style="font-size:15px;line-height:1.6;">${who}invited you to join
        <strong>${input.workspaceName}</strong> on NookScript as a member.</p>
      <p style="padding:16px 0;">
        <a href="${input.inviteUrl}"
           style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:0.35rem;">
          Open the invite
        </a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#71717a;">
        The link expires ${expires}. Already have an account? Sign in
        first, then open the link.
      </p>
      <p style="font-size:12px;color:#a1a1aa;margin-top:24px;">NookScript</p>
    </div>
  `.trim();

  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject,
    text,
    html,
  });

  if (error) {
    return { ok: false, reason: "send-failed", detail: error.message };
  }
  return { ok: true };
}
