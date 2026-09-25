"use client";

/**
 * Sidebar workspace switcher (Step 16). Invisible for single-workspace
 * users (renders the same static label the sidebar always had); with 2+
 * memberships it becomes a Radix Select. Switching writes
 * profiles.active_workspace_id via the action, then refreshes so every
 * list re-reads scoped to the newly active workspace.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Loader2 } from "lucide-react";

import { setActiveWorkspaceAction } from "@/app/(app)/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface SwitcherWorkspace {
  id: string;
  name: string;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: SwitcherWorkspace[];
  activeWorkspaceId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeName =
    workspaces.find((w) => w.id === activeWorkspaceId)?.name ??
    workspaces[0]?.name ??
    "";

  // Single-workspace account: identical to the pre-Step-16 sidebar label.
  if (workspaces.length <= 1) {
    return (
      <div className="flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-sm text-muted-foreground">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-text opacity-40" />
        <span className="truncate">{activeName}</span>
      </div>
    );
  }

  async function handleChange(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return;
    setPending(true);
    setError(null);
    const result = await setActiveWorkspaceAction({ workspaceId });
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh(); // current page's lists re-read under the new scope
  }

  return (
    <div className="px-1">
      <Select
        value={activeWorkspaceId}
        onValueChange={handleChange}
        disabled={pending}
      >
        <SelectTrigger
          className={cn(
            "h-9 w-full border-transparent bg-transparent px-2 text-sm text-muted-foreground shadow-none",
            "hover:bg-card hover:text-text focus:ring-0"
          )}
          aria-label="Switch workspace"
        >
          <span className="flex items-center gap-2 truncate">
            {pending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin"  aria-hidden="true" />
            ) : (
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
            )}
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              <span className="truncate">{workspace.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="px-2 pt-1 text-xs text-error">{error}</p>}
    </div>
  );
}
