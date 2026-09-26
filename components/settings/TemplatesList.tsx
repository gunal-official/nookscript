"use client";

/**
 * Templates list for /settings — plain rows in a single card (no
 * tabs/search/grid; templates are low-volume). Non-owners (members) see
 * the content read-only: create/edit/delete controls are NOT rendered for
 * them at all (the server also role-checks + RLS blocks — this is the
 * third, user-facing layer).
 *
 * Delete uses a lightweight inline confirm per row (first click swaps the
 * row's actions to Cancel/Delete) instead of a blocking native confirm.
 */

import { useState } from "react";
import { FileText, Loader2, Pencil, Plus, Trash2, LayoutTemplate } from "lucide-react";

import { deleteTemplate } from "@/app/(app)/settings/actions";
import { TemplateDialog } from "@/components/settings/TemplateDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Template } from "@/lib/types/template";

type DialogState = { mode: "create" } | { mode: "edit"; template: Template } | null;

function EmptyState({
  isOwner,
  onCreate,
}: {
  isOwner: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <FileText className="h-5 w-5 text-muted-foreground"  aria-hidden="true" />
      </span>
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          No templates yet
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {isOwner
            ? "Create your first reusable snippet — follow-ups, sign-offs, anything you retype."
            : "Templates your workspace owners create will show up here."}
        </p>
      </div>
      {isOwner && (
        <Button onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4"  aria-hidden="true" />
          New template
        </Button>
      )}
    </div>
  );
}

function TemplateRow({
  template,
  isOwner,
  onEdit,
}: {
  template: Template;
  isOwner: boolean;
  onEdit: (template: Template) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await deleteTemplate({ templateId: template.id });
    setPending(false);
    if (result?.error) {
      setError(result.error);
      setConfirming(false);
    }
    // On success the row unmounts via revalidated server props.
  }

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{template.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {template.body || (
              <span className="italic">(empty body)</span>
            )}
          </p>
          {error && <p className="mt-1 text-xs text-error">{error}</p>}
        </div>

        {isOwner && !confirming && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit(template)}
              aria-label={`Edit ${template.title}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-error hover:text-error"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${template.title}`}
            >
              <Trash2 className="h-4 w-4"  aria-hidden="true" />
            </Button>
          </div>
        )}

        {isOwner && confirming && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Delete?</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin"  aria-hidden="true" />}
              Delete
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

export function TemplatesList({
  templates,
  isOwner,
}: {
  templates: Template[];
  isOwner: boolean;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <>
      <Card>
        <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
          <span className="icon-chip icon-chip-muted h-8 w-8">
            <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle className="text-base">Templates</CardTitle>
        </div>
              <CardDescription>
                Reusable text snippets for the workspace.{" "}
                {!isOwner && (
                  <span className="italic">View only — owners manage these.</span>
                )}
              </CardDescription>
            </div>
            {isOwner && templates.length > 0 && (
              <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
                <Plus className="mr-1.5 h-4 w-4"  aria-hidden="true" />
                New template
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {templates.length === 0 ? (
            <EmptyState
              isOwner={isOwner}
              onCreate={() => setDialog({ mode: "create" })}
            />
          ) : (
            <ul className="divide-y divide-border">
              {templates.map((template) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  isOwner={isOwner}
                  onEdit={(t) => setDialog({ mode: "edit", template: t })}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TemplateDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        template={dialog?.mode === "edit" ? dialog.template : null}
      />
    </>
  );
}
