"use client";

/**
 * Workspace card on /settings: shows the current workspace name. Owners
 * edit it inline (input + Save); members see it read-only with a "View
 * only" note and ZERO controls — the same hide-don't-disable pattern as
 * the Templates card (Step 11).
 */

import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { updateWorkspaceName } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function WorkspaceNameCard({
  name,
  isOwner,
}: {
  name: string;
  isOwner: boolean;
}) {
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  const dirty = value.trim() !== name && value.trim().length > 0;

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    setSavedLabel(null);

    const result = await updateWorkspaceName({ name: value });

    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setSavedLabel(
      `Saved at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <CardTitle className="text-base">Workspace</CardTitle>
        <CardDescription>
          The workspace name appears in the sidebar and across the app.
          {!isOwner && (
            <span className="italic">
              {" "}
              View only — owners manage this.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {isOwner ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Input
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setSavedLabel(null);
                }}
                maxLength={80}
                placeholder="Workspace name"
                className="max-w-sm"
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!dirty || saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin"  aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5"  aria-hidden="true" />
                    Save
                  </>
                )}
              </Button>
            </div>
            {error && <p className="text-xs text-error">{error}</p>}
            {savedLabel && (
              <p className="text-xs text-muted-foreground">{savedLabel}</p>
            )}
          </div>
        ) : (
          <p className="text-sm font-medium">{name}</p>
        )}
      </CardContent>
    </Card>
  );
}
