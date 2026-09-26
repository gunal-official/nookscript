/**
 * Invite email delivery (Step 23, revised — plain SMTP via nodemailer;
 * the original Resend version was replaced at the user's direction: no
 * third-party email API, just the project owner's own mail account).
 *
 * The Team card's invites are emailed when SMTP is configured; copy-link
 * stays as the fallback:
 *
 *   - any of the SMTP_* env vars unset → the send is skipped SILENTLY
 *     (dev mode — the copy-link flow is unchanged, nothing to warn
 *     about);
 *   - send fails → the invite row still exists (it was created first);
 *     the caller surfaces a warning with a copy link.
 *
 * Delivery can never block or undo invite creation — email is a best
 * effort on top of a durable row.
 *
 * Env (all five must be set for any email to go out):
 *   SMTP_HOST  — SMTP server hostname (e.g. smtp.gmail.com);
 *   SMTP_PORT  — 465 (implicit TLS) or 587 (STARTTLS); the TLS mode is
 *                derived from the port, no separate flag;
 *   SMTP_USER  — auth username (the full address, e.g. you@gmail.com);
 *   SMTP_PASS  — auth password (Gmail: an APP PASSWORD — regular
 *                passwords are rejected by Google for SMTP);
 *   SMTP_FROM  — sender shown to recipients (e.g.
 *                "NookScript <invites@yourdomain.com>").
 *
 * This module imports NO next/ stuff — the caller (server action)
 * resolves the site URL from request headers and passes it in, which is
 * also what keeps it testable against a local SMTP server.
 */

import nodemailer from "nodemailer";

export type InviteEmailResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-configured" | "send-failed";
      detail?: string;
    };

const DEFAULT_FROM_NAME = "NookScript";

function readConfig(): {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
} | null {
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !portRaw || !user || !pass || !from) return null;

  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return { host, port, user, pass, from };
}

export async function sendInviteEmail(input: {
  to: string;
  workspaceName: string;
  inviterName: string | null;
  inviteUrl: string;
  expiresAt: Date;
}): Promise<InviteEmailResult> {
  const cfg = readConfig();
  if (!cfg) return { ok: false, reason: "not-configured" };

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // 465 = implicit TLS; 587 (and anything else) = STARTTLS.
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

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
    `— ${DEFAULT_FROM_NAME}`,
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
      <p style="font-size:12px;color:#a1a1aa;margin-top:24px;">${DEFAULT_FROM_NAME}</p>
    </div>
  `.trim();

  try {
    await transporter.sendMail({
      from: cfg.from,
      to: input.to,
      subject,
      text,
      html,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: "send-failed",
      detail: e instanceof Error ? e.message : String(e),
    };
  } finally {
    await transporter.close();
  }
}
