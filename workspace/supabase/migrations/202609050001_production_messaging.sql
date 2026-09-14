-- Production messaging: requests, privacy, abuse controls, accurate receipts,
-- actionable notifications, server-side throttling and Realtime delivery.

begin;

alter table public.direct_conversations add column if not exists status text not null default 'active'
  check (status in ('active', 'request'));
alter table public.direct_conversations add column if not exists initiator_profile_id uuid
  references public.profiles(id) on delete set null;
alter table public.direct_conversations add column if not exists request_message_sent_at timestamptz;

create table if not exists public.messaging_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  permission text not null default 'requests' check (permission in ('everyone', 'requests', 'following', 'nobody')),
  updated_at timestamptz not null default now()
);

create table if not exists public.direct_conversation_states (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_muted boolean not null default false,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table if not exists public.direct_message_blocks (
  blocker_profile_id uuid not null references public.profiles(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_profile_id, blocked_profile_id),
  check (blocker_profile_id <> blocked_profile_id)
);

create table if not exists public.direct_message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);

-- Keep rate accounting after an unsend; it cannot be reset by deleting messages.
create table if not exists public.direct_message_send_events (
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.direct_message_send_events enable row level security;
revoke all on public.direct_message_send_events from anon, authenticated;
create index if not exists direct_message_send_events_sender_time_idx
  on public.direct_message_send_events(sender_profile_id, sent_at desc);

create or replace function public.can_interact_direct_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.direct_conversations conversation
    where conversation.id = p_conversation_id
      and public.is_direct_conversation_participant(conversation.id)
      and not exists (
        select 1 from public.direct_message_blocks block
        where block.blocker_profile_id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
          and block.blocked_profile_id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
      )
  );
$$;
revoke all on function public.can_interact_direct_conversation(uuid) from public;
grant execute on function public.can_interact_direct_conversation(uuid) to authenticated;

alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages add constraint direct_messages_body_check check (char_length(body) <= 4000);
alter table public.direct_messages add column if not exists edited_at timestamptz;

create table if not exists public.direct_message_reactions (
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤', '👏', '✨')),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);
create index if not exists direct_message_reactions_message_idx on public.direct_message_reactions(message_id);

create table if not exists public.direct_message_attachments (
  id uuid primary key,
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 240),
  mime_type text not null check (char_length(mime_type) between 1 and 160),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists direct_message_attachments_message_idx on public.direct_message_attachments(message_id);
create index if not exists direct_messages_sender_created_idx on public.direct_messages(sender_profile_id, created_at desc);

alter table public.messaging_preferences enable row level security;
alter table public.direct_conversation_states enable row level security;
alter table public.direct_message_blocks enable row level security;
alter table public.direct_message_reports enable row level security;
alter table public.direct_message_attachments enable row level security;
alter table public.direct_message_reactions enable row level security;

drop policy if exists messaging_preferences_own on public.messaging_preferences;
create policy messaging_preferences_own on public.messaging_preferences for all to authenticated
using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));

drop policy if exists direct_conversation_states_own on public.direct_conversation_states;
create policy direct_conversation_states_own on public.direct_conversation_states for all to authenticated
using (public.owns_profile(profile_id) and public.is_direct_conversation_participant(conversation_id))
with check (public.owns_profile(profile_id) and public.is_direct_conversation_participant(conversation_id));

drop policy if exists direct_message_blocks_own on public.direct_message_blocks;
create policy direct_message_blocks_own on public.direct_message_blocks for all to authenticated
using (public.owns_profile(blocker_profile_id)) with check (public.owns_profile(blocker_profile_id));

drop policy if exists direct_message_reports_own on public.direct_message_reports;
create policy direct_message_reports_own on public.direct_message_reports for select to authenticated
using (public.owns_profile(reporter_profile_id));
drop policy if exists direct_message_reports_insert_own on public.direct_message_reports;
create policy direct_message_reports_insert_own on public.direct_message_reports for insert to authenticated
with check (public.owns_profile(reporter_profile_id) and public.is_direct_conversation_participant(conversation_id));

