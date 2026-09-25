/**
 * /share/:token — PUBLIC, read-only view of a shared update. No auth, no
 * app shell: the page lives outside the route groups by design and
 * inherits only the root layout (font/theme).
 *
 * HOW TO TEST (locally — ⚠ share_links migration + seed applied first):
 *   1. Seed plants a link for the "Week 1" update with token
 *      00000000-0000-0000-0000-000000000051 → open
 *      http://localhost:3000/share/00000000-0000-0000-0000-000000000051
 *      in an INCOGNITO window (no session) — the update renders read-only.
 *   2. Revoke the link from the update's Share panel → the same URL now
 *      shows the generic "invalid or revoked" state (no distinction).
 *   3. /share/demo-token (route map) isn't a UUID → same state, and the
 *      RPC is never even called (shape check first).
 *
 * Security notes: data comes ONLY from the get_shared_document SECURITY
 * DEFINER RPC (share_links itself is fully member-gated); invalid vs
 * revoked is indistinguishable; no ids or internals are returned.
 */

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { UpdateStatusBadge } from "@/components/updates/UpdateStatusBadge";
import { getSharedDocumentByToken } from "@/lib/data/shares";
import { formatDate, isUuid } from "@/lib/utils";

function InvalidState() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center px-6">
      <Badge variant="secondary" className="mb-4">
        Link unavailable
      </Badge>
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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      {/* minimal public chrome */}
      <div className="mb-6 flex items-center justify-between">
        <span className="font-display text-lg font-bold tracking-tight">
          nook<span className="text-accent">script</span>
        </span>
        <Badge variant="outline">Shared update — read only</Badge>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {document.title}
        </h1>
        <UpdateStatusBadge status={document.status} />
      </div>
      {document.client_name && (
        <p className="mb-6 text-sm text-muted-foreground">
          {document.client_name}
        </p>
      )}

      <Card>
        <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
          <p className="text-xs text-muted-foreground">
            Updated {formatDate(document.updated_at)}
          </p>
        </CardHeader>
        <CardContent className="p-5">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {document.body}
          </pre>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Shared via nookscript
      </p>
    </main>
  );
}
