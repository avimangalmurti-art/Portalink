-- A draft never grants permission. Followed senders and established chats
-- go to Chats; other first messages require the recipient's request setting.
begin;

alter table public.direct_conversations add column if not exists established_at timestamptz;

-- Preserve real active histories, including accepted requests later unsent.
-- An empty legacy row without either kind of evidence remains a draft.
update public.direct_conversations conversation
set established_at = coalesce(conversation.request_message_sent_at,
  (select min(message.created_at) from public.direct_messages message where message.conversation_id = conversation.id))
where conversation.status = 'active' and conversation.established_at is null
  and (conversation.request_message_sent_at is not null or exists (
    select 1 from public.direct_messages message where message.conversation_id = conversation.id));

update public.direct_conversations set status = 'request'
where established_at is null and request_message_sent_at is null
  and not exists (select 1 from public.direct_messages message where message.conversation_id = direct_conversations.id);

update public.messaging_preferences
set permission = case when permission = 'everyone' then 'requests' else 'following' end,
    updated_at = now()
where permission in ('everyone', 'nobody');
alter table public.messaging_preferences drop constraint if exists messaging_preferences_permission_check;
alter table public.messaging_preferences add constraint messaging_preferences_permission_check
  check (permission in ('requests', 'following'));

-- Internal helper; only guarded RPCs can call it. It locks the pair and uses
-- the recipient's current preference and recipient -> sender follow direction.
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
  if not public.can_view_profile(recipient_profile_id) then raise exception 'messages unavailable'; end if;
  select exists (select 1 from public.profile_follows follow
    where follow.follower_profile_id = recipient_profile_id and follow.target_profile_id = viewer_profile_id
      and follow.status = 'following') into recipient_follows_sender;
  select coalesce((select permission from public.messaging_preferences where profile_id = recipient_profile_id), 'requests') into target_permission;
  if not recipient_follows_sender and target_permission <> 'requests' then raise exception 'messages unavailable'; end if;

  update public.direct_conversations
    set status = case when recipient_follows_sender then 'active' else 'request' end,
        initiator_profile_id = case when request_message_sent_at is null then viewer_profile_id else initiator_profile_id end,
        updated_at = now()
    where id = conversation.id returning * into conversation;
  return conversation;
end;
$$;
revoke all on function public.resolve_direct_message_permission(uuid) from public, anon, authenticated;

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
  if not public.can_view_profile(p_other_profile_id) then raise exception 'profile not found'; end if;
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