drop policy if exists direct_message_attachments_participants on public.direct_message_attachments;
create policy direct_message_attachments_participants on public.direct_message_attachments for select to authenticated
using (exists (select 1 from public.direct_messages message where message.id = message_id and public.is_direct_conversation_participant(message.conversation_id)));

drop policy if exists direct_message_reactions_participant_select on public.direct_message_reactions;
create policy direct_message_reactions_participant_select on public.direct_message_reactions for select to authenticated
using (exists (select 1 from public.direct_messages message where message.id = direct_message_reactions.message_id and public.is_direct_conversation_participant(message.conversation_id)));
drop policy if exists direct_message_reactions_own_insert on public.direct_message_reactions;
create policy direct_message_reactions_own_insert on public.direct_message_reactions for insert to authenticated
with check (public.owns_profile(profile_id) and exists (
  select 1 from public.direct_messages message
  join public.direct_conversations conversation on conversation.id = message.conversation_id
  where message.id = direct_message_reactions.message_id
    and conversation.status = 'active'
    and public.can_interact_direct_conversation(message.conversation_id)
));
drop policy if exists direct_message_reactions_own_delete on public.direct_message_reactions;
create policy direct_message_reactions_own_delete on public.direct_message_reactions for delete to authenticated
using (public.owns_profile(profile_id));

drop policy if exists direct_messages_update_own on public.direct_messages;
create policy direct_messages_update_own on public.direct_messages for update to authenticated
using (public.owns_profile(sender_profile_id) and public.can_interact_direct_conversation(conversation_id))
with check (public.owns_profile(sender_profile_id) and public.can_interact_direct_conversation(conversation_id));
drop policy if exists direct_messages_delete_own on public.direct_messages;
create policy direct_messages_delete_own on public.direct_messages for delete to authenticated
using (public.owns_profile(sender_profile_id) and public.is_direct_conversation_participant(conversation_id));

-- A participant may see the other participant's cursor to render a truthful
-- receipt, but only the owner may create or move their own cursor.
drop policy if exists direct_reads_own on public.direct_conversation_reads;
drop policy if exists direct_reads_participant_select on public.direct_conversation_reads;
create policy direct_reads_participant_select on public.direct_conversation_reads for select to authenticated
using (public.is_direct_conversation_participant(conversation_id));
drop policy if exists direct_reads_own_insert on public.direct_conversation_reads;
create policy direct_reads_own_insert on public.direct_conversation_reads for insert to authenticated
with check (public.owns_profile(profile_id) and public.is_direct_conversation_participant(conversation_id));
drop policy if exists direct_reads_own_update on public.direct_conversation_reads;
create policy direct_reads_own_update on public.direct_conversation_reads for update to authenticated
using (public.owns_profile(profile_id) and public.is_direct_conversation_participant(conversation_id))
with check (public.owns_profile(profile_id) and public.is_direct_conversation_participant(conversation_id));

