-- Step 29: viewer role — read operational content, write nothing,
-- invisible to money. Approved spec (docs/roles-spec.md): three tiers
-- owner / member / viewer; money surface = HIDE (RLS select-level).
--
-- Mechanism: a third role value + is_workspace_editor() — the write
-- gate every content policy already expresses as membership becomes
-- "member or owner". SELECT policies stay on is_workspace_member (so
-- viewers READ operational content), except invoices / invoice_links /
-- time_entries whose selects move to is_workspace_editor (hidden).
-- Templates keep their owner-write / member-read policies untouched.

begin;

-- ── 1. Role set ───────────────────────────────────────────────────

alter table public.workspace_members
  drop constraint workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'member', 'viewer'));

-- ── 2. Write gate: membership that can edit ───────────────────────
-- SECURITY DEFINER so policies can test membership without recursively
-- querying workspace_members through its own RLS policies (sibling of
-- is_workspace_member / is_workspace_owner).

create or replace function public.is_workspace_editor(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = ws_id
       and wm.user_id = auth.uid()
       and wm.role in ('owner', 'member')
  );
$$;

comment on function public.is_workspace_editor(uuid) is
  'True when auth.uid() is an owner or member of ws_id — the content-write gate. Viewers are members but not editors.';

-- ── 3. Content write policies: member → editor ────────────────────
-- (insert → WITH CHECK; update → both; delete → USING. Names preserved.)

alter policy "briefs: members can insert" on public.briefs
  with check (public.is_workspace_editor(workspace_id));
alter policy "briefs: members can update" on public.briefs
  using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));
alter policy "briefs: members can delete" on public.briefs
  using (public.is_workspace_editor(workspace_id));

alter policy "brief_sources: members can insert" on public.brief_sources
  with check (public.is_workspace_editor(public.workspace_id_of_brief(brief_id)));
alter policy "brief_sources: members can delete" on public.brief_sources
  using (public.is_workspace_editor(public.workspace_id_of_brief(brief_id)));

alter policy "brief_questions: members can insert" on public.brief_questions
  with check (public.is_workspace_editor(public.workspace_id_of_brief(brief_id)));
alter policy "brief_questions: members can update" on public.brief_questions
  using (public.is_workspace_editor(public.workspace_id_of_brief(brief_id)))
  with check (public.is_workspace_editor(public.workspace_id_of_brief(brief_id)));
alter policy "brief_questions: members can delete" on public.brief_questions
  using (public.is_workspace_editor(public.workspace_id_of_brief(brief_id)));

alter policy "brief_edit_history: members can insert" on public.brief_edit_history
  with check (public.is_workspace_editor(public.workspace_id_of_brief(brief_id)));

alter policy "proposals: members can insert" on public.proposals
  with check (public.is_workspace_editor(workspace_id));
alter policy "proposals: members can update" on public.proposals
  using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));

alter policy "plans: members can insert" on public.plans
  with check (public.is_workspace_editor(workspace_id));
alter policy "plans: members can update" on public.plans
  using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));

alter policy "updates: members can insert" on public.updates
  with check (public.is_workspace_editor(workspace_id));
alter policy "updates: members can update" on public.updates
  using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));

alter policy "share_links: members can insert" on public.share_links
  with check (public.is_workspace_editor(workspace_id));
alter policy "share_links: members can update" on public.share_links
  using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));

alter policy "contracts: members can insert" on public.contracts
  with check (public.is_workspace_editor(workspace_id));
alter policy "contracts: members can update" on public.contracts
  using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));

alter policy "invoices: members can insert" on public.invoices
  with check (public.is_workspace_editor(workspace_id));
alter policy "invoices: members can update" on public.invoices
  using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));

alter policy "invoice_links: members can insert" on public.invoice_links
  with check (public.is_workspace_editor(workspace_id));
alter policy "invoice_links: members can update" on public.invoice_links
  using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));

alter policy "time_entries: members can insert" on public.time_entries
  with check (public.is_workspace_editor(workspace_id));
alter policy "time_entries: members can update" on public.time_entries
  using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));
alter policy "time_entries: members can delete" on public.time_entries
  using (public.is_workspace_editor(workspace_id));

-- ── 4. Money hide: viewers cannot even SELECT ─────────────────────
-- (invoice_links joins invoices; time_entries is hours. RLS is the
-- authoritative "hidden" — app walls are the friendly layer.)

alter policy "invoices: members can select" on public.invoices
  using (public.is_workspace_editor(workspace_id));
alter policy "invoice_links: members can select" on public.invoice_links
  using (public.is_workspace_editor(workspace_id));
alter policy "time_entries: members can select" on public.time_entries
  using (public.is_workspace_editor(workspace_id));

commit;