create or replace function public.accept_direct_message_request(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare viewer_profile_id uuid; conversation public.direct_conversations%rowtype;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  select * into conversation from public.direct_conversations where id = p_conversation_id for update;
  if viewer_profile_id is null or conversation.id is null or viewer_profile_id not in
    (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
  then raise exception 'permission denied'; end if;
  if not public.can_interact_direct_conversation(p_conversation_id) then raise exception 'conversation blocked'; end if;
  if conversation.initiator_profile_id = viewer_profile_id then raise exception 'requester cannot accept own request'; end if;
  if conversation.established_at is not null then return; end if;
  if conversation.request_message_sent_at is null then raise exception 'no message request to accept'; end if;
  update public.direct_conversations set status = 'active', established_at = now(), updated_at = now()
    where id = p_conversation_id;
  insert into public.direct_conversation_states(conversation_id, profile_id, archived_at)
    values (p_conversation_id, viewer_profile_id, null)
    on conflict (conversation_id, profile_id) do update set archived_at = null, updated_at = now();
end;
$$;

-- Delete dismisses this recipient's request, without destroying either history
-- or lifting the sender's one-request limit. Blocking is a separate action.
create or replace function public.delete_direct_message_request(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare viewer_profile_id uuid; conversation public.direct_conversations%rowtype;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  select * into conversation from public.direct_conversations where id = p_conversation_id for update;
  if viewer_profile_id is null or conversation.id is null or viewer_profile_id not in
    (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
  then raise exception 'permission denied'; end if;
  if conversation.status <> 'request' or conversation.initiator_profile_id = viewer_profile_id
    or conversation.request_message_sent_at is null then raise exception 'no incoming message request'; end if;
  insert into public.direct_conversation_states(conversation_id, profile_id, archived_at)
    values (p_conversation_id, viewer_profile_id, now())
    on conflict (conversation_id, profile_id) do update set archived_at = excluded.archived_at, updated_at = now();
  update public.notifications set read_at = now()
    where account_id = (select auth.uid()) and conversation_id = p_conversation_id and kind = 'message' and read_at is null;
end;
$$;

-- Following a sender is deliberate consent for a request already received.
-- Following while a pair is still an empty draft does not establish a chat.
create or replace function public.accept_followed_message_requests()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'following' then
    update public.direct_conversations conversation
      set status = 'active', established_at = now(), updated_at = now()
      where conversation.established_at is null and conversation.status = 'request'
        and conversation.request_message_sent_at is not null
        and conversation.initiator_profile_id = new.target_profile_id
        and new.follower_profile_id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id);
  end if;
  return new;
end;
$$;
revoke all on function public.accept_followed_message_requests() from public, anon, authenticated;
drop trigger if exists profile_follow_accept_message_requests on public.profile_follows;
create trigger profile_follow_accept_message_requests after insert or update of status on public.profile_follows
for each row execute function public.accept_followed_message_requests();

revoke all on function public.get_or_create_direct_conversation(uuid),
  public.accept_direct_message_request(uuid), public.delete_direct_message_request(uuid) from public, anon;
grant execute on function public.get_or_create_direct_conversation(uuid),
  public.accept_direct_message_request(uuid), public.delete_direct_message_request(uuid) to authenticated;

-- The guarded send function is replaced below; its throttling, attachment
-- validation and audit accounting remain intact.

create or replace function public.send_direct_message(p_conversation_id uuid, p_body text, p_attachments jsonb default '[]'::jsonb)
returns setof public.direct_messages language plpgsql security definer set search_path = public as $$
declare viewer_profile_id uuid; conversation public.direct_conversations%rowtype; inserted public.direct_messages%rowtype; attachment jsonb;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  if viewer_profile_id is null then raise exception 'permission denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(viewer_profile_id::text, 0));
  select * into conversation from public.direct_conversations where id = p_conversation_id for update;
  if viewer_profile_id is null or conversation.id is null or viewer_profile_id not in (conversation.participant_one_profile_id, conversation.participant_two_profile_id) then raise exception 'permission denied'; end if;
  if exists (select 1 from public.direct_message_blocks b where
    b.blocker_profile_id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
    and b.blocked_profile_id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id))
  then raise exception 'conversation blocked'; end if;
  conversation := public.resolve_direct_message_permission(p_conversation_id);
  if conversation.status = 'request' and conversation.initiator_profile_id <> viewer_profile_id then raise exception 'accept request before replying'; end if;
  if conversation.status = 'request' and (conversation.request_message_sent_at is not null or exists (select 1 from public.direct_messages m where m.conversation_id = p_conversation_id)) then raise exception 'message request awaiting response'; end if;
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then raise exception 'invalid attachments'; end if;
  if jsonb_array_length(p_attachments) > 5 then raise exception 'invalid attachments'; end if;
  if char_length(trim(coalesce(p_body, ''))) > 4000 or (char_length(trim(coalesce(p_body, ''))) = 0 and jsonb_array_length(p_attachments) = 0) then raise exception 'invalid message'; end if;
  if (select count(*) from public.direct_message_send_events event where event.sender_profile_id = viewer_profile_id and event.sent_at > now() - interval '1 minute') >= 20
    or (select count(*) from public.direct_message_send_events event where event.sender_profile_id = viewer_profile_id and event.sent_at > now() - interval '1 day') >= 500
  then raise exception 'rate limit reached'; end if;
  insert into public.direct_message_send_events(sender_profile_id) values (viewer_profile_id);
  if conversation.status = 'request' then
    update public.direct_conversations set request_message_sent_at = now() where id = p_conversation_id;
  else
    update public.direct_conversations set established_at = coalesce(established_at, now()) where id = p_conversation_id;
  end if;
  insert into public.direct_messages(conversation_id, sender_profile_id, body)
  values (p_conversation_id, viewer_profile_id, trim(coalesce(p_body, ''))) returning * into inserted;
  for attachment in select value from jsonb_array_elements(p_attachments)
  loop
    if split_part(attachment->>'storagePath', '/', 1) <> viewer_profile_id::text
      or split_part(attachment->>'storagePath', '/', 2) <> p_conversation_id::text
      or coalesce((attachment->>'sizeBytes')::bigint, 0) not between 1 and 26214400
      or not exists (select 1 from storage.objects object where object.bucket_id = 'message-media' and object.name = attachment->>'storagePath')
    then raise exception 'invalid attachment'; end if;
    insert into public.direct_message_attachments(id, message_id, file_name, mime_type, size_bytes, storage_path)
    values ((attachment->>'id')::uuid, inserted.id, left(attachment->>'fileName', 240), left(coalesce(attachment->>'mimeType', 'application/octet-stream'), 160), (attachment->>'sizeBytes')::bigint, attachment->>'storagePath');
  end loop;
  return next inserted;
end;
$$;


notify pgrst, 'reload schema';
commit;
