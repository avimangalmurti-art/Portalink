-- A private bookmark of a creator, independent of the follow graph.
begin;

create table public.creator_saves (
  account_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, profile_id)
);
create index creator_saves_profile_idx on public.creator_saves(profile_id);
alter table public.creator_saves enable row level security;
revoke all on public.creator_saves from anon, authenticated;
grant select, insert, delete on public.creator_saves to authenticated;

-- A creator cannot enumerate the accounts that saved them.
create policy creator_saves_read_own on public.creator_saves
  for select to authenticated using (account_id = (select auth.uid()));
create policy creator_saves_insert_own on public.creator_saves
  for insert to authenticated with check (
    account_id = (select auth.uid())
    and not public.owns_profile(profile_id)
    and public.can_view_profile(profile_id)
  );
-- Removing a bookmark remains possible after the profile becomes inaccessible.
create policy creator_saves_delete_own on public.creator_saves
  for delete to authenticated using (account_id = (select auth.uid()));

create function public.set_creator_save(p_profile_id uuid, p_saved boolean)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in to save a creator.'; end if;
  if p_saved is null then raise exception 'A saved state is required.'; end if;
  if p_saved then
    if public.owns_profile(p_profile_id) then raise exception 'You cannot save your own profile.'; end if;
    if not public.can_view_profile(p_profile_id) then raise exception 'This profile is unavailable.'; end if;
    insert into public.creator_saves(account_id, profile_id)
      values (auth.uid(), p_profile_id) on conflict do nothing;
  else
    delete from public.creator_saves where account_id = auth.uid() and profile_id = p_profile_id;
  end if;
  return p_saved;
end;
$$;
revoke all on function public.set_creator_save(uuid, boolean) from public, anon;
grant execute on function public.set_creator_save(uuid, boolean) to authenticated;

-- Only aggregate current counts for the signed-in creator. No caller-supplied
-- owner, saver identities, public counter, follow mutation, or ranking signal.
create function public.creator_save_insights()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare owner_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to view your insights.'; end if;
  select id into owner_id from public.profiles where account_id = auth.uid();
  if owner_id is null then raise exception 'Create a profile to view your insights.'; end if;
  return jsonb_build_object(
    'creatorSaves', (select count(*) from public.creator_saves where profile_id = owner_id),
    'projectSaves', (select count(*) from public.project_engagement e
      join public.projects p on p.id = e.project_id
      where p.profile_id = owner_id and e.kind = 'save' and e.account_id <> auth.uid()),
    'followers', (select count(*) from public.profile_follows
      where target_profile_id = owner_id and status = 'following')
  );
end;
$$;
revoke all on function public.creator_save_insights() from public, anon;
grant execute on function public.creator_save_insights() to authenticated;
commit;
