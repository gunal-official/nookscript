"use client";

/**
 * The client update composer: editable title + body (markdown) with an
 * explicit Save — no autosave. Local edits diverge from the server props,
 * an "Unsaved changes" chip appears, and Save persists via
 * saveUpdateContent. After a successful save the revalidated props flow
 * back in and the chip clears (props are re-synced via the effect below).
 */

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";

import { saveUpdateContent } from "@/app/(app)/updates/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
}: {
  updateId: string;
  initialTitle: string;
  initialBody: string;
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
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Body (markdown)</FieldLabel>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write the client update…"
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
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save update
        </Button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
