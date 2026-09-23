"use client";

/**
 * Three-state public-link panel for the invoice detail page (mirrors
 * components/updates/ShareLinkPanel.tsx):
 *   1. no link        → "Create public link"
 *   2. active link    → copyable public URL + "Revoke"
 *   3. revoked link   → "Regenerate" (new token, row kept — history of
 *                       the old link dies with the token)
 * After each action the server page revalidates and fresh props flow
 * in, flipping the panel to the right state.
 *
 * The absolute URL uses window.location.origin, resolved after mount —
 * SSR renders the path-only form first, so there is no hydration
 * mismatch and the copy button always has a full URL by the time
 * anyone can click.
 *
 * Note for the client: only SENT and PAID invoices render behind the
 * link (draft/void return the same "unavailable" state as a revoked
 * one — indistinguishable by design).
 */

import { useEffect, useState } from "react";
import { Ban, Check, Copy, Link2, Loader2, RefreshCw } from "lucide-react";

import {
  createInvoiceLink,
  regenerateInvoiceLink,
  revokeInvoiceLink,
} from "@/app/(app)/invoices/[id]/actions";
import { Button } from "@/components/ui/button";
import type { InvoiceLink } from "@/lib/types/invoice";

export function InvoiceLinkPanel({
  invoiceId,
  invoiceLink,
}: {
  invoiceId: string;
  invoiceLink: InvoiceLink | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  useEffect(() => {
    if (invoiceLink) {
      setLinkUrl(`${window.location.origin}/invoice/${invoiceLink.token}`);
    } else {
      setLinkUrl(null);
    }
  }, [invoiceLink]);

  const isActive = invoiceLink !== null && invoiceLink.revoked_at === null;

  async function run(
    action: () => Promise<{ error?: string } | undefined>
  ) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (result?.error) setError(result.error);
  }

  async function handleCopy() {
    if (!linkUrl) return;
    await navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {invoiceLink === null && (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Anyone with the link can view this invoice — read-only, no
            account needed. Draft and void invoices never render behind
            a link. You can revoke it any time.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => run(() => createInvoiceLink({ invoiceId }))}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Create public link
          </Button>
        </>
      )}

      {invoiceLink !== null && isActive && (
        <>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
              {linkUrl ?? `/invoice/${invoiceLink.token}`}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              aria-label="Copy invoice link"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={pending}
            onClick={() =>
              run(() =>
                revokeInvoiceLink({ linkId: invoiceLink.id, invoiceId })
              )
            }
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Ban className="mr-2 h-4 w-4" />
            )}
            Revoke link
          </Button>
        </>
      )}

      {invoiceLink !== null && !isActive && (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            This link was revoked and no longer works. Regenerating
            issues a new link (the old one stays dead).
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() =>
              run(() =>
                regenerateInvoiceLink({ linkId: invoiceLink.id, invoiceId })
              )
            }
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Regenerate link
          </Button>
        </>
      )}

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
