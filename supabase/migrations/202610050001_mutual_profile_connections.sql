-- Owner and accepted mutual followers only; pending requests confer no access.
create or replace function public.can_view_profile_connections(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
 select auth.uid() is not null and (
 public.owns_profile(p_profile_id) or exists (
 select 1 from public.profile_follows outgoing
 join public.profile_follows incoming
 on incoming.follower_profile_id = outgoing.target_profile_id
 and incoming.target_profile_id = outgoing.follower_profile_id
 where outgoing.follower_account_id = auth.uid()
 and outgoing.target_profile_id = p_profile_id
 and outgoing.status = 'following' and incoming.status = 'following'
 ));
$$;
revoke all on function public.can_view_profile_connections(uuid) from public, anon;
grant execute on function public.can_view_profile_connections(uuid) to authenticated;
create policy mutual_connections_read on public.profile_follows for select to authenticated
using (status = 'following' and (
 public.can_view_profile_connections(follower_profile_id)
 or public.can_view_profile_connections(target_profile_id)
));
