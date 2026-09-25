"use client";

/**
 * The client update composer: editable title + body (markdown) with an
 * explicit Save — no autosave. Local edits diverge from the server props,
 * an "Unsaved changes" chip appears, and Save persists via
 * saveUpdateContent. After a successful save the revalidated props flow
 * back in and the chip clears (props are re-synced via the effect below).
 *
 * Template integration (post-roadmap item): an "Insert template…" select
 * APPENDS the chosen snippet to the body with a blank-line separator —
 * in-progress writing is never destroyed (appending to an empty body is
 * just a clean insert). Pure client-side: Save already persists the body.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";

import { saveUpdateContent } from "@/app/(app)/updates/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Template } from "@/lib/types/template";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export function UpdateComposer({
  updateId,
  initialTitle,
  initialBody,
  templates,
}: {
  updateId: string;
  initialTitle: string;
  initialBody: string;
  templates: Template[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the server re-renders with fresh data after save.
  useEffect(() => {
    setTitle(initialTitle);
    setBody(initialBody);
  }, [initialTitle, initialBody]);

  const dirty = title !== initialTitle || body !== initialBody;

  async function handleSave() {
    setPending(true);
    setError(null);

    const result = await saveUpdateContent({
      updateId,
      title,
      body,
    });

    setPending(false);
    if (result?.error) setError(result.error);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel>Title</FieldLabel>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Update title"
          aria-label="Title"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>Body (markdown)</FieldLabel>
          {templates.length > 0 ? (
            <Select
              value=""
              onValueChange={(id) => {
                const tpl = templates.find((t) => t.id === id);
                if (!tpl) return;
                // APPEND with a blank-line separator — never destroy writing
                setBody((current) =>
                  current.trim() === ""
                    ? tpl.body
                    : `${current.trimEnd()}\n\n${tpl.body}`
                );
              }}
            >
              <SelectTrigger className="w-[190px]" aria-label="Insert template">
                <SelectValue placeholder="Insert template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              No templates yet —{" "}
              <Link
                href="/settings"
                className="underline underline-offset-2 transition-colors hover:text-text"
              >
                create one in Settings
              </Link>
            </span>
          )}
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write the client update…"
          aria-label="Body (markdown)"
          className="min-h-[320px] font-mono text-sm leading-relaxed"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs">
          {dirty ? (
            <Badge className="border-accent bg-accent-soft text-accent">
              Unsaved changes
            </Badge>
          ) : (
            <span className="text-muted-foreground">All changes saved</span>
          )}
        </div>
        <Button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty || !title.trim()}
        >
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin"  aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4"  aria-hidden="true" />
          )}
          Save update
        </Button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
