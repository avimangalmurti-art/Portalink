begin;

-- Keep raw follow rows subject to the original RLS policies. The API exposes
-- only a paginated identity projection for accepted edges of a public profile.
create function portalink_private.public_profile_connections(
  p_profile_id uuid, p_kind text, p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  start_offset integer := greatest(coalesce(p_offset, 0), 0);
  page_size constant integer := 54;
begin
  if (select auth.uid()) is null
    or (select auth.jwt()->>'is_anonymous') = 'true'
    or not (select public.is_account_session_active()) then
    raise exception 'Sign in to view profile connections.' using errcode = '42501';
  end if;

  if p_kind is null or p_kind not in ('followers', 'following') then
    raise exception 'Choose followers or following.' using errcode = '22023';
  end if;

  return (
    with accepted_connections as (
      select follow.follower_profile_id as person_id, follow.created_at
      from public.profile_follows follow
      where p_kind = 'followers'
        and follow.target_profile_id = p_profile_id
        and follow.status = 'following'
      union all
      select follow.target_profile_id as person_id, follow.created_at
      from public.profile_follows follow
      where p_kind = 'following'
        and follow.follower_profile_id = p_profile_id
        and follow.status = 'following'
    ),
    page as (
      select person_id, created_at
      from accepted_connections
      order by created_at desc, person_id
      limit page_size offset start_offset
    ),
    totals as (
      select count(*) as total from accepted_connections
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object('profileId', person.id, 'name', person.name, 'avatar', coalesce(person.avatar_url, ''))
          order by page.created_at desc, page.person_id
        )
        from page
        join public.profiles person on person.id = page.person_id
        where public.can_view_profile_identity(person.id)
      ), '[]'::jsonb),
      'total', totals.total,
      'nextOffset', case when start_offset::bigint + page_size < totals.total then start_offset::bigint + page_size end
    )
    from totals
    where exists (select 1 from public.profiles profile where profile.id = p_profile_id and not profile.is_private)
  );
end;
$$;

revoke all on function portalink_private.public_profile_connections(uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function portalink_private.public_profile_connections(uuid, text, integer) to authenticated;

create function public.public_profile_connections(p_profile_id uuid, p_kind text, p_offset integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select portalink_private.public_profile_connections(p_profile_id, p_kind, p_offset);
$$;

revoke all on function public.public_profile_connections(uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.public_profile_connections(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
