-- Step 12: intake inbox — thread a new source onto an EXISTING brief.
-- add_brief_source() appends the immutable brief_sources row and logs a
-- 'source_added' brief_edit_history entry in ONE transaction (the /intake/inbox
-- "add a reply" server action can't do multi-table writes through PostgREST).
-- Mirrors create_brief_bundle()'s structure: SECURITY DEFINER + search_path
-- pin + explicit membership guard befogulire writing, validation on params.
-- brief_sources needs NO RLS change: its existing member INSERT policy already
-- allows this shape; this RPC exists for atomicity (source + history together),
-- not to widen access.

create or replace function public.add_brief_source(
  p_brief_id uuid,
  p_source_type text,
  p_raw_content text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  new_source_id uuid;
begin
  -- caller must belong to the workspace that owns the brief
  v_workspace_id := public.workspace_id_of_brief(p_brief_id);
  if v_workspace_id is null then
    raise exception 'brief_not_found: %', p_brief_id;
  end if;
  if not public.is_workspace_member(v_workspace_id) then
    raise exception 'not_authorized for workspace %', v_workspace_id;
  end if;

  if p_raw_content is null or btrim(p_raw_content) = '' then
    raise exception 'source_required';
  end if;
  if p_source_type not in ('email', 'call_notes', 'chat', 'manual') then
    raise exception 'bad_source_type: %', p_source_type;
  end if;

  insert into public.brief_sources (brief_id, source_type, raw_content, metadata)
  values (
    p_brief_id,
    p_source_type,
    btrim(p_raw_content),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into new_source_id;

  -- history attribution: auth.uid() = the member who threaded the reply
  insert into public.brief_edit_history (brief_id, user_id, action_type, description)
  values (
    p_brief_id,
    auth.uid(),
    'source_added',
    'added a new source (' || p_source_type || ')'
  );

  return new_source_id;
end;
$$;
