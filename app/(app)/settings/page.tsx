/**
 * /settings — workspace configuration: name, team roster + invites
 * (Step 15), and templates (Step 11). Owner-managed, member-readable.
 * No detail routes — template create/edit happens in a dialog, invites
 * inline on the Team card.
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

import { TeamCard } from "@/components/settings/TeamCard";
import { TemplatesList } from "@/components/settings/TemplatesList";
import { WorkspaceNameCard } from "@/components/settings/WorkspaceNameCard";
import { getPendingInvites, getTeamMembers } from "@/lib/data/team";
import { getTemplates } from "@/lib/data/templates";
import { getWorkspaceContext } from "@/lib/data/workspace-context";

export default async function SettingsPage() {
  // Everything on this page — name, roster, invites, templates — renders
  // for the ACTIVE workspace (Step 16); the (app) layout guarantees a
  // membership exists.
  const workspace = await getWorkspaceContext();
  const [templates, members, pendingInvites] = await Promise.all([
    workspace ? getTemplates(workspace.id) : Promise.resolve([]),
    getTeamMembers(),
    getPendingInvites(),
  ]);
  const isOwner = workspace?.role === "owner";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace configuration — name, team, and reusable text snippets.
        </p>
      </div>

      {workspace && <WorkspaceNameCard name={workspace.name} isOwner={isOwner} />}
      {workspace && (
        <TeamCard
          members={members}
          pendingInvites={pendingInvites}
          isOwner={isOwner}
        />
      )}
      <TemplatesList templates={templates} isOwner={isOwner} />
    </div>
  );
}
