-- Server-only, per-conversation invalidation. No message bodies are broadcast.
begin;

create or replace function public.messaging_realtime_version()
returns integer language sql stable set search_path = '' as $$ select 1 $$;
revoke all on function public.messaging_realtime_version() from public, anon, authenticated;
grant execute on function public.messaging_realtime_version() to authenticated;

create or replace function public.broadcast_direct_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare conversation_id uuid; message_id uuid;
begin
  if tg_table_name = 'direct_messages' then
    if tg_op = 'DELETE' then conversation_id := old.conversation_id; message_id := old.id;
    else conversation_id := new.conversation_id; message_id := new.id; end if;
  else
    if tg_op = 'DELETE' then message_id := old.message_id; else message_id := new.message_id; end if;
    select message.conversation_id into conversation_id from public.direct_messages message where message.id = message_id;
  end if;
  if conversation_id is not null then
    perform realtime.send(jsonb_build_object('conversationId', conversation_id, 'messageId', message_id, 'table', tg_table_name, 'operation', tg_op),
      'changed', 'direct-activity:' || conversation_id::text, true);
  end if;
  return null;
end;
$$;
revoke all on function public.broadcast_direct_activity() from public, anon, authenticated;

drop trigger if exists direct_messages_broadcast_activity on public.direct_messages;
create trigger direct_messages_broadcast_activity after insert or update or delete on public.direct_messages
for each row execute function public.broadcast_direct_activity();
drop trigger if exists direct_reactions_broadcast_activity on public.direct_message_reactions;
create trigger direct_reactions_broadcast_activity after insert or update or delete on public.direct_message_reactions
for each row execute function public.broadcast_direct_activity();

drop policy if exists direct_activity_receive on realtime.messages;
create policy direct_activity_receive on realtime.messages for select to authenticated
using (extension = 'broadcast' and exists (
  select 1 from public.direct_conversations conversation
  where realtime.topic() = 'direct-activity:' || conversation.id::text
    and public.is_direct_conversation_participant(conversation.id)
));
-- Deliberately no INSERT policy: only the database trigger sends these events.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_conversation_states') then
    alter publication supabase_realtime add table public.direct_conversation_states;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
