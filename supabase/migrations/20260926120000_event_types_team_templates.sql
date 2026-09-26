-- Phase: events/webhooks foundation — grow the event vocabulary with the
-- team + template transitions (suggestions pass 9/10).
--
-- DESIGN DECISIONS (locked):
--   * The event_type CHECK constraint grows 6 → 10 types, replaced in
--     place (drop every check constraint bound to the event_type column,
--     then re-add). Same rule as the foundation: new event types land by
--     migration, never by loosening the constraint.
--   * The four new types and where they are recorded (server action,
--     acting user, app layer — the same pattern as the original six):
--       team.member.joined  — app/invite/actions.ts
--                             (acceptTeamInviteAction; workspace_id is
--                             the uuid the accept_team_invite() RPC
--                             already returns)
--       team.member.left    — app/(app)/settings/team-actions.ts
--                             (leaveWorkspaceAction)
--       team.member.removed — app/(app)/settings/team-actions.ts
--                             (removeMemberAction)
--       template.created    — app/(app)/settings/actions.ts
--                             (createTemplate)
--   * Payloads stay id + title level: team events carry only user_id;
--     template.created carries template_id + title.
--   * Role changes (promote/demote) are deliberately NOT events:
--     membership + role is live state; the audit there is
--     workspace_members' own history (no event noise on every
--     promotion).

do $$
declare
  c record;
  event_type_oid int;
begin
  select a.attnum
    into event_type_oid
    from pg_attribute a
   where a.attrelid = 'public.events'::regclass
     and a.attname = 'event_type';

  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.events'::regclass
       and con.contype = 'c'
       and event_type_oid = any (con.conkey)
  loop
    execute format('alter table public.events drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.events
  add constraint events_event_type_check
  check (event_type in (
    'brief.created',
    'proposal.accepted',
    'proposal.declined',
    'plan.task_completed',
    'invoice.paid',
    'contract.signed',
    'team.member.joined',
    'team.member.left',
    'team.member.removed',
    'template.created'
  ));
