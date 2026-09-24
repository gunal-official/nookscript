/**
 * /settings — workspace configuration: name, team roster + invites
 * (Step 15) + role management (Step 22) + member removal (Step 21),
 * and templates (Step 11). Owner-managed, member-readable. No detail
 * routes — template create/edit happens in a dialog, team controls
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
 *   3. Team card (Steps 21–22): as the owner, member rows get a trash
 *      control (remove) and a crown control (promote to owner); owner
 *      rows get a demote control — but never on your own row, and never
 *      for the last owner (removal or demotion). Each opens an inline
 *      two-click confirm; the badge/roster revalidates on success.
 *      Self-changes and last-owner changes are rejected by the actions
 *      even if the UI is bypassed (and by the DB policy).
 *   4. DB-level proof: npm run verify:db (member-select ✓, member-insert
 *      ✗, owner insert/update/delete ✓ — incl. the Step 21
 *      member-cannot-delete / owner-can-delete pair and the Step 22
 *      role-change quartet).
 *   5. Invite email (Step 23, revised — plain SMTP): with SMTP_HOST,
 *      SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM set in the
 *      environment, creating an invite emails the link to the invitee
 *      through the owner's own mail account (Gmail: use an App
 *      Password); without SMTP config the flow is copy-link only with
 *      no warning; a failed send still creates the invite and shows a
 *      warning beside the copy link.
 *   6. Leave (Step 26): your own row gets a Leave control (two-click
 *      confirm) — unless you're the workspace's last owner, where it's
 *      hidden and the action + DB trigger both refuse anyway. After
 *      leaving, the shell lands on your next workspace (or /onboarding
 *      when none remain). DB-level proof: npm run verify:db (member
 *      self-delete ✓, last-owner delete ✗, pointer cleared on leave).
 *   7. Delete workspace (Step 27): owners get a Danger zone card at the
 *      bottom — two-click confirm, loud copy (everything is deleted for
 *      everyone). Members never see the card. DB-level proof: npm run
 *      verify:db (member cannot delete a workspace ✓, owner can —
 *      children cascade, active pointers cleared).
 */

import { TeamCard } from "@/components/settings/TeamCard";
import { TemplatesList } from "@/components/settings/TemplatesList";
import { WorkspaceDangerCard } from "@/components/settings/WorkspaceDangerCard";
import { WorkspaceNameCard } from "@/components/settings/WorkspaceNameCard";
import { getPendingInvites, getTeamMembers } from "@/lib/data/team";
import { getTemplates } from "@/lib/data/templates";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  // Everything on this page — name, roster, invites, templates — renders
  // for the ACTIVE workspace (Step 16); the (app) layout guarantees a
  // membership exists.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
          currentUserId={user?.id ?? null}
        />
      )}
      <TemplatesList templates={templates} isOwner={isOwner} />
      {workspace && isOwner && <WorkspaceDangerCard name={workspace.name} />}
    </div>
  );
}
