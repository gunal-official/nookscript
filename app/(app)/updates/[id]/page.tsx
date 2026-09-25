/**
 * /updates/:id — the client update document (Step 34(b)): the update
 * rendered as a paper document (letterhead + body), stat tiles (status /
 * source plan / public link), the composer below for editors, share-link
 * panel, markdown export, and an activity timeline.
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
 *   6. Share panel: create → copy the /share/<token> URL → open it in an
 *      INCOGNITO window: the update renders read-only. Revoke → the URL
 *      shows the generic "unavailable" state.
 *   7. Bogus or foreign ids render the "not found" state (RLS hides
 *      them identically).
 */

import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Clock,
  FilePlus2,
  FileText,
  Link2,
  Megaphone,
  Send,
} from "lucide-react";

import { getUpdateById } from "@/lib/data/updates";
import { getShareLinkForUpdate } from "@/lib/data/shares";
import { getTemplates } from "@/lib/data/templates";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { CanEdit } from "@/components/app-shell/CanEdit";
import { formatDate, isUuid, timeAgo } from "@/lib/utils";
import { ExportUpdateMarkdownButton } from "@/components/updates/ExportUpdateMarkdownButton";
import { ShareLinkPanel } from "@/components/updates/ShareLinkPanel";
import { UpdateComposer } from "@/components/updates/UpdateComposer";
import { UpdateStatusBadge } from "@/components/updates/UpdateStatusBadge";
import { UpdateStatusSelect } from "@/components/updates/UpdateStatusSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActivityTimeline,
  DocHeader,
  PaperCard,
  StatTile,
  type TimelineEvent,
} from "@/components/ui/doc-detail";

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
      <span className="min-w-0 break-words text-right">{children}</span>
    </div>
  );
}

function RailCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="animate-rise-in">
      <CardHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-border px-5 py-3.5">
        <span className="icon-chip icon-chip-muted h-8 w-8">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3.5 p-5">{children}</CardContent>
    </Card>
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
        <Link href="/updates" className="inline-flex min-h-11 min-w-11 items-center">Back to updates</Link>
      </Button>
    </div>
  );
}

export default async function UpdateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) {
    return <NotFoundState />;
  }

  const update = await getUpdateById(id);
  if (!update) {
    return <NotFoundState />;
  }

  // Templates for the composer's "Insert template" affordance, scoped to
  // the ACTIVE workspace (Step 16) like every other list read.
  const context = await getWorkspaceContext();
  const [shareLink, templates] = await Promise.all([
    getShareLinkForUpdate(id),
    context ? getTemplates(context.id) : Promise.resolve([]),
  ]);

  const events: TimelineEvent[] = [
    {
      icon: FilePlus2,
      title: "Drafted",
      detail: update.plan ? `From “${update.plan.title}”` : undefined,
      at: formatDate(update.created_at),
      tone: "accent",
    },
    ...(update.status === "sent"
      ? [
          {
            icon: Send,
            title: "Marked sent",
            detail: update.client_name ?? undefined,
            at: formatDate(update.updated_at),
            tone: "success",
          } as TimelineEvent,
        ]
      : []),
    {
      icon: Clock,
      title: "Last updated",
      at: timeAgo(update.updated_at),
      tone: "muted",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/updates"
        className="mb-3 inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Updates
      </Link>

      <DocHeader
        icon={Megaphone}
        title={update.title}
        badges={<UpdateStatusBadge status={update.status} />}
        subtitle={update.client_name ?? undefined}
      />

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          icon={FileText}
          label="Status"
          value={<UpdateStatusBadge status={update.status} />}
          hint={update.status === "sent" ? "Delivered to the client" : "Not sent yet"}
          tone={update.status === "sent" ? "success" : "muted"}
        />
        <StatTile
          icon={BookOpen}
          label="Source plan"
          value={update.plan ? update.plan.title : "—"}
          hint={update.plan ? "View the plan it came from" : "Standalone update"}
          href={update.plan ? `/plans/${update.plan.id}` : undefined}
          delay={40}
        />
        <StatTile
          icon={Link2}
          label="Public link"
          value={shareLink ? "Live" : "Private"}
          hint={
            shareLink
              ? "Clients can open the read-only view"
              : "Create one to share this update"
          }
          tone={shareLink ? "success" : "muted"}
          delay={80}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* ── Left: the update document + composer ── */}
        <div className="space-y-6">
          <PaperCard
            letterLabel="Client update"
            letterhead={update.client_name ?? "Client update"}
            meta={formatDate(update.created_at)}
            footer={
              update.plan ? (
                <p className="text-xs text-muted-foreground">
                  From the plan{" "}
                  <Link
                    href={`/plans/${update.plan.id}`}
                    className="inline-block min-h-11 min-w-11 break-words px-0.5 py-3 text-accent underline-offset-2 hover:underline"
                  >
                    {update.plan.title}
                  </Link>
                </p>
              ) : undefined
            }
          >
            <h2 className="font-display text-xl font-bold tracking-tight">
              {update.title}
            </h2>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-[15px] leading-relaxed">
              {update.body}
            </pre>
          </PaperCard>

          <CanEdit>
            <Card className="animate-rise-in">
              <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
                <CardTitle className="text-base">Edit update</CardTitle>
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
                  templates={templates}
                />
              </CardContent>
            </Card>
          </CanEdit>
        </div>

        {/* ── Right: share + metadata rail ── */}
        <div className="space-y-4">
          <RailCard
            icon={Link2}
            title="Public link"
            description="Read-only update the client can open — revocable any time."
          >
            <ShareLinkPanel updateId={update.id} shareLink={shareLink} />
          </RailCard>

          <RailCard icon={Megaphone} title="Details">
            <MetaRow label="Status">
              <CanEdit fallback={<UpdateStatusBadge status={update.status} />}>
                <UpdateStatusSelect updateId={update.id} status={update.status} />
              </CanEdit>
            </MetaRow>
            {update.client_name && (
              <MetaRow label="Client">{update.client_name}</MetaRow>
            )}
            <MetaRow label="Created">{formatDate(update.created_at)}</MetaRow>
            <MetaRow label="Updated">{timeAgo(update.updated_at)}</MetaRow>
            <div className="border-t border-border pt-3.5">
              <ExportUpdateMarkdownButton
                title={update.title}
                body={update.body}
              />
            </div>
          </RailCard>

          {update.plan && (
            <RailCard icon={BookOpen} title="Source">
              <p className="text-sm">{update.plan.title}</p>
              <Link
                href={`/plans/${update.plan.id}`}
                className="inline-flex min-h-11 min-w-11 items-center group gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
              >
                View source plan
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </RailCard>
          )}

          <RailCard icon={Clock} title="Activity">
            <ActivityTimeline events={events} />
          </RailCard>
        </div>
      </div>
    </div>
  );
}
