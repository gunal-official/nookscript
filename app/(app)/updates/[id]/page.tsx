/**
 * /updates/:id — the client update composer: editable title + body with
 * explicit save, draft/sent status, markdown export, and a link back to
 * the source plan.
 *
 * HOW TO TEST (locally — Supabase configured per README.md, ⚠ apply the
 * new updates migration + seed first):
 *   1. From /updates open the seeded "Week 2" (draft) update.
 *   2. Edit the title/body → "Unsaved changes" chip appears → Save:
 *      updates.title/body update and the chip clears.
 *   3. Status dropdown (Draft → Sent): updates.status updates; list badge
 *      matches after navigating back.
 *   4. "Export as markdown" downloads <title>.md built in the browser
 *      (exports last-saved content).
 *   5. "View source plan" links to /plans/<id>; from that plan page,
 *      "Compose update" creates another draft and redirects here.
 *   6. Bogus or foreign ids render the "not found" state (RLS hides them
 *      identically).
 */

import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { getUpdateById } from "@/lib/data/updates";
import { formatDate, isUuid, timeAgo } from "@/lib/utils";
import { ExportUpdateMarkdownButton } from "@/components/updates/ExportUpdateMarkdownButton";
import { UpdateComposer } from "@/components/updates/UpdateComposer";
import { UpdateStatusBadge } from "@/components/updates/UpdateStatusBadge";
import { UpdateStatusSelect } from "@/components/updates/UpdateStatusSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Badge variant="secondary">Not found</Badge>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Update not found
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This update doesn’t exist — or it belongs to a workspace you’re
          not a member of.
        </p>
      </div>
      <Button asChild variant="secondary">
        <Link href="/updates">Back to updates</Link>
      </Button>
    </div>
  );
}

export default async function UpdateDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!isUuid(params.id)) {
    return <NotFoundState />;
  }

  const update = await getUpdateById(params.id);
  if (!update) {
    return <NotFoundState />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/updates"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Updates
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {update.title}
          </h1>
          <UpdateStatusBadge status={update.status} />
        </div>
        {update.client_name && (
          <p className="mt-1 text-sm text-muted-foreground">
            {update.client_name}
          </p>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* ── Left: composer ── */}
        <Card>
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <CardTitle className="text-base">Composer</CardTitle>
            <CardDescription>
              Edit the title and body, then save — the client gets the
              exported markdown.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <UpdateComposer
              updateId={update.id}
              initialTitle={update.title}
              initialBody={update.body}
            />
          </CardContent>
        </Card>

        {/* ── Right: metadata / actions ── */}
        <Card>
          <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5 p-5">
            <MetaRow label="Status">
              <UpdateStatusSelect updateId={update.id} status={update.status} />
            </MetaRow>
            {update.client_name && (
              <MetaRow label="Client">{update.client_name}</MetaRow>
            )}
            <MetaRow label="Created">{formatDate(update.created_at)}</MetaRow>
            <MetaRow label="Updated">{timeAgo(update.updated_at)}</MetaRow>
            {update.plan && (
              <div className="border-t border-border pt-3.5">
                <Link
                  href={`/plans/${update.plan.id}`}
                  className="group inline-flex items-center gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
                >
                  View source plan
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {update.plan.title}
                </p>
              </div>
            )}
            <div className="border-t border-border pt-4">
              <ExportUpdateMarkdownButton
                title={update.title}
                body={update.body}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
