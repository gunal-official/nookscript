"use client";

/**
 * Create/edit dialog for templates — reuses components/ui/dialog.tsx.
 * Pass `template` for edit mode, omit it for create mode. Parent owns the
 * open state; on a successful save the dialog closes and revalidated
 * server props refresh the list.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { createTemplate, updateTemplate } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Template } from "@/lib/types/template";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export function TemplateDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null/undefined → create mode; a Template → edit mode. */
  template?: Template | null;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(template);

  // (Re)seed the form whenever the dialog opens or the target changes.
  useEffect(() => {
    if (open) {
      setTitle(template?.title ?? "");
      setBody(template?.body ?? "");
      setError(null);
    }
  }, [open, template]);

  async function handleSubmit() {
    setPending(true);
    setError(null);

    const result = isEdit
      ? await updateTemplate({ templateId: template!.id, title, body })
      : await createTemplate({ title, body });

    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit template" : "New template"}
          </DialogTitle>
          <DialogDescription>
            A reusable text snippet for your workspace — paste it wherever
            you need it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel>Title</FieldLabel>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly update sign-off"
              aria-label="Title"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Body</FieldLabel>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="The text you want to reuse…"
              aria-label="Body"
              className="min-h-[180px] text-sm leading-relaxed"
            />
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending || !title.trim()}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin"  aria-hidden="true" />}
            {isEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
