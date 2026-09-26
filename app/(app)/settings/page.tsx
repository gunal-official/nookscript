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

import { CheckoutNotice } from "@/components/settings/CheckoutNotice";
import { getPricesConfig } from "@/lib/stripe";
import { EventsCard } from "@/components/settings/EventsCard";
import { PlanCard } from "@/components/settings/PlanCard";
import { WebhooksCard } from "@/components/settings/WebhooksCard";
import { TeamCard } from "@/components/settings/TeamCard";
import { TemplatesList } from "@/components/settings/TemplatesList";
import { WorkspaceDangerCard } from "@/components/settings/WorkspaceDangerCard";
import { WorkspaceNameCard } from "@/components/settings/WorkspaceNameCard";
import { getPendingInvites, getTeamMembers } from "@/lib/data/team";
import { getTemplates } from "@/lib/data/templates";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import { DocHeader } from "@/components/ui/doc-detail";
import { Settings as SettingsIcon } from "lucide-react";

export default async function SettingsPage() {
  // Everything on this page — name, roster, invites, templates — renders
  // for the ACTIVE workspace (Step 16); the (app) layout guarantees a
  // membership exists.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspace = await getWorkspaceContext();
  const [
    templates,
    members,
    pendingInvites,
    webhookEndpoints,
    billing,
    webhookDeliveries,
    recentEvents,
  ] = await Promise.all([
      workspace ? getTemplates(workspace.id) : Promise.resolve([]),
      getTeamMembers(),
      getPendingInvites(),
      workspace
        ? supabase
            .from("webhook_endpoints")
            .select("id, url, signing_secret, created_at")
            .eq("workspace_id", workspace.id)
            .order("created_at", { ascending: true })
            .then(({ data }) => data ?? [])
        : Promise.resolve([]),
      workspace
        ? supabase
            .from("billing_subscriptions")
            .select("status, currency, amount")
            .eq("workspace_id", workspace.id)
            .maybeSingle()
            .then(({ data }) => data)
        : Promise.resolve(null),
      // Delivery audit rows for the Webhooks card (suggestions pass 1/10).
      // Owners read them; RLS yields [] for members (the card's "View only"
      // precedent — nothing is rendered for non-owners).
      workspace
        ? supabase
            .from("webhook_deliveries")
            .select(
              "id, endpoint_id, event_id, status, attempts, last_error, created_at, updated_at"
            )
            .eq("workspace_id", workspace.id)
            .order("updated_at", { ascending: false })
            .limit(50)
            .then(({ data }) => data ?? [])
        : Promise.resolve([]),
      // The 25 newest events feed the Activity card (suggestions pass
      // 8/10) AND the delivery log's event_type annotations (1/10) —
      // one read serves both.
      workspace
        ? supabase
            .from("events")
            .select("id, event_type, payload, created_at")
            .eq("workspace_id", workspace.id)
            .order("created_at", { ascending: false })
            .limit(25)
            .then(({ data }) => data ?? [])
        : Promise.resolve([]),
    ]);

  // event_id → event_type for the delivery log lines: the recent-25
  // window covers almost everything; one scoped top-up read annotates
  // older deliveries that predate it.
  const eventTypes: Record<string, string> = {};
  for (const e of recentEvents) eventTypes[e.id] = e.event_type;
  const missingDeliveryEventIds = [
    ...new Set(
      webhookDeliveries
        .map((d: { event_id: string }) => d.event_id)
        .filter((id: string) => !eventTypes[id])
    ),
  ];
  if (missingDeliveryEventIds.length > 0) {
    const { data: extra } = await supabase
      .from("events")
      .select("id, event_type")
      .in("id", missingDeliveryEventIds);
    for (const row of extra ?? []) eventTypes[row.id] = row.event_type;
  }
  const plan = billing?.status === "active" ? "pro" : "free";
  const pricesConfig = getPricesConfig();
  const prices = pricesConfig.ok ? pricesConfig.prices : [];
  const billingConfigured =
    Boolean(process.env.STRIPE_SECRET_KEY) && pricesConfig.ok;
  const isOwner = workspace?.role === "owner";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* One-time toast when returning from Stripe Checkout (?checkout=) */}
      <CheckoutNotice />
      <DocHeader
        icon={SettingsIcon}
        title="Settings"
        subtitle="Workspace configuration — name, team, reusable text snippets, and your plan."
      />

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
      <PlanCard
        memberCount={members.length}
        templateCount={templates.length}
        plan={plan}
        billingConfigured={billingConfigured}
        prices={prices}
        billing={billing}
      />
      <WebhooksCard
        endpoints={webhookEndpoints}
        deliveries={webhookDeliveries}
        eventTypes={eventTypes}
        isOwner={isOwner}
      />
      <EventsCard events={recentEvents} />
      {workspace && isOwner && <WorkspaceDangerCard name={workspace.name} />}
    </div>
  );
}
