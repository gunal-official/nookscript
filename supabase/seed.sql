-- Seed data: one realistic brief ("Brightloop Co. — Brand Identity Refresh")
-- plus a demo user who can actually log in locally.
-- Runs automatically on `supabase db reset`, or paste into the SQL Editor
-- AFTER the migrations. Idempotent (fixed UUIDs + ON CONFLICT DO NOTHING).
--
-- Demo login: maya@nookscript.dev / password123
-- Any other existing user is added to the demo workspace as a 'member', so
-- you can see the seeded brief while logged in as yourself.
--
-- ⚠ Demo data — delete before production use.

-- ── Demo user (profile row is created by the on_auth_user_created trigger) ──

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'maya@nookscript.dev',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Maya Chen"}'::jsonb,
  now(), now(), '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'maya@nookscript.dev',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"maya@nookscript.dev"}'::jsonb,
  'email', now(), now(), now()
) on conflict do nothing;

-- ── Demo workspace + memberships ──

insert into public.workspaces (id, name)
values ('00000000-0000-0000-0000-000000000002', 'Atelier North')
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'owner')
on conflict (workspace_id, user_id) do nothing;

-- Everyone else (i.e. your real signup) can also see the demo workspace.
insert into public.workspace_members (workspace_id, user_id, role)
select '00000000-0000-0000-0000-000000000002', u.id, 'member'
from auth.users u
where u.id <> '00000000-0000-0000-0000-000000000001'
on conflict (workspace_id, user_id) do nothing;

-- ── The brief ──

insert into public.briefs (
  id, workspace_id, title, objective, deliverables, budget_timeline,
  status, owner_id, client_name, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000002',
  'Brightloop Co. — Brand Identity Refresh',
  'Brightloop wants to retire their dated 2014-era logo and roll out a refreshed identity — logo, palette, and typography — across web and print before their Series A announcement in mid-November.',
  '[
    {"id": "d1", "text": "Primary logo redesign + wordmark (vector masters)", "checked": false},
    {"id": "d2", "text": "Brand palette, typography & usage guide (PDF)", "checked": false},
    {"id": "d3", "text": "Social media kit — avatars + banners for LinkedIn and X", "checked": true}
  ]'::jsonb,
  'Budget “around $8–12k, flexible if the logo lands”. Kickoff week of Sep 29; identity locked before the Nov 14 investor announcement.',
  'in_review',
  '00000000-0000-0000-0000-000000000001',
  'Brightloop Co. (contact: Priya Raman, Head of Marketing)',
  now() - interval '4 days',
  now() - interval '1 day'
) on conflict (id) do nothing;

-- ── Source: the original client email (immutable) ──

insert into public.brief_sources (id, brief_id, source_type, raw_content, metadata, created_at)
values (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000010',
  'email',
  'Hi Maya,

Great chatting yesterday. As discussed, we''d love for you to lead our brand identity refresh ahead of our Series A announcement (targeting mid-November).

What we need:
- A redesigned primary logo + wordmark (ours is from 2014 and it shows)
- A proper brand palette, typography, and usage guide
- A social media kit — avatars + banners for LinkedIn and X

Budget-wise we''re thinking around $8–12k, flexible if the logo direction lands. If possible we''d want to kick off the week of Sep 29 so the identity is locked before November 14.

One open thing: the website reskin is maybe phase 2 — depends on how the identity work goes. Not sure yet whether that should be part of this engagement.

The board prefers a minimal, warm aesthetic — nothing too "startup gradient purple", their words not mine. I''ll send the current brand assets over WeTransfer today.

Best,
Priya Raman
Head of Marketing, Brightloop Co.',
  '{"from": "priya@brightloop.co", "subject": "Brand refresh — kickoff details", "received_at": "2026-09-18T09:42:00+05:30"}'::jsonb,
  now() - interval '4 days'
) on conflict (id) do nothing;

-- ── Clarifying questions: 1 open + 2 resolved ──

insert into public.brief_questions (id, brief_id, question_text, context_note, status, created_at)
values (
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000010',
  'Does the $8–12k budget include the website reskin, or identity work only?',
  'Priya wrote the website reskin is "maybe phase 2" — scope unclear.',
  'open',
  now() - interval '4 days'
) on conflict (id) do nothing;

insert into public.brief_questions (
  id, brief_id, question_text, context_note, status, answer_text, answered_by, created_at, resolved_at
) values (
  '00000000-0000-0000-0000-000000000013',
  '00000000-0000-0000-0000-000000000010',
  'Are there any trademark or legal constraints on logo directions?',
  'Client mentioned an upcoming announcement — legal review likely.',
  'resolved',
  'None. Legal confirmed no trademark restrictions; free to explore.',
  'Priya (client)',
  now() - interval '4 days',
  now() - interval '3 days'
) on conflict (id) do nothing;

