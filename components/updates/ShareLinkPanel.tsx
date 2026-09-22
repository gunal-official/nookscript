"use client";

/**
 * Three-state share-link panel for the update detail page:
 *   1. no link        → "Create share link"
 *   2. active link    → copyable public URL + "Revoke"
 *   3. revoked link   → "Regenerate" (new token, row kept — history of the
 *                       old link dies with the token)
 * After each action the server page revalidates and fresh props flow in,
 * flipping the panel to the right state.
 *
 * The absolute URL uses window.location.origin, resolved after mount —
 * SSR renders the path-only form first, so there is no hydration mismatch
 * and the copy button always has a full URL by the time anyone can click.
 */

import { useEffect, useState } from "react";
import { Ban, Check, Copy, Link2, Loader2, RefreshCw } from "lucide-react";

import {
  createShareLink,
  regenerateShareLink,
  revokeShareLink,
} from "@/app/(app)/updates/[id]/actions";
import { Button } from "@/components/ui/button";
import type { ShareLink } from "@/lib/types/share";

export function ShareLinkPanel({
  updateId,
  shareLink,
}: {
  updateId: string;
  shareLink: ShareLink | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  useEffect(() => {
    if (shareLink) {
      setShareUrl(`${window.location.origin}/share/${shareLink.token}`);
    } else {
      setShareUrl(null);
    }
  }, [shareLink]);

  const isActive = shareLink !== null && shareLink.revoked_at === null;

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
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {shareLink === null && (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Anyone with the link can view this update — read-only, no
            account needed. You can revoke it any time.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => run(() => createShareLink({ updateId }))}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Create share link
          </Button>
        </>
      )}

      {shareLink !== null && isActive && (
        <>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
              {shareUrl ?? `/share/${shareLink.token}`}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              aria-label="Copy share link"
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
                revokeShareLink({ shareId: shareLink.id, updateId })
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

      {shareLink !== null && !isActive && (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            This link was revoked and no longer works. Regenerating issues a
            new link (the old one stays dead).
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() =>
              run(() =>
                regenerateShareLink({ shareId: shareLink.id, updateId })
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
