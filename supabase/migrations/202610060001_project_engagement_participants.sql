-- Public participant summaries for visible projects. Existing profile privacy is preserved.
begin;
create or replace function public.project_engagement_participants(p_project_id uuid, p_kind text, p_offset integer default 0)
returns table(profile_id uuid, name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select actor.id, actor.name, actor.avatar_url
  from public.project_engagement e
  join public.profiles actor on actor.account_id = e.account_id
  join public.projects p on p.id = e.project_id
  join public.portfolio_categories c on c.id = p.category_id and c.profile_id = p.profile_id
  where p.id = p_project_id and e.kind = p_kind and p_kind in ('like','save','repost')
    and (public.owns_profile(p.profile_id) or (not p.is_hidden and not c.is_hidden and public.can_view_profile(p.profile_id)))
    and public.can_view_profile(actor.id)
  order by e.created_at desc, actor.id
  limit 30 offset greatest(0, least(coalesce(p_offset, 0), 10000));
$$;
revoke all on function public.project_engagement_participants(uuid,text,integer) from public;
grant execute on function public.project_engagement_participants(uuid,text,integer) to anon, authenticated;
commit;