insert into public.brief_questions (
  id, brief_id, question_text, context_note, status, answer_text, answered_by, created_at, resolved_at
) values (
  '00000000-0000-0000-0000-000000000014',
  '00000000-0000-0000-0000-000000000010',
  'What final file formats should delivery include?',
  null,
  'resolved',
  'Vector masters (SVG/AI), PDF brand guide, social kit as PNG exports.',
  'Maya Chen',
  now() - interval '4 days',
  now() - interval '3 days'
) on conflict (id) do nothing;

-- ── Edit history ──

insert into public.brief_edit_history (id, brief_id, user_id, action_type, description, created_at)
values (
  '00000000-0000-0000-0000-000000000015',
  '00000000-0000-0000-0000-000000000010',
  null, -- AI-generated, not a user
  'generated',
  'generated draft brief from 1 source (email from priya@brightloop.co)',
  now() - interval '4 days'
) on conflict (id) do nothing;

insert into public.brief_edit_history (id, brief_id, user_id, action_type, description, created_at)
values (
  '00000000-0000-0000-0000-000000000016',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'status_changed',
  'status changed from draft to in_review',
  now() - interval '1 day'
) on conflict (id) do nothing;

-- ── Proposal: generated from the Brightloop brief (fields copied) ──

insert into public.proposals (
  id, workspace_id, brief_id, title, client_name, status,
  budget_timeline, deliverables, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000010',
  'Brightloop Co. — Brand Identity Refresh',
  'Brightloop Co. (contact: Priya Raman, Head of Marketing)',
  'draft',
  'Budget “around $8–12k, flexible if the logo lands”. Kickoff week of Sep 29; identity locked before the Nov 14 investor announcement.',
  '[
    {"id": "d1", "text": "Primary logo redesign + wordmark (vector masters)", "checked": false},
    {"id": "d2", "text": "Brand palette, typography & usage guide (PDF)", "checked": false},
    {"id": "d3", "text": "Social media kit — avatars + banners for LinkedIn and X", "checked": true}
  ]'::jsonb,
  now() - interval '1 day',
  now() - interval '12 hours'
) on conflict (id) do nothing;

-- ── Plan: generated from the Brightloop proposal (deliverables → tasks) ──

insert into public.plans (
  id, workspace_id, proposal_id, title, client_name, status,
  budget_timeline, tasks, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000020',
  'Brightloop Co. — Brand Identity Refresh',
  'Brightloop Co. (contact: Priya Raman, Head of Marketing)',
  'not_started',
  'Budget “around $8–12k, flexible if the logo lands”. Kickoff week of Sep 29; identity locked before the Nov 14 investor announcement.',
  '[
    {"id": "d1", "text": "Primary logo redesign + wordmark (vector masters)", "checked": false},
    {"id": "d2", "text": "Brand palette, typography & usage guide (PDF)", "checked": false},
    {"id": "d3", "text": "Social media kit — avatars + banners for LinkedIn and X", "checked": true}
  ]'::jsonb,
  now() - interval '12 hours',
  now() - interval '6 hours'
) on conflict (id) do nothing;

-- ── Updates: two client updates composed from the Brightloop plan ──
-- One older 'sent' + one recent 'draft', so the list demonstrates both
-- status tabs and recency ordering (updated_at desc).

insert into public.updates (
  id, workspace_id, plan_id, title, client_name, status, body, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000030',
  'Update — Week 1: kickoff & discovery',
  'Brightloop Co. (contact: Priya Raman, Head of Marketing)',
  'sent',
  '**Progress:** 1 of 3 tasks done.

Hi Priya — great first week. We kicked off on schedule and the social media kit is already through, since the assets were straightforward to adapt from your current brand.

- [ ] Primary logo redesign + wordmark (vector masters)
- [ ] Brand palette, typography & usage guide (PDF)
- [x] Social media kit — avatars + banners for LinkedIn and X

Next week: first logo directions for the board''s minimal, warm aesthetic.',
  now() - interval '7 days',
  now() - interval '6 days'
) on conflict (id) do nothing;

