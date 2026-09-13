-- Identity needed by social activity must never grant access to private work.
begin;

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p where p.id = p_profile_id and (
      p.account_id = (select auth.uid()) or not p.is_private or exists (
        select 1 from public.profile_follows f where f.target_profile_id = p.id
          and f.follower_account_id = (select auth.uid()) and f.status = 'following'
      )
    )
  );
$$;

create or replace function public.can_view_profile_identity(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_view_profile(p_profile_id) or exists (
    select 1 from public.profile_follows f where f.follower_profile_id = p_profile_id
      and public.owns_profile(f.target_profile_id)
  ) or exists (
    select 1 from public.direct_conversations c
    where p_profile_id in (c.participant_one_profile_id, c.participant_two_profile_id)
      and (public.owns_profile(c.participant_one_profile_id) or public.owns_profile(c.participant_two_profile_id))
  ) or exists (
    select 1 from public.direct_message_blocks b
    where b.blocked_profile_id = p_profile_id and public.owns_profile(b.blocker_profile_id)
  );
$$;

-- A narrow projection: never return account IDs, private links or portfolio data.
create or replace function public.profile_identities(p_profile_ids uuid[])
returns table (id uuid, name text, handle text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.handle, p.avatar_url from public.profiles p
  where p.id = any(p_profile_ids) and (
    public.can_view_profile_identity(p.id) or exists (
      select 1 from public.project_comments c join public.projects work on work.id = c.project_id
      where c.author_profile_id = p.id
        and (public.owns_profile(work.profile_id) or (not work.is_hidden and public.can_view_profile(work.profile_id)))
    )
  );
$$;

revoke all on function public.can_view_profile_identity(uuid) from public, anon;
revoke all on function public.profile_identities(uuid[]) from public;
grant execute on function public.can_view_profile_identity(uuid) to authenticated;
grant execute on function public.profile_identities(uuid[]) to anon, authenticated;

-- Existing project, attachment, preview and storage policies continue using
-- can_view_profile: their audience is owner/public/accepted followers only.
-- Messaging keeps its separate established-chat, preference and block checks.

create or replace function public.resolve_direct_message_permission(p_conversation_id uuid)
returns public.direct_conversations language plpgsql security definer set search_path = public as $$
declare
  viewer_profile_id uuid;
  recipient_profile_id uuid;
  conversation public.direct_conversations%rowtype;
  recipient_follows_sender boolean;
  target_permission text;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  select * into conversation from public.direct_conversations where id = p_conversation_id for update;
  if viewer_profile_id is null or conversation.id is null or viewer_profile_id not in
    (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
  then raise exception 'permission denied'; end if;
  if not public.can_interact_direct_conversation(conversation.id) then raise exception 'conversation blocked'; end if;
  if conversation.established_at is not null then return conversation; end if;

  recipient_profile_id := case when conversation.participant_one_profile_id = viewer_profile_id
    then conversation.participant_two_profile_id else conversation.participant_one_profile_id end;
  if conversation.request_message_sent_at is not null and conversation.initiator_profile_id <> viewer_profile_id
  then raise exception 'accept request before replying'; end if;
  if not public.can_view_profile_identity(recipient_profile_id) then raise exception 'messages unavailable'; end if;
  select exists (select 1 from public.profile_follows follow
    where follow.follower_profile_id = recipient_profile_id and follow.target_profile_id = viewer_profile_id
      and follow.status = 'following') into recipient_follows_sender;
  select coalesce((select permission from public.messaging_preferences where profile_id = recipient_profile_id), 'requests') into target_permission;
  if not recipient_follows_sender and target_permission <> 'requests' then
    if target_permission <> 'followers' or not exists (
      select 1 from public.profile_follows follow
      where follow.follower_profile_id = viewer_profile_id and follow.target_profile_id = recipient_profile_id
        and follow.status = 'following'
    ) then raise exception 'messages unavailable'; end if;
  end if;

  update public.direct_conversations
    set status = case when recipient_follows_sender then 'active' else 'request' end,
        initiator_profile_id = case when request_message_sent_at is null then viewer_profile_id else initiator_profile_id end,
        updated_at = now()
    where id = conversation.id returning * into conversation;
  return conversation;
end;
$$;

create or replace function public.get_or_create_direct_conversation(p_other_profile_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  viewer_profile_id uuid;
  first_profile_id uuid;
  second_profile_id uuid;
  conversation public.direct_conversations%rowtype;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  if viewer_profile_id is null then raise exception 'profile required'; end if;
  if viewer_profile_id = p_other_profile_id then raise exception 'cannot message yourself'; end if;
  if not public.can_view_profile_identity(p_other_profile_id) then raise exception 'profile not found'; end if;
  if exists (select 1 from public.direct_message_blocks block where
    (block.blocker_profile_id = viewer_profile_id and block.blocked_profile_id = p_other_profile_id)
    or (block.blocker_profile_id = p_other_profile_id and block.blocked_profile_id = viewer_profile_id))
  then raise exception 'conversation blocked'; end if;
  first_profile_id := least(viewer_profile_id, p_other_profile_id);
  second_profile_id := greatest(viewer_profile_id, p_other_profile_id);
  insert into public.direct_conversations(participant_one_profile_id, participant_two_profile_id, status, initiator_profile_id)
    values (first_profile_id, second_profile_id, 'request', viewer_profile_id)
    on conflict (participant_one_profile_id, participant_two_profile_id) do nothing;
  select * into conversation from public.direct_conversations
    where participant_one_profile_id = first_profile_id and participant_two_profile_id = second_profile_id for update;
  if conversation.established_at is null and conversation.request_message_sent_at is null then
    conversation := public.resolve_direct_message_permission(conversation.id);
  end if;
  return conversation.id;
end;
$$;

-- Search only the minimal identities relevant to messaging, before pagination.
create or replace function public.search_message_identities(
  p_query text default '', p_limit integer default 30, p_offset integer default 0,
  p_conversations_only boolean default false
)
returns table (id uuid, name text, handle text, avatar_url text)
language sql stable security definer set search_path = public as $$
  with viewer as (
    select id from public.profiles where account_id = (select auth.uid())
  ), search as (
    select lower(left(trim(coalesce(p_query, '')), 80)) as term,
           coalesce(p_conversations_only, false) as conversations_only
  )
  select person.id, person.name, person.handle, person.avatar_url
  from public.profiles person cross join viewer cross join search
  where person.id <> viewer.id
    and public.can_view_profile_identity(person.id)
    and (search.term = '' or strpos(lower(person.name), search.term) > 0
         or strpos(lower(person.handle), search.term) > 0)
    and (
      (search.conversations_only and exists (
        select 1 from public.direct_conversations conversation
        where viewer.id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
          and person.id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
          and (conversation.established_at is not null or conversation.request_message_sent_at is not null
               or conversation.last_message_at is not null)
      )) or (not search.conversations_only and (search.term <> '' or exists (
        select 1 from public.profile_follows follow
        where follow.follower_profile_id = viewer.id and follow.target_profile_id = person.id
          and follow.status = 'following'
      )))
    )
    and not exists (
      select 1 from public.direct_message_blocks block
      where (block.blocker_profile_id = viewer.id and block.blocked_profile_id = person.id)
        or (not search.conversations_only and block.blocker_profile_id = person.id and block.blocked_profile_id = viewer.id)
    )
  order by person.name, person.id
  limit least(100, greatest(1, coalesce(p_limit, 30)))
  offset greatest(0, coalesce(p_offset, 0));
$$;
revoke all on function public.search_message_identities(text,integer,integer,boolean) from public, anon;
grant execute on function public.search_message_identities(text,integer,integer,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
