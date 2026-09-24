import "server-only";

import { getWorkspaceContext } from "@/lib/data/workspace-context";

/**
 * Step 29 viewer gate for RENDER chrome: wraps write affordances
 * (composers, generate/share buttons, status selects) in a server
 * component so pages pass no extra props. Viewers get `fallback` (a
 * read badge, or null) instead. RLS + requireEditor() in the actions
 * remain the actual gates — this is the visible layer only.
 */
export async function CanEdit({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const ctx = await getWorkspaceContext();
  return <>{ctx?.canEdit ? children : fallback}</>;
}

/** Same gate for money surfaces (invoices, time) — Step 29 hide rule. */
export async function CanSeeMoney({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const ctx = await getWorkspaceContext();
  return <>{ctx?.canSeeMoney ? children : fallback}</>;
}
