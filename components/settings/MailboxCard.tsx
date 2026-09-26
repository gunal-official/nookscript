"use client";

/**
 * Mailbox card (future-list item "Gmail/Outlook") — connect a
 * client-facing mailbox (Gmail or Outlook) and manage it: sync now,
 * see last-sync/last-error, disconnect. Owner-managed (the OAuth
 * connect is owner-gated in /api/email/connect); members see the
 * connections, not the controls (templates/webhooks precedent).
 *
 * v1 shape: one mailbox per provider (disconnect to swap accounts) —
 * documented in docs/email-intake-closeout.md.
 */

import { useState, useTransition } from "react";

import {
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import {
  disconnectEmail,
  syncEmailNow,
} from "@/app/(app)/settings/email-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { MailboxAccountSummary } from "@/lib/data/mailbox";
import { timeAgo } from "@/lib/utils";

export function MailboxCard({
  accounts,
  isOwner,
  gmailConfigured,
  outlookConfigured,
  tokenKeyOk,
}: {
  accounts: MailboxAccountSummary[];
  isOwner: boolean;
  /** GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET set on the server. */
  gmailConfigured: boolean;
  /** AZURE_CLIENT_ID + AZURE_CLIENT_SECRET set on the server. */
  outlookConfigured: boolean;
  /** EMAIL_TOKEN_ENCRYPTION_KEY (64 hex) set on the server. */
  tokenKeyOk: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const toast = useToast();

  function runSync(id: string) {
    startTransition(async () => {
      const result = await syncEmailNow(id);
      if (result?.error) {
        toast(result.error);
      } else {
        toast(
          (result?.staged ?? 0) > 0
            ? `Mailbox synced — ${result?.staged} message(s) staged in the Inbox.`
            : "Mailbox synced — inbox already up to date."
        );
      }
    });
  }

  function runDisconnect(id: string) {
    setConfirmId(null);
    startTransition(async () => {
      const result = await disconnectEmail(id);
      toast(result?.error ?? "Mailbox disconnected.");
    });
  }

  const connectHref = (provider: "gmail" | "outlook") =>
    `/api/email/connect?provider=${provider}`;

  return (
    <Card data-proof="mailbox">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="icon-chip icon-chip-accent h-10 w-10">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Mailbox</CardTitle>
            <CardDescription>
              Connect a client-facing mailbox — new mail is staged in the
              Inbox, where it can become a brief.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {a.email_address}
                {a.display_name ? ` (${a.display_name})` : ""}
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  {a.service === "gmail" ? "Gmail" : "Outlook"}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {a.status === "needs_reauth"
                  ? "Needs re-authorization — connect again to restore sync."
                  : a.last_synced_at
                    ? `Last synced ${timeAgo(a.last_synced_at)}`
                    : "Never synced yet"}
              </p>
              {a.status === "active" && a.last_error && (
                <p className="mt-0.5 text-xs text-error">{a.last_error}</p>
              )}
            </div>

            {isOwner && (
              <div className="flex items-center gap-2">
                {a.status === "needs_reauth" ? (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/email/connect?provider=${a.service}`}>
                        <RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" />
                        Connect again
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Disconnect ${a.email_address}`}
                      onClick={() => setConfirmId(a.id)}
                    >
                      <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                    </Button>
                  </>
                ) : confirmId === a.id ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      onClick={() => runDisconnect(a.id)}
                    >
                      {pending ? "Working…" : "Confirm disconnect"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Cancel disconnect"
                      onClick={() => setConfirmId(null)}
                    >
                      <X size={16} strokeWidth={1.5} aria-hidden="true" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => runSync(a.id)}
                    >
                      {pending ? (
                        <Loader2 size={16} strokeWidth={1.5} aria-hidden="true" className="animate-spin" />
                      ) : (
                        <RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" />
                      )}
                      Sync now
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Disconnect ${a.email_address}`}
                      onClick={() => setConfirmId(a.id)}
                    >
                      <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}

        {accounts.length === 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {gmailConfigured && tokenKeyOk ? (
                <Button
                  variant="outline"
                  asChild
                >
                  <a href={connectHref("gmail")}>
                    <Mail size={16} strokeWidth={1.5} aria-hidden="true" />
                    Connect Gmail
                  </a>
                </Button>
              ) : (
                <span className="inline-flex h-11 min-w-11 cursor-not-allowed items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-5 py-2 text-sm font-semibold text-muted-foreground">
                  <Mail size={16} strokeWidth={1.5} aria-hidden="true" />
                  Connect Gmail
                </span>
              )}
              {outlookConfigured && tokenKeyOk ? (
                <Button variant="outline" asChild>
                  <a href={connectHref("outlook")}>
                    <Mail size={16} strokeWidth={1.5} aria-hidden="true" />
                    Connect Outlook
                  </a>
                </Button>
              ) : (
                <span className="inline-flex h-11 min-w-11 cursor-not-allowed items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-5 py-2 text-sm font-semibold text-muted-foreground">
                  <Mail size={16} strokeWidth={1.5} aria-hidden="true" />
                  Connect Outlook
                </span>
              )}
            </div>
            {!gmailConfigured && (
              <p className="text-xs text-muted-foreground">
                Gmail: set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (OAuth
                client with the Gmail API enabled) to enable this.
              </p>
            )}
            {!outlookConfigured && (
              <p className="text-xs text-muted-foreground">
                Outlook: set AZURE_CLIENT_ID + AZURE_CLIENT_SECRET (app
                registration with Microsoft Graph Mail.Read) to enable
                this.
              </p>
            )}
            {gmailConfigured &&
              outlookConfigured &&
              !tokenKeyOk && (
                <p className="text-xs text-muted-foreground">
                  Also set EMAIL_TOKEN_ENCRYPTION_KEY (64 hex chars, e.g.
                  <code className="mx-1">openssl rand -hex 32</code>) — it
                  encrypts the stored tokens.
                </p>
              )}
          </div>
        )}

        {accounts.length > 0 && (
          <p className="text-xs text-muted-foreground">
            One mailbox per provider (v1) — disconnect to connect a
            different account.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
