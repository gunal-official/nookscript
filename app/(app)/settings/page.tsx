/**
 * /settings — workspace configuration. Step 11 scope: templates only
 * (title + body snippets), owner-managed, member-readable. No detail
 * routes — create/edit happen in a dialog.
 *
 * HOW TO TEST (locally — ⚠ apply the templates migration + seed first):
 *   1. Open /settings as the seeded demo user (an OWNER): two seeded
 *      templates render; New template / edit (pencil) / delete (trash)
 *      controls are visible and work (delete needs a second click to
 *      confirm inline).
 *   2. Sign up a second account and re-run seed.sql (it adds every new
 *      user as 'member'): as that user the same page shows the same
 *      templates with NO management controls and a "View only" note —
 *      RLS (is_workspace_owner) backs the UI.
 *   3. DB-level proof: npm run verify:db (member-select ✓, member-insert
 *      ✗, owner insert/update/delete ✓).
 */

import { TemplatesList } from "@/components/settings/TemplatesList";
import { WorkspaceNameCard } from "@/components/settings/WorkspaceNameCard";
import { getTemplates } from "@/lib/data/templates";
import { getWorkspaceInfo } from "@/lib/data/workspace";

export default async function SettingsPage() {
  const [templates, workspace] = await Promise.all([
    getTemplates(),
    getWorkspaceInfo(),
  ]);
  const isOwner = workspace?.role === "owner";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace configuration — name, plus reusable text snippets.
        </p>
      </div>

      {workspace && <WorkspaceNameCard name={workspace.name} isOwner={isOwner} />}
      <TemplatesList templates={templates} isOwner={isOwner} />
    </div>
  );
}
