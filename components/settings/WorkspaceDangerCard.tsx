"use client";

/**
 * Danger zone card on /settings (Step 27): delete the ACTIVE workspace.
 * The escape hatch the Step-26 leave arc exposed — a sole owner can
 * neither leave (last-owner guard) nor, until this, destroy. Owner-only
 * (the page hides the whole card from members — hide-don't-disable; the
 * action and the workspaces DELETE policy re-gate).
 *
 * Destructive, irreversible, and it takes EVERYTHING with it (every
 * workspace_id FK cascades) — so the copy is deliberately loud and the
 * control uses the house two-click inline confirm (template delete,
 * member removal precedent).
 */

import { useState } from "react";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";

import { deleteWorkspaceAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function WorkspaceDangerCard({ name }: { name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await deleteWorkspaceAction();
    setPending(false);
    if (result?.error) {
      setError(result.error);
      setConfirming(false);
    }
    // On success the shell revalidates into the next workspace (or
    // /onboarding when none remain) — this card unmounts with it.
  }

  return (
    <Card>
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip icon-chip-muted h-8 w-8">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle className="text-base">Danger zone</CardTitle>
        </div>
        <CardDescription>Irreversible workspace operations.</CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <p className="text-sm font-medium">Delete this workspace</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {name} and EVERYTHING in it — briefs, proposals, plans, updates,
          invoices, contracts, templates, and team access — are permanently
          deleted for everyone. This cannot be undone.
        </p>
        {!confirming ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="mt-3"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4"  aria-hidden="true" />
            Delete workspace
          </Button>
        ) : (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Delete {name}?
            </span>
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
              {pending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin"  aria-hidden="true" />
              )}
              Delete forever
            </Button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
      </CardContent>
    </Card>
  );
}
