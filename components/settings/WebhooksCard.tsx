"use client";

/**
 * Outbound webhooks (Phase: events/webhooks foundation) — register a
 * receiver URL, copy its HMAC signing secret, remove it. Owner-managed,
 * member-visible as "View only" (templates precedent); RLS
 * (is_workspace_owner) backs the UI.
 */

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";

import {
  deleteWebhookEndpoint,
  registerWebhookEndpoint,
  rotateWebhookEndpoint,
  testWebhookEndpoint,
} from "@/app/(app)/settings/webhook-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { WebhookDelivery, WebhookEndpoint } from "@/lib/types/webhook";
import { timeAgo } from "@/lib/utils";

export function WebhooksCard({
  endpoints,
  deliveries,
  eventTypes,
  isOwner,
}: {
  endpoints: WebhookEndpoint[];
  /** Owner-read delivery audit rows, newest first (suggestions pass 1/10).
   *  RLS (owners can select) returns nothing for non-owners. */
  deliveries: WebhookDelivery[];
  /** event_id → event_type, for the log lines. */
  eventTypes: Record<string, string>;
  isOwner: boolean;
}) {
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // The three newest delivery rows per endpoint (the list arrives sorted
  // newest-first; the full log stays in the DB — this is a glance surface).
  const deliveriesByEndpoint = new Map<string, WebhookDelivery[]>();
  for (const d of deliveries) {
    const bucket = deliveriesByEndpoint.get(d.endpoint_id) ?? [];
    if (bucket.length < 3) {
      bucket.push(d);
      deliveriesByEndpoint.set(d.endpoint_id, bucket);
    }
  }

  const register = () => {
    const value = url.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await registerWebhookEndpoint({ url: value });
      if (result?.error) {
        toast(result.error);
        return;
      }
      setUrl("");
      toast("Webhook registered — copy the signing secret.");
    });
  };

  const rotate = (endpoint: WebhookEndpoint) => {
    startTransition(async () => {
      const result = await rotateWebhookEndpoint({
        endpointId: endpoint.id,
      });
      if (result?.error) {
        toast(result.error);
        return;
      }
      toast(
        "Secret rotated — copy it, update your receiver. This endpoint's delivery history restarted."
      );
    });
  };

  const test = (endpoint: WebhookEndpoint) => {
    startTransition(async () => {
      const result = await testWebhookEndpoint({
        endpointId: endpoint.id,
      });
      if (result?.error) {
        toast(result.error);
        return;
      }
      toast(
        `Test delivered — your receiver answered HTTP ${result.status}.`
      );
    });
  };

  const remove = (endpoint: WebhookEndpoint) => {
    startTransition(async () => {
      const result = await deleteWebhookEndpoint({ endpointId: endpoint.id });
      if (result?.error) {
        toast(result.error);
        return;
      }
      toast("Webhook removed.");
    });
  };

  const copySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      toast("Signing secret copied.");
    } catch {
      toast("Could not copy — select the secret manually.");
    }
  };

  return (
    <Card className="animate-rise-in">
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip icon-chip-muted h-8 w-8">
            <Webhook className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle className="text-base">Webhooks</CardTitle>
        </div>
        <CardDescription>
          Outbound events — NookScript POSTs workspace events (briefs,
          proposals, plans, invoices, contracts) to your URL, signed with an
          HMAC secret. 3 attempts, 15s / 60s apart.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {endpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No endpoints yet — register a URL to start receiving events.
          </p>
        ) : (
          <ul className="space-y-3">
            {endpoints.map((endpoint) => (
              <li
                key={endpoint.id}
                className="rounded-lg border border-border bg-muted/40 px-3.5 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 break-all text-sm font-medium">
                    {endpoint.url}
                  </p>
                  {isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      aria-label="Rotate signing secret"
                      disabled={pending}
                      onClick={() => rotate(endpoint)}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  {isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      aria-label="Send test delivery to webhook"
                      disabled={pending}
                      onClick={() => test(endpoint)}
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  {isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      aria-label="Copy signing secret"
                      disabled={pending}
                      onClick={() => copySecret(endpoint.signing_secret)}
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  {isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      aria-label="Remove webhook"
                      disabled={pending}
                      onClick={() => remove(endpoint)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                {isOwner && (
                  <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">
                    {endpoint.signing_secret}
                  </p>
                )}
                {isOwner &&
                (deliveriesByEndpoint.get(endpoint.id) ?? []).length > 0 ? (
                  <ul
                    className="mt-2 space-y-1.5 border-t border-border pt-2"
                    aria-label={`Recent deliveries to ${endpoint.url}`}
                  >
                    {(deliveriesByEndpoint.get(endpoint.id) ?? []).map(
                      (d) => (
                        <li
                          key={d.id}
                          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
                        >
                          {d.status === "delivered" ? (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 text-success"
                              aria-hidden="true"
                            />
                          ) : d.status === "failed" ? (
                            <XCircle
                              className="h-4 w-4 shrink-0 text-error"
                              aria-hidden="true"
                            />
                          ) : (
                            <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                          )}
                          <span className="font-medium text-foreground">
                            {eventTypes[d.event_id] ?? "event"}
                          </span>
                          <span>
                            {d.status}
                            {d.attempts > 0
                              ? ` · ${d.attempts} attempt${d.attempts === 1 ? "" : "s"}`
                              : ""}
                          </span>
                          <span>{timeAgo(d.updated_at)}</span>
                          {d.status !== "delivered" && d.last_error ? (
                            <span className="w-full break-all pl-6">
                              {d.last_error}
                            </span>
                          ) : null}
                        </li>
                      )
                    )}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="url"
              placeholder="https://example.com/hooks/nookscript"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Webhook URL"
              className="min-w-0 flex-1 basis-full sm:basis-auto"
            />
            <Button
              type="button"
              onClick={register}
              disabled={pending || !url.trim()}
              className="basis-full sm:basis-auto"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Register
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">View only</span> — only workspace
            owners can manage webhooks.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