create or replace function public.get_or_create_direct_conversation(p_other_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_profile_id uuid;
  first_profile_id uuid;
  second_profile_id uuid;
  conversation_id uuid;
  target_permission text;
  initial_status text := 'request';
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  if viewer_profile_id is null then raise exception 'profile required'; end if;
  if viewer_profile_id = p_other_profile_id then raise exception 'cannot message yourself'; end if;
  if not public.can_view_profile(p_other_profile_id) then raise exception 'profile not found'; end if;
  if exists (select 1 from public.direct_message_blocks b where
    (b.blocker_profile_id = viewer_profile_id and b.blocked_profile_id = p_other_profile_id)
    or (b.blocker_profile_id = p_other_profile_id and b.blocked_profile_id = viewer_profile_id))
  then raise exception 'conversation blocked'; end if;

  if viewer_profile_id::text < p_other_profile_id::text then first_profile_id := viewer_profile_id; second_profile_id := p_other_profile_id;
  else first_profile_id := p_other_profile_id; second_profile_id := viewer_profile_id; end if;

  select id into conversation_id from public.direct_conversations
  where participant_one_profile_id = first_profile_id and participant_two_profile_id = second_profile_id;
  if conversation_id is not null then return conversation_id; end if;

  select coalesce(pref.permission, 'requests') into target_permission
  from public.profiles profile left join public.messaging_preferences pref on pref.profile_id = profile.id
  where profile.id = p_other_profile_id;
  if target_permission = 'nobody' then raise exception 'messages unavailable'; end if;
  if target_permission = 'following' and not exists (
    select 1 from public.profile_follows follow
    where follow.follower_profile_id = p_other_profile_id and follow.target_profile_id = viewer_profile_id and follow.status = 'following'
  ) then raise exception 'messages unavailable'; end if;
  if target_permission = 'everyone' or exists (
    select 1 from public.profile_follows follow
    where follow.follower_profile_id = p_other_profile_id and follow.target_profile_id = viewer_profile_id and follow.status = 'following'
  ) then initial_status := 'active'; end if;

  insert into public.direct_conversations(participant_one_profile_id, participant_two_profile_id, status, initiator_profile_id)
  values (first_profile_id, second_profile_id, initial_status, viewer_profile_id)
  on conflict (participant_one_profile_id, participant_two_profile_id) do nothing returning id into conversation_id;
  if conversation_id is null then
    select id into conversation_id from public.direct_conversations
    where participant_one_profile_id = first_profile_id and participant_two_profile_id = second_profile_id;
  end if;
  return conversation_id;
end;
$$;

create or replace function public.accept_direct_message_request(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare viewer_profile_id uuid; conversation public.direct_conversations%rowtype;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  select * into conversation from public.direct_conversations where id = p_conversation_id for update;
  if viewer_profile_id is null or conversation.id is null or viewer_profile_id not in (conversation.participant_one_profile_id, conversation.participant_two_profile_id) then raise exception 'permission denied'; end if;
  if not public.can_interact_direct_conversation(p_conversation_id) then raise exception 'conversation blocked'; end if;
  if conversation.initiator_profile_id = viewer_profile_id then raise exception 'requester cannot accept own request'; end if;
  update public.direct_conversations set status = 'active', updated_at = now() where id = p_conversation_id;
end;
$$;

drop function if exists public.send_direct_message(uuid,text);
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

-- Direct inserts would bypass request, blocking and throttling rules.
drop policy if exists direct_messages_insert on public.direct_messages;
revoke insert on public.direct_messages from authenticated;
drop policy if exists direct_conversations_insert on public.direct_conversations;
revoke insert on public.direct_conversations from authenticated;

alter table public.notifications add column if not exists kind text not null default 'system'
  check (kind in ('message', 'reply', 'follow', 'system'));
alter table public.notifications add column if not exists target_path text;
alter table public.notifications add column if not exists actor_profile_id uuid references public.profiles(id) on delete set null;
alter table public.notifications add column if not exists conversation_id uuid references public.direct_conversations(id) on delete cascade;
create unique index if not exists notifications_unread_message_conversation_idx
  on public.notifications(account_id, conversation_id) where kind = 'message' and read_at is null;

-- Serialize with sends, advance monotonically, and acknowledge only incoming
-- messages the client has actually displayed. A later message stays unread.
create or replace function public.mark_direct_conversation_read(p_conversation_id uuid, p_through_created_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare viewer_profile_id uuid; cursor_at timestamptz;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  if viewer_profile_id is null or not public.is_direct_conversation_participant(p_conversation_id) then raise exception 'permission denied'; end if;
  perform 1 from public.direct_conversations where id = p_conversation_id for update;
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
revoke all on function public.mark_direct_conversation_read(uuid,timestamptz) from public;
grant execute on function public.mark_direct_conversation_read(uuid,timestamptz) to authenticated;
revoke insert, update on public.direct_conversation_reads from authenticated;

-- One bounded query replaces a separate latest-message request per thread.
-- Incoming unread state is independent of whether the latest message is outgoing.
create or replace function public.direct_conversation_message_summaries(p_conversation_ids uuid[])
returns table(conversation_id uuid, last_message jsonb, last_incoming_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select conversation.id,
    (select to_jsonb(message) from public.direct_messages message
      where message.conversation_id = conversation.id order by message.created_at desc, message.id desc limit 1),
    (select max(message.created_at) from public.direct_messages message
      where message.conversation_id = conversation.id and not public.owns_profile(message.sender_profile_id))
  from public.direct_conversations conversation
  where conversation.id = any(p_conversation_ids) and public.is_direct_conversation_participant(conversation.id);
$$;
revoke all on function public.direct_conversation_message_summaries(uuid[]) from public;
grant execute on function public.direct_conversation_message_summaries(uuid[]) to authenticated;

create or replace function public.after_direct_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare recipient_profile_id uuid; recipient_account_id uuid; sender_name text; recipient_muted boolean;
begin
  update public.direct_conversations set last_message_at = new.created_at, updated_at = new.created_at where id = new.conversation_id;
  select recipient.id, recipient.account_id, sender.name into recipient_profile_id, recipient_account_id, sender_name
  from public.direct_conversations conversation
  join public.profiles sender on sender.id = new.sender_profile_id
  join public.profiles recipient on recipient.id = case when conversation.participant_one_profile_id = new.sender_profile_id then conversation.participant_two_profile_id else conversation.participant_one_profile_id end
  where conversation.id = new.conversation_id;
  update public.direct_conversation_states set archived_at = null, updated_at = now()
    where conversation_id = new.conversation_id and profile_id = recipient_profile_id;
  select coalesce(state.is_muted, false) into recipient_muted from public.direct_conversation_states state
    where state.conversation_id = new.conversation_id and state.profile_id = recipient_profile_id;
  if recipient_account_id is not null and not coalesce(recipient_muted, false) then
    insert into public.notifications(account_id, body, kind, target_path, actor_profile_id, conversation_id)
    values (recipient_account_id, sender_name || ' sent you a message.', 'message', '/messages?conversation=' || new.conversation_id::text, new.sender_profile_id, new.conversation_id)
    on conflict (account_id, conversation_id) where kind = 'message' and read_at is null
    do update set body = excluded.body, actor_profile_id = excluded.actor_profile_id, created_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.after_direct_message_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare latest_message_at timestamptz;
begin
  select max(message.created_at) into latest_message_at
  from public.direct_messages message where message.conversation_id = old.conversation_id;
  update public.direct_conversations
    set last_message_at = latest_message_at, updated_at = now()
    where id = old.conversation_id;
  return old;
end;
$$;

drop trigger if exists direct_message_delete_rollup on public.direct_messages;
create trigger direct_message_delete_rollup after delete on public.direct_messages
for each row execute function public.after_direct_message_delete();

-- Enrich the existing follow/comment activity trigger so every row can take the
-- recipient back to the creator or exact project that caused the notification.
create or replace function public.notify_community_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_account uuid;
declare actor_account uuid;
declare actor_name text;
declare project_profile_id uuid;
declare project_category_id uuid;
begin
  if tg_table_name = 'profile_follows' then
    select account_id into target_account from public.profiles where id = new.target_profile_id;
    select account_id, name into actor_account, actor_name from public.profiles where id = new.follower_profile_id;
    if target_account is distinct from actor_account then
      insert into public.notifications(account_id, body, kind, target_path, actor_profile_id)
      values (
        target_account,
        actor_name || case when new.status = 'pending' then ' requested to follow you.' else ' followed you.' end,
        'follow',
        '/p/' || new.follower_profile_id::text,
        new.follower_profile_id
      );
    end if;
  elsif tg_table_name = 'project_comments' then
    select profile.account_id, project.profile_id, project.category_id
      into target_account, project_profile_id, project_category_id
    from public.projects project join public.profiles profile on profile.id = project.profile_id
    where project.id = new.project_id;
    select account_id, name into actor_account, actor_name from public.profiles where id = new.author_profile_id;
    if target_account is distinct from actor_account then
      insert into public.notifications(account_id, body, kind, target_path, actor_profile_id)
      values (
        target_account,
        actor_name || ' commented on your work.',
        'reply',
        '/p/' || project_profile_id::text || '/c/' || project_category_id::text || '/' || new.project_id::text || '?comments=1',
        new.author_profile_id
      );
    end if;
  end if;
  return new;
end;
$$;

-- Supabase default ACLs may grant ALL to both browser roles. RLS does not
-- constrain TRUNCATE, and a column grant cannot narrow table-wide UPDATE.
-- Reset the messaging tables' browser privileges before granting only the
-- operations implemented by their policies and guarded RPCs.
revoke all on public.direct_conversations, public.direct_messages,
  public.direct_conversation_reads, public.messaging_preferences,
  public.direct_conversation_states, public.direct_message_blocks,
  public.direct_message_reports, public.direct_message_send_events,
  public.direct_message_attachments, public.direct_message_reactions
  from public, anon, authenticated;
revoke all (id, conversation_id, sender_profile_id, body, created_at, edited_at)
  on public.direct_messages from public, anon, authenticated;
grant select on public.direct_conversations, public.direct_messages,
  public.direct_conversation_reads to authenticated;
grant select, insert, update on public.messaging_preferences to authenticated;
grant select, insert, update on public.direct_conversation_states to authenticated;
grant select, insert, delete on public.direct_message_blocks to authenticated;
grant select, insert on public.direct_message_reports to authenticated;
grant select on public.direct_message_attachments to authenticated;
grant select, insert, delete on public.direct_message_reactions to authenticated;
grant update(body, edited_at), delete on public.direct_messages to authenticated;
revoke all on function public.get_or_create_direct_conversation(uuid) from public;
revoke all on function public.accept_direct_message_request(uuid) from public;
revoke all on function public.send_direct_message(uuid,text,jsonb) from public;
grant execute on function public.accept_direct_message_request(uuid) to authenticated;
grant execute on function public.send_direct_message(uuid,text,jsonb) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages') then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_conversations') then
    alter publication supabase_realtime add table public.direct_conversations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_message_reactions') then
    alter publication supabase_realtime add table public.direct_message_reactions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_conversation_reads') then
    alter publication supabase_realtime add table public.direct_conversation_reads;
  end if;
end $$;

insert into storage.buckets(id, name, public, file_size_limit)
values ('message-media', 'message-media', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists message_media_insert_own on storage.objects;
create policy message_media_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'message-media' and public.owns_profile((storage.foldername(name))[1]::uuid)
  and exists (
    select 1 from public.direct_conversations conversation
    where conversation.id::text = (storage.foldername(name))[2]
      and public.can_interact_direct_conversation(conversation.id)
      and (conversation.status = 'active' or (
        public.owns_profile(conversation.initiator_profile_id) and conversation.request_message_sent_at is null
      ))
  ));
drop policy if exists message_media_select_participants on storage.objects;
create policy message_media_select_participants on storage.objects for select to authenticated
using (bucket_id = 'message-media' and exists (
  select 1 from public.direct_message_attachments attachment
  join public.direct_messages message on message.id = attachment.message_id
  where attachment.storage_path = name and public.is_direct_conversation_participant(message.conversation_id)
));
drop policy if exists message_media_delete_own on storage.objects;
create policy message_media_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'message-media' and public.owns_profile((storage.foldername(name))[1]::uuid));

-- Typing is visible only to the authenticated participants, including when a
-- conversation id is known by somebody else. The browser uses private channels.
drop policy if exists direct_typing_receive on realtime.messages;
create policy direct_typing_receive on realtime.messages for select to authenticated
using (extension = 'broadcast' and exists (
  select 1 from public.direct_conversations conversation
  where realtime.topic() = 'direct-typing:' || conversation.id::text
    and public.can_interact_direct_conversation(conversation.id)
));
drop policy if exists direct_typing_send on realtime.messages;
create policy direct_typing_send on realtime.messages for insert to authenticated
with check (extension = 'broadcast' and exists (
  select 1 from public.direct_conversations conversation
  where realtime.topic() = 'direct-typing:' || conversation.id::text
    and public.can_interact_direct_conversation(conversation.id)
));

commit;
