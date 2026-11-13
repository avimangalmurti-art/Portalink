-- PREPARED ONLY. Apply only after explicit approval, as one transaction.
begin;

grant update (then_project_id, now_project_id)
  on public.profile_timeline_pairs to authenticated;

drop policy if exists timeline_pairs_edit on public.profile_timeline_pairs;
create policy timeline_pairs_edit
  on public.profile_timeline_pairs for update to authenticated
  using (public.owns_profile(profile_id))
  with check (
    public.owns_profile(profile_id)
    and exists (
      select 1
      from public.projects p
      join public.portfolio_categories c on c.id = p.category_id and c.profile_id = p.profile_id
      where p.id = then_project_id
        and p.profile_id = profile_timeline_pairs.profile_id
        and not p.is_hidden and not c.is_hidden
    )
    and exists (
      select 1
      from public.projects p
      join public.portfolio_categories c on c.id = p.category_id and c.profile_id = p.profile_id
      where p.id = now_project_id
        and p.profile_id = profile_timeline_pairs.profile_id
        and not p.is_hidden and not c.is_hidden
    )
  );

notify pgrst, 'reload schema';
commit;
