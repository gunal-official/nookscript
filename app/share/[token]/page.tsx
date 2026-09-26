/**
 * /share/:token — PUBLIC, read-only view of a shared update (Step 34(b)
 * client-document treatment). No auth, no app shell: the page lives
 * outside the route groups by design and inherits only the root layout
 * (font/theme). Renders the update as a paper client-update document —
 * the same PaperCard vocabulary as the member app, so the client's view
 * matches the product.
 *
 * HOW TO TEST (locally — ⚠ share_links migration + seed applied first):
 *   1. Seed plants a link for the "Week 1" update with token
 *      00000000-0000-0000-0000-000000000051 → open
 *      http://localhost:3000/share/00000000-0000-0000-0000-000000000051
 *      in an INCOGNITO window (no session) — the update renders read-only
 *      as a letterhead document with the body as the letter body.
 *   2. Revoke the link from the update's Share panel → the same URL now
 *      shows the generic "invalid or revoked" state (no distinction).
 *   3. /share/demo-token (route map) isn't a UUID → same state, and the
 *      RPC is never even called (shape check first).
 *
 * Security notes: data comes ONLY from the get_shared_document SECURITY
 * DEFINER RPC (share_links itself is fully member-gated); invalid vs
 * revoked is indistinguishable; no ids or internals are returned.
 */

import { Link2Off } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { UpdateStatusBadge } from "@/components/updates/UpdateStatusBadge";
import { PaperCard } from "@/components/ui/doc-detail";
import { getSharedDocumentByToken } from "@/lib/data/shares";
import { formatDate, isUuid } from "@/lib/utils";

function Brand() {
  return (
    <div className="mb-6 flex items-center justify-between">
      <span className="font-display text-lg font-bold tracking-tight">
        nook<span className="text-accent">script</span>
      </span>
      <Badge variant="outline">Shared update — read only</Badge>
    </div>
  );
}

function InvalidState() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col [justify-content:safe_center] px-6">
      <Brand />
      <span className="icon-chip icon-chip-muted mb-4 h-10 w-10">
        <Link2Off className="h-5 w-5" aria-hidden="true" />
      </span>
      <h1 className="font-display text-3xl font-bold tracking-tight">
        This link is invalid or has been revoked
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask the sender for a new link, or check that the URL was copied in
        full.
      </p>
    </main>
  );
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Shape-check first: /share/demo-token and any garbage path never reach
  // the database.
  if (!isUuid(token)) {
    return <InvalidState />;
  }

  let document = null;
  try {
    document = await getSharedDocumentByToken(token);
  } catch {
    // RPC/DB failure renders the same generic state — no internals here.
    return <InvalidState />;
  }

  if (!document) {
    return <InvalidState />;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col [justify-content:safe_center] px-6 py-16">
      <Brand />

      <PaperCard
        letterLabel="Client update"
        letterhead={document.client_name ?? "nookscript"}
        meta={formatDate(document.updated_at)}
        footer={
          <p className="text-center text-xs text-muted-foreground">
            Shared via nookscript — the sender can revoke this link at any
            time.
          </p>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {document.title}
          </h1>
          <UpdateStatusBadge status={document.status} />
        </div>
        {document.client_name && (
          <p className="mt-1 text-sm text-muted-foreground">
            {document.client_name}
          </p>
        )}
        <pre className="mt-5 whitespace-pre-wrap font-sans text-[15px] leading-relaxed">
          {document.body}
        </pre>
      </PaperCard>
    </main>
  );
}
