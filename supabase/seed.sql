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
