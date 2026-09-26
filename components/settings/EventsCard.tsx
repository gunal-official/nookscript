/**
 * Activity (suggestions pass 8/10) — the READ surface for the workspace
 * event log: the 25 newest rows, newest first, for EVERY member (the
 * events SELECT policy is membership-scoped). The log itself stays
 * append-only in public.events; this is a glance, not a query tool.
 * Server component — no interactivity, pure presentation.
 */

import { Activity } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { eventDetail, eventLabel } from "@/lib/events";
import { timeAgo } from "@/lib/utils";

export interface SettingsEventRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export function EventsCard({ events }: { events: SettingsEventRow[] }) {
  return (
    <Card className="animate-rise-in">
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip icon-chip-muted h-8 w-8">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle className="text-base">Activity</CardTitle>
        </div>
        <CardDescription>
          Recent workspace events — briefs, proposals, plans, invoices,
          contracts, and team changes. Append-only; the newest 25 are
          shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No events yet — they appear as work moves through the pipeline
            and as the team changes.
          </p>
        ) : (
          <ol className="space-y-2" aria-label="Recent workspace events">
            {events.map((event) => {
              const detail = eventDetail(event);
              return (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
                >
                  <span className="font-medium">
                    {eventLabel(event.event_type)}
                  </span>
                  {detail ? (
                    <span className="min-w-0 break-all text-muted-foreground">
                      {detail}
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {timeAgo(event.created_at)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
