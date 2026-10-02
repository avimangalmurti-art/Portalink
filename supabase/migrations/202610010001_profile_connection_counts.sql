-- Aggregate counts only; connection identities retain their existing owner-only boundary.
create or replace function public.profile_connection_counts(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = public
as $$
  select case when public.can_view_profile(p_profile_id) then jsonb_build_object(
    'followers', (select count(*) from public.profile_follows where target_profile_id = p_profile_id and status = 'following'),
    'following', (select count(*) from public.profile_follows where follower_profile_id = p_profile_id and status = 'following')
  ) else null end;
$$;
revoke all on function public.profile_connection_counts(uuid) from public;
grant execute on function public.profile_connection_counts(uuid) to anon, authenticated;
