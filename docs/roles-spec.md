# Roles beyond owner/member — SPEC (approved with amendment, 2026-09-25)

**Status:** APPROVED — "viewer only, no admin" + **money surface = HIDE**.
Implemented as **Step 29 (db+app): viewer role**. One correction to the
draft's matrix is recorded below (templates were misstated) — flagged to
the approver, not silently changed.

## Locked decisions

1. **Role set:** three tiers — `owner` / `member` / `viewer`. No admin
   tier (deferred).
2. **Money surface — HIDE:** viewers get **zero visibility** into
   `invoices`, `invoice_links`, and `time_entries` — enforced in RLS at
   the SELECT policy (not just write gating). Operational content —
   briefs, proposals, plans, updates, contracts, templates, roster —
   stays visible read-only. Matches viewer use cases (clients /
   stakeholders who must not see financials or tracked hours).
3. **Invite picker:** none. Invites keep granting `member` (the recorded
   `team_invites` "no role column on purpose" design). `viewer` is
   assigned/revoked by an owner via the roster role control.
4. **Naming:** value `viewer`; display "Viewer" (role menu) /
   "View only" (badge + existing card copy).

## Power matrix (CORRECTED — see the templates row)

| Capability | owner | member | viewer |
|---|---|---|---|
| Read briefs, proposals, plans, updates, contracts, templates, roster | ✓ | ✓ | ✓ |
| Read invoices, invoice_links, time entries (money) | ✓ | ✓ | **✗ hidden** |
| Create/edit/delete briefs (sources/questions/history), proposals, plans, updates, contracts | ✓ | ✓ | **✗** |
| Create/revoke share links | ✓ | ✓ | **✗** |
| Create/edit invoices + invoice links; log/edit/delete time | ✓ | ✓ | **✗** |
| **Templates: create/edit/delete** | ✓ | **✗** | **✗** |
| Templates: read | ✓ | ✓ | ✓ |
| Leave workspace (self) | ✓ (not last owner) | ✓ | ✓ |
| Invite / revoke invites / remove members | ✓ | ✗ | ✗ |
| Change others' roles (incl. to viewer) | ✓ (not self) | ✗ | ✗ |
| Rename / delete workspace | ✓ | ✗ | ✗ |

> **Draft correction (flagged):** the sign-off draft said members create
> /edit/delete templates. Ground truth: templates are **owner-managed** —
> RLS `templates: owners can insert/update/delete`
> (`20260923040000_templates_schema.sql`) + the action guard "Only
> workspace owners can manage templates." Members (and now viewers) READ
> templates (e.g. UpdateComposer's template insert). The corrected row
> matches the product's recorded copy ("View only — owners manage
> these."). Viewer template visibility per the approval is unchanged
> (read ✓).

## DB deltas — `supabase/migrations/20260925220000_viewer_role.sql`

1. `workspace_members_role_check` → `('owner','member','viewer')`.
2. New `public.is_workspace_editor(ws_id uuid)` (SECURITY DEFINER,
   `search_path = ''`, sibling of `is_workspace_member/owner`): membership
   with `role in ('owner','member')`.
3. Every **content write** policy switches to `is_workspace_editor`:
   briefs (ins/upd/del), brief_sources (ins/del), brief_questions
   (ins/upd/del), brief_edit_history (ins), proposals (ins/upd), plans
   (ins/upd), updates (ins/upd), share_links (ins/upd), contracts
   (ins/upd), invoices (ins/upd), invoice_links (ins/upd), time_entries
   (ins/upd/del).
4. **Money hide:** `invoices`/`invoice_links`/`time_entries` **select**
   policies switch to `is_workspace_editor` too.
5. Templates policies unchanged (already owner-write / member-read).
   No RPC changes (template ordering is a plain `templates` UPDATE —
   covered by its owner policy; the draft's "position RPC" never existed).

## App deltas

- `WorkspaceContext.role` gains `| "viewer"` plus derived
  `canEdit` / `canSeeMoney` (`role !== "viewer"`) and a shared
  `VIEW_ONLY_ERROR` copy.
- Every content write action (briefs ×3, contracts ×3, intake ×3,
  invoices ×6, plans ×3, proposals ×2, time ×3, updates ×1) short-circuits
  with `VIEW_ONLY_ERROR` for viewers (RLS stays the final gate). Template
  + admin actions already owner-gate (viewer blocked).
- Sidebar hides **Invoices** + **Time** for viewers; the layout's
  `TimeTimer` (time tracking = money) hides too; the three money pages
  (invoices, invoice detail, time) render a "View only" wall before any
  data fetch.
- Roster role control (owner-only) becomes 3-way with the Step-22
  two-click confirm; viewer badge shows "View only". The Step-26
  last-owner demotion guard covers demotes **to any non-owner role**.
- Write chrome (composers, generate/share buttons, status selects →
  read badges) hides for viewers on operational pages.

## Verification (standard trio)

- `verify:db` +12 probes: CHECK accepts `viewer` / rejects `admin`;
  viewer reads operational content ✓ (briefs, proposals, contracts,
  templates); viewer content writes denied (insert → 42501, update /
  delete → 0 rows); **viewer money SELECTs return 0 rows (invoices +
  time entries)**; member writes + member/owner money reads regression.
- E2E (scratch, stub-PostgREST): persona C viewer — sidebar money links
  absent, `/invoices` + `/time` walls, roster badge "View only", zero
  composer/share surface on an update page, leave visible; A's roster
  role control offers "Viewer"; A/B regression.
- `verify:live:policies` → **18 checks** (+owner CAN set `viewer`,
  +viewer template write denied, +viewer money SELECT hidden). Contract
  re-proof: baseline + drift negatives.
