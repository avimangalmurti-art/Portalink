-- Product-loop release: optional project descriptions and durable private
-- one-to-one messaging. All message access is enforced by participant RLS.

alter table public.projects drop constraint if exists projects_summary_check;
alter table public.projects add constraint projects_summary_check
  check (char_length(summary) <= 220);

create table public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one_profile_id uuid not null constraint direct_conversations_participant_one_profile_id_fkey references public.profiles(id) on delete cascade,
  participant_two_profile_id uuid not null constraint direct_conversations_participant_two_profile_id_fkey references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  check (participant_one_profile_id::text < participant_two_profile_id::text),
  unique (participant_one_profile_id, participant_two_profile_id)
);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.direct_conversation_reads (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create index direct_conversations_one_last_idx on public.direct_conversations(participant_one_profile_id, last_message_at desc);
create index direct_conversations_two_last_idx on public.direct_conversations(participant_two_profile_id, last_message_at desc);
create index direct_messages_conversation_created_idx on public.direct_messages(conversation_id, created_at);

create or replace function public.is_direct_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.direct_conversations conversation
    where conversation.id = p_conversation_id
      and (
        public.owns_profile(conversation.participant_one_profile_id)
        or public.owns_profile(conversation.participant_two_profile_id)
      )
  );
$$;

-- Once two people have a conversation, they retain access to each other's
-- identity even if a follow relationship changes later.
create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and (
        not p.is_private
        or p.account_id = (select auth.uid())
        or exists (
          select 1 from public.profile_follows f
          where f.target_profile_id = p.id
            and f.follower_account_id = (select auth.uid())
            and f.status = 'following'
        )
        or exists (
          select 1 from public.profile_follows f
          where f.follower_profile_id = p.id
            and public.owns_profile(f.target_profile_id)
        )
        or exists (
          select 1 from public.direct_conversations conversation
          where (conversation.participant_one_profile_id = p.id or conversation.participant_two_profile_id = p.id)
            and (
              public.owns_profile(conversation.participant_one_profile_id)
              or public.owns_profile(conversation.participant_two_profile_id)
            )
        )
      )
  );
$$;

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_conversation_reads enable row level security;

create policy direct_conversations_read on public.direct_conversations for select to authenticated
using (public.owns_profile(participant_one_profile_id) or public.owns_profile(participant_two_profile_id));
create policy direct_conversations_insert on public.direct_conversations for insert to authenticated
with check (
  (public.owns_profile(participant_one_profile_id) or public.owns_profile(participant_two_profile_id))
  and public.can_view_profile(participant_one_profile_id)
  and public.can_view_profile(participant_two_profile_id)
);

create policy direct_messages_read on public.direct_messages for select to authenticated
using (public.is_direct_conversation_participant(conversation_id));
create policy direct_messages_insert on public.direct_messages for insert to authenticated
with check (
  public.owns_profile(sender_profile_id)
  and public.is_direct_conversation_participant(conversation_id)
  and exists (
    select 1 from public.direct_conversations conversation
    where conversation.id = direct_messages.conversation_id
      and direct_messages.sender_profile_id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
  )
);

create policy direct_reads_own on public.direct_conversation_reads for all to authenticated
using (public.owns_profile(profile_id) and public.is_direct_conversation_participant(conversation_id))
with check (public.owns_profile(profile_id) and public.is_direct_conversation_participant(conversation_id));

