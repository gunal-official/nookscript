-- Step 4: intake support — atomic brief-bundle creation.
-- create_brief_bundle() writes the brief row, the immutable source row, the
-- extracted open questions, and the 'generated' history entry in ONE
-- transaction (used by the /intake "Generate" server action, which cannot
-- do multi-table transactions through PostgREST).

create or replace function public.create_brief_bundle(
  p_workspace_id uuid,
  p_title text,
  p_objective text,
  p_deliverables jsonb,
  p_budget_timeline text,
  p_client_name text,
  p_owner_id uuid,
  p_source_type text,
  p_raw_content text,
  p_source_metadata jsonb,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_brief_id uuid;
begin
  -- caller must belong to the target workspace
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not_authorized for workspace %', p_workspace_id;
  end if;
  if p_raw_content is null or btrim(p_raw_content) = '' then
    raise exception 'source_required';
  end if;
  if p_source_type not in ('email', 'call_notes', 'chat', 'manual') then
    raise exception 'bad_source_type: %', p_source_type;
  end if;

  insert into public.briefs (
    workspace_id, title, objective, deliverables, budget_timeline,
    client_name, owner_id, status
  )
  values (
    p_workspace_id,
    coalesce(nullif(btrim(p_title), ''), 'Untitled brief'),
    p_objective,
    coalesce(p_deliverables, '[]'::jsonb),
    p_budget_timeline,
    p_client_name,
    p_owner_id,
    'draft'
  )
  returning id into new_brief_id;

  insert into public.brief_sources (brief_id, source_type, raw_content, metadata)
  values (
    new_brief_id,
    p_source_type,
    p_raw_content,
    coalesce(p_source_metadata, '{}'::jsonb)
  );

  if p_questions is not null and jsonb_typeof(p_questions) = 'array' then
    insert into public.brief_questions (brief_id, question_text, context_note)
    select new_brief_id, q.question_text, q.context_note
      from jsonb_to_recordset(p_questions) as q(question_text text, context_note text)
     where q.question_text is not null and btrim(q.question_text) <> '';
  end if;

  insert into public.brief_edit_history (brief_id, user_id, action_type, description)
  values (
    new_brief_id,
    null, -- AI/system actor
    'generated',
    'generated draft brief from pasted source (' || p_source_type || ')'
  );

  return new_brief_id;
end;
$$;