insert into public.updates (
  id, workspace_id, plan_id, title, client_name, status, body, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000030',
  'Update — Week 2: logo directions',
  'Brightloop Co. (contact: Priya Raman, Head of Marketing)',
  'draft',
  '**Progress:** 1 of 3 tasks done.

Hi Priya — two logo directions are ready for review: a “wordmark-forward” minimal route and a warmer geometric mark. Both avoid the gradient look the board flagged.

- [ ] Primary logo redesign + wordmark (vector masters)
- [ ] Brand palette, typography & usage guide (PDF)
- [x] Social media kit — avatars + banners for LinkedIn and X

Still on track for identity lock before Nov 14.',
  now() - interval '1 day',
  now() - interval '3 hours'
) on conflict (id) do nothing;

-- ── Share link: public link for the "Week 1" sent update ──
-- Token is deterministic so local manual testing has a stable URL:
--   http://localhost:3000/share/00000000-0000-0000-0000-000000000051

insert into public.share_links (
  id, workspace_id, update_id, token, revoked_at, created_at
) values (
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000051',
  null,
  now() - interval '6 days'
) on conflict (id) do nothing;

-- ── Templates: two reusable snippets for the demo workspace ──

insert into public.templates (id, workspace_id, title, body, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000060',
  '00000000-0000-0000-0000-000000000002',
  'Intake follow-up — missing scope',
  'Hi there,

Thanks for the details so far! Before I draft the brief, could you clarify:
- Which deliverables are must-haves vs nice-to-haves for this phase?
- Is the budget figure a cap or a starting point?
- Any hard deadline I should plan around?

Once I have those, I''ll send the structured brief for review.

Best,
Maya',
  now() - interval '3 days',
  now() - interval '3 days'
) on conflict (id) do nothing;

insert into public.templates (id, workspace_id, title, body, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000002',
  'Weekly update sign-off',
  'That''s everything for this week — full task list above. Hit reply with any questions or priorities for next week; otherwise I''ll keep rolling on the current plan.

Best,
Maya',
  now() - interval '2 days',
  now() - interval '2 days'
) on conflict (id) do nothing;

-- ── Follow-up source: Priya''s reply threaded onto the same brief ──
-- Demonstrates 1:many brief_sources threading + the /intake/inbox view.
-- Dated AFTER the original …0011 email (−2 days vs −4).

insert into public.brief_sources (id, brief_id, source_type, raw_content, metadata, created_at)
values (
  '00000000-0000-0000-0000-000000000054',
  '00000000-0000-0000-0000-000000000010',
  'email',
  'Hi Maya,

Thanks for the quick brief — the deliverables list matches exactly what I had in mind, and the open questions are fair ones.

On the website reskin: let''s officially keep it OUT of scope for this phase. If the identity lands well we''ll scope phase two separately in December. So please treat "web reskin" as a maybe-later note, not a deliverable.

One small add — can you include an email signature refresh in the palette/typography guide? The sales team keeps asking.

Best,
Priya Raman
Head of Marketing, Brightloop Co.',
  '{"from": "priya@brightloop.co", "subject": "Re: Brand refresh — kickoff details", "received_at": "2026-09-20T15:08:00+05:30"}'::jsonb,
  now() - interval '2 days'
) on conflict (id) do nothing;

-- …and the audit entry the add_brief_source() RPC would have written for it
-- (same action_type + description shape the RPC generates).

insert into public.brief_edit_history (id, brief_id, user_id, action_type, description, created_at)
values (
  '00000000-0000-0000-0000-000000000017',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'source_added',
  'added a new source (email)',
  now() - interval '2 days'
) on conflict (id) do nothing;

-- ── Second workspace for Maya (Step 16): proves the workspace switcher ──
-- Membership ONLY — deliberately zero product rows, so switching to it
-- shows empty states and every count-based check elsewhere is untouched.

insert into public.workspaces (id, name)
values ('00000000-0000-0000-0000-000000000064', 'Harbor Lane Studio')
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
values ('00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000001', 'owner')
on conflict (workspace_id, user_id) do nothing;

-- ── Team invite: a PENDING invite on the demo workspace (Step 15) ──
-- Token is deterministic so local manual testing has a stable URL:
--   http://localhost:3000/invite/00000000-0000-0000-0000-000000000063
-- Accept it by creating the account teammate@brightloop.co (any password)
-- via that link — or watch the email-mismatch guard by opening it while
-- logged in as maya@nookscript.dev. "on conflict do nothing" (no target)
-- so a re-run survives both the id and the pending-email unique index.

insert into public.team_invites (
  id, workspace_id, email, token, invited_by, expires_at, created_at
) values (
  '00000000-0000-0000-0000-000000000062',
  '00000000-0000-0000-0000-000000000002',
  'teammate@brightloop.co',
  '00000000-0000-0000-0000-000000000063',
  '00000000-0000-0000-0000-000000000001',
  now() + interval '14 days',
  now() - interval '1 day'
) on conflict do nothing;