create or replace function public.get_or_create_direct_conversation(p_other_profile_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  viewer_profile_id uuid;
  first_profile_id uuid;
  second_profile_id uuid;
  conversation_id uuid;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  if viewer_profile_id is null then raise exception 'profile required'; end if;
  if viewer_profile_id = p_other_profile_id then raise exception 'cannot message yourself'; end if;
  if not public.can_view_profile(p_other_profile_id) then raise exception 'profile not found'; end if;

  if viewer_profile_id::text < p_other_profile_id::text then
    first_profile_id := viewer_profile_id;
    second_profile_id := p_other_profile_id;
  else
    first_profile_id := p_other_profile_id;
    second_profile_id := viewer_profile_id;
  end if;

  select id into conversation_id from public.direct_conversations
  where participant_one_profile_id = first_profile_id and participant_two_profile_id = second_profile_id;
  if conversation_id is not null then return conversation_id; end if;

  insert into public.direct_conversations(participant_one_profile_id, participant_two_profile_id)
  values (first_profile_id, second_profile_id)
  on conflict (participant_one_profile_id, participant_two_profile_id) do nothing
  returning id into conversation_id;

  if conversation_id is null then
    select id into conversation_id from public.direct_conversations
    where participant_one_profile_id = first_profile_id and participant_two_profile_id = second_profile_id;
  end if;
  return conversation_id;
end;
$$;

create or replace function public.after_direct_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_account_id uuid;
  sender_name text;
begin
  update public.direct_conversations
  set last_message_at = new.created_at, updated_at = new.created_at
  where id = new.conversation_id;

  select recipient.account_id, sender.name into recipient_account_id, sender_name
  from public.direct_conversations conversation
  join public.profiles sender on sender.id = new.sender_profile_id
  join public.profiles recipient on recipient.id = case
    when conversation.participant_one_profile_id = new.sender_profile_id then conversation.participant_two_profile_id
    else conversation.participant_one_profile_id
  end
  where conversation.id = new.conversation_id;

  if recipient_account_id is not null then
    insert into public.notifications(account_id, body)
    values (recipient_account_id, sender_name || ' sent you a message.');
  end if;
  return new;
end;
$$;

create trigger direct_messages_after_insert after insert on public.direct_messages
for each row execute function public.after_direct_message_insert();

grant select, insert on public.direct_conversations to authenticated;
grant select, insert on public.direct_messages to authenticated;
grant select, insert, update on public.direct_conversation_reads to authenticated;
revoke all on function public.is_direct_conversation_participant(uuid) from public;
revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.is_direct_conversation_participant(uuid) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- The original durable publisher required a summary; the fast publishing flow
-- makes it optional while preserving title and media validation.
create or replace function public.publish_project(
  p_draft_id uuid,
  p_profile_id uuid,
  p_category_id uuid,
  p_title text,
  p_summary text,
  p_attachments jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, storage
as $$
declare
  new_project_id uuid;
  item jsonb;
  next_position integer;
  object_path text;
begin
  if not public.owns_profile(p_profile_id) then raise exception 'not owner'; end if;
  if nullif(trim(p_title), '') is null or char_length(trim(coalesce(p_summary, ''))) > 220 then raise exception 'invalid metadata'; end if;
  if jsonb_typeof(p_attachments) <> 'array' or jsonb_array_length(p_attachments) < 1 or jsonb_array_length(p_attachments) > 24 then raise exception 'invalid media'; end if;
  if not exists (select 1 from public.project_drafts d where d.id = p_draft_id and d.profile_id = p_profile_id and d.category_id = p_category_id) then raise exception 'draft not found'; end if;
  if not exists (select 1 from public.portfolio_categories c where c.id = p_category_id and c.profile_id = p_profile_id) then raise exception 'category not found'; end if;

  for item in select value from jsonb_array_elements(p_attachments)
  loop
    object_path := item->>'storagePath';
    if public.path_profile_id(object_path) is distinct from p_profile_id
      or not exists (select 1 from storage.objects o where o.bucket_id = 'project-media' and o.name = object_path)
    then raise exception 'invalid media storage reference'; end if;
  end loop;

  select coalesce(max(position), -1) + 1 into next_position from public.projects where category_id = p_category_id;
  insert into public.projects(profile_id, category_id, title, summary, position)
  values (p_profile_id, p_category_id, trim(p_title), trim(coalesce(p_summary, '')), next_position)
  returning id into new_project_id;

  for item in select value from jsonb_array_elements(p_attachments)
  loop
    insert into public.project_attachments(id, project_id, kind, file_name, display_name, extension, mime_type, size_bytes, type_label, storage_path, status, is_cover, position, metadata)
    values (item->>'id', new_project_id, item->>'kind', item->>'fileName', item->>'displayName', coalesce(item->>'extension', ''), coalesce(item->>'mimeType', 'application/octet-stream'), coalesce((item->>'sizeBytes')::bigint, 0), item->>'typeLabel', item->>'storagePath', item->>'status', coalesce((item->>'isCover')::boolean, false), coalesce((item->>'order')::integer, 0), item->'metadata');
  end loop;
  delete from public.project_drafts where id = p_draft_id;
  return new_project_id;
end;
$$;

revoke all on function public.publish_project(uuid,uuid,uuid,text,text,jsonb) from public;
grant execute on function public.publish_project(uuid,uuid,uuid,text,text,jsonb) to authenticated;
