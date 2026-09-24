# Roles beyond owner/member — SPEC DRAFT (awaiting sign-off)

**Status:** DRAFT — no implementation starts until this is signed off
("next" locks the RECOMMENDED package; any amendment is welcome).
Candidate **Step 29 (db+app): viewer role**.

## Ground truth (current model — verified in-repo)

- `workspace_members.role text not null default 'owner' check (role in
  ('owner', 'member'))` — `20260922000000_workspace_auth_init.sql:20`.
- **owner** (multi-owner allowed; the last owner cannot leave, be
  removed, or demoted): workspace rename + delete, invite/create/revoke
  (`team_invites` has **no role column "on purpose: invites can only
  ever grant 'member'"** — `20260923070000` line 28), remove members,
  change any OTHER member's role (incl. promoting owners), all content
  writes.
- **member**: full content writes (templates, briefs, proposals, plans,
  updates, share links, invoices, time entries, contracts, template
  positions) + leave self; no admin surface (E2E-proven "View only").
- 55 policies across 15 migration files; write policies gate on a
  membership `EXISTS (SELECT 1 FROM workspace_members …)` subquery,
  owner-only policies add `wm.role = 'owner'`.

## RECOMMENDED package: add one tier — `viewer`

Three roles total: **owner / member / viewer**. No rename of `member`
(no migration churn; UI already says "View only"). Invites stay
member-only (locked by the no-role-column design); **viewer is assigned
and revoked by an owner via the roster role menu** (the Step-22 menu
gains one option — and the Step-26 last-owner demotion guard already
extends naturally).

| Capability | owner | member | viewer |
|---|---|---|---|
| Read workspace, templates, briefs, proposals, plans, updates, invoices, time entries, contracts, roster | ✓ | ✓ | ✓ |
| Create/edit/delete templates, briefs, proposals, plans, updates, invoices, time entries, contracts; reorder | ✓ | ✓ | **✗** |
| Generate/revoke share links | ✓ | ✓ | **✗** |
| Leave workspace (self) | ✓ (not last) | ✓ | ✓ |
| Invite / revoke invites / remove members | ✓ | ✗ | ✗ |
| Change others' roles (incl. to viewer) | ✓ (not self) | ✗ | ✗ |
| Rename workspace | ✓ | ✗ | ✗ |
| Delete workspace | ✓ | ✗ | ✗ |

## DB deltas (one migration, `…_viewer_role.sql`)

1. CHECK becomes `('owner','member','viewer')` (drop + re-add).
2. Every content table's INSERT/UPDATE/DELETE policies gain `and role in
   ('owner','member')` in the membership subquery (same EXISTS shape;
   SELECT policies stay membership-only so viewers read).
3. The template-position RPC's guard rejects viewers.
4. `accept_team_invite` unchanged (grants `member` — by design).
5. No new tables → no GRANT growth beyond the altered policies'
   re-grants if any.

## App deltas

- `getWorkspaceContext` already returns `role`; add `canEdit = role !==
  'viewer'`.
- Gate every write surface (composer save/create, share generator,
  invoice composer, roster/danger/invite — the latter already
  owner-only) + a `requireEditor` guard in each server action
  (RLS stays authoritative; this is the friendly-error layer).
- Roster role menu: add "Viewer"; keep Step-22/26 copy conventions.

## Verification plan (standard trio)

- `verify:db` +~10: CHECK accepts viewer/rejects 'admin'; viewer reads
  ✓; viewer INSERT/UPDATE/DELETE templates + share_pages + invoices →
  denied (0 rows or 42501 per verb); viewer cannot reorder; owner sets
  viewer role ✓; viewer leaves ✓; Step-21/22/26/27 probes regression.
- E2E persona C (viewer): content visible, zero composer/save/share
  surface, "View only"; A's menu shows the viewer option; A/B regression.
- `verify:live:policies` +2 (owner CAN set 'viewer'; viewer template
  write denied) → 17 checks.

## Decision points (each has a recommended default)

1. **Role set** — RECOMMENDED: viewer only (3 tiers). Alternative: add
   `admin` (membership admin without delete-workspace) → 4 tiers, a real
   role-change/delete matrix; defer.
2. **Viewer money surface** — RECOMMENDED: invoices/time entries visible
   read-only ("read everything, write nothing"). Alternative: hide
   invoices + time entries + contracts from viewers (money-sensitive
   studio data).
3. **Invite role picker** — RECOMMENDED: none (viewer = roster
   assignment only; invites keep granting member — the recorded
   "no role column on purpose" design). Alternative: add a role select
   to the invite flow + a role column on `team_invites` (reverses that
   recorded decision).
4. **Naming** — RECOMMENDED: value `viewer`, display "Viewer" (menu) /
   "View only" (badge, existing copy).