-- ── Invoices (Step 17): one draft + one sent on the demo workspace ──
-- INV-0001 (draft) and INV-0002 (sent) prove the list's status tabs and
-- the per-workspace number sequence. The two link rows prove the public
-- view's rules with stable, demoable tokens:
--   * …0070 (→ INV-0002, sent)  → the public page RENDERS:
--       http://localhost:3000/invoice/00000000-0000-0000-0000-000000000070
--   * …0069 (→ INV-0001, draft) → the SAME page shows the "unavailable"
--     state even though the token is valid (drafts are never shared —
--     indistinguishable from an invalid link, by design)

insert into public.invoices (
  id, workspace_id, invoice_number, client_name, title, status,
  items, tax_percent, notes, due_date, sent_at, paid_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000065',
  '00000000-0000-0000-0000-000000000002',
  1,
  'Brightloop Co.',
  'Brand refresh — phase one',
  'draft',
  '[{"id": "inv1-item-1", "description": "Brand discovery & audit", "quantity": 1, "unit_amount_cents": 75000},
    {"id": "inv1-item-2", "description": "Visual identity concepts (initial round)", "quantity": 1, "unit_amount_cents": 120000}]'::jsonb,
  0,
  '',
  now() + interval '7 days',
  null,
  null,
  now() - interval '3 days',
  now() - interval '3 days'
) on conflict (id) do nothing;

insert into public.invoices (
  id, workspace_id, invoice_number, client_name, title, status,
  items, tax_percent, notes, due_date, sent_at, paid_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000066',
  '00000000-0000-0000-0000-000000000002',
  2,
  'Brightloop Co.',
  'Brand refresh — phase two: rollout & templates',
  'sent',
  '[{"id": "inv2-item-1", "description": "Brand rollout — web & social templates", "quantity": 1, "unit_amount_cents": 240000},
    {"id": "inv2-item-2", "description": "Usage guide & asset handoff", "quantity": 1, "unit_amount_cents": 60000}]'::jsonb,
  5.00,
  'Net 14 — please pay within 14 days of the due date.',
  now() + interval '10 days',
  now() - interval '4 days',
  null,
  now() - interval '5 days',
  now() - interval '4 days'
) on conflict (id) do nothing;

insert into public.invoice_links (
  id, workspace_id, invoice_id, token, revoked_at, created_at
) values (
  '00000000-0000-0000-0000-000000000067',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000065',
  '00000000-0000-0000-0000-000000000069',
  null,
  now() - interval '3 days'
) on conflict (id) do nothing;

insert into public.invoice_links (
  id, workspace_id, invoice_id, token, revoked_at, created_at
) values (
  '00000000-0000-0000-0000-000000000068',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000066',
  '00000000-0000-0000-0000-000000000070',
  null,
  now() - interval '4 days'
) on conflict (id) do nothing;

-- ── Time entries (Step 18): four rows on the demo workspace ──
-- Three are attributed to the Brightloop brief (…0010), one is general
-- (brief_id null) — together they prove the brief filter, the "general"
-- bucket, and the per-day grouping in the log. One row lands on TODAY
-- (…0072) so the "Today" group + today total are visible on first open.
-- Total: 505 min (8h 25m) over the last three days.

insert into public.time_entries (
  id, workspace_id, brief_id, description, worked_on, duration_minutes,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000071',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000010',
  'Kickoff — discovery call + brand audit notes',
  now() - interval '1 day',
  135,
  now() - interval '1 day',
  now() - interval '1 day'
) on conflict (id) do nothing;

insert into public.time_entries (
  id, workspace_id, brief_id, description, worked_on, duration_minutes,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000072',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000010',
  'Concept exploration — first visual directions',
  now(),
  220,
  now(),
  now()
) on conflict (id) do nothing;

insert into public.time_entries (
  id, workspace_id, brief_id, description, worked_on, duration_minutes,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000073',
  '00000000-0000-0000-0000-000000000002',
  null,
  'Portfolio refresh + client outreach',
  now() - interval '2 days',
  60,
  now() - interval '2 days',
  now() - interval '2 days'
) on conflict (id) do nothing;

insert into public.time_entries (
  id, workspace_id, brief_id, description, worked_on, duration_minutes,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000074',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000010',
  'Phase-two proposal polish',
  now() - interval '3 days',
  90,
  now() - interval '3 days',
  now() - interval '3 days'
) on conflict (id) do nothing;
