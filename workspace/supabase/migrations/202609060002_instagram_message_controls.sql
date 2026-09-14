-- Instagram-style invitations: text only, with activity private until acceptance.
-- Existing preferences, messages, accepted conversations and request limits are preserved.
begin;

alter table public.messaging_preferences drop constraint if exists messaging_preferences_permission_check;
alter table public.messaging_preferences add constraint messaging_preferences_permission_check
  check (permission in ('requests', 'followers', 'following'));

-- Following the sender grants direct access. Being a follower only grants
-- permission to request when the recipient selects "Your followers".
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
revoke all on function public.resolve_direct_message_permission(uuid) from public, anon, authenticated;

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
  if conversation.status = 'request' and jsonb_array_length(p_attachments) > 0 then raise exception 'text-only invitation required'; end if;
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
revoke all on function public.send_direct_message(uuid,text,jsonb) from public, anon;
grant execute on function public.send_direct_message(uuid,text,jsonb) to authenticated;

create or replace function public.mark_direct_conversation_read(p_conversation_id uuid, p_through_created_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare viewer_profile_id uuid; cursor_at timestamptz;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  if viewer_profile_id is null or not public.is_direct_conversation_participant(p_conversation_id) then raise exception 'permission denied'; end if;
  perform 1 from public.direct_conversations where id = p_conversation_id for update;
  if not public.can_interact_direct_conversation(p_conversation_id) then return; end if;
  if not exists (select 1 from public.direct_conversations where id = p_conversation_id and status = 'active') then return; end if;
  select max(created_at) into cursor_at from public.direct_messages
    where conversation_id = p_conversation_id and sender_profile_id <> viewer_profile_id
      and created_at <= p_through_created_at;
  if cursor_at is null then return; end if;
  insert into public.direct_conversation_reads(conversation_id, profile_id, last_read_at)
    values (p_conversation_id, viewer_profile_id, cursor_at)
    on conflict (conversation_id, profile_id) do update
      set last_read_at = greatest(public.direct_conversation_reads.last_read_at, excluded.last_read_at);
  update public.notifications set read_at = now()
    where account_id = (select auth.uid()) and conversation_id = p_conversation_id
      and kind = 'message' and read_at is null and created_at <= cursor_at;
end;
$$;
revoke all on function public.mark_direct_conversation_read(uuid,timestamptz) from public, anon;
grant execute on function public.mark_direct_conversation_read(uuid,timestamptz) to authenticated;

-- Hide even legacy cursors from the other participant while a request is pending.
drop policy if exists direct_reads_participant_select on public.direct_conversation_reads;
create policy direct_reads_participant_select on public.direct_conversation_reads for select to authenticated
using (public.is_direct_conversation_participant(conversation_id) and (
  public.owns_profile(profile_id) or (
    public.can_interact_direct_conversation(conversation_id) and exists (
      select 1 from public.direct_conversations conversation where conversation.id = conversation_id and conversation.status = 'active'
    )
  )
));

-- Files cannot be uploaded into an invitation, even through the Storage API.
drop policy if exists message_media_insert_own on storage.objects;
create policy message_media_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'message-media' and public.owns_profile((storage.foldername(name))[1]::uuid)
  and exists (
    select 1 from public.direct_conversations conversation
    where conversation.id::text = (storage.foldername(name))[2]
      and public.can_interact_direct_conversation(conversation.id) and conversation.status = 'active'
  ));

-- Requests do not join activity channels; acceptance enables the normal channel.
drop policy if exists direct_typing_receive on realtime.messages;
create policy direct_typing_receive on realtime.messages for select to authenticated
using (extension = 'broadcast' and exists (
  select 1 from public.direct_conversations conversation
  where realtime.topic() = 'direct-typing:' || conversation.id::text
    and conversation.status = 'active' and public.can_interact_direct_conversation(conversation.id)
));
drop policy if exists direct_typing_send on realtime.messages;
create policy direct_typing_send on realtime.messages for insert to authenticated
with check (extension = 'broadcast' and exists (
  select 1 from public.direct_conversations conversation
  where realtime.topic() = 'direct-typing:' || conversation.id::text
    and conversation.status = 'active' and public.can_interact_direct_conversation(conversation.id)
));

notify pgrst, 'reload schema';
commit;
