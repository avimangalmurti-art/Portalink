-- Reuse the authenticated profile identity for messaging reads/ownership checks.
-- Request, block, receipt, participant and write-permission rules are unchanged.
begin;

create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p where p.account_id = (select auth.uid());
$$;
revoke all on function public.current_profile_id() from public, anon, authenticated;
grant execute on function public.current_profile_id() to authenticated;

create or replace function public.is_direct_conversation_participant(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with viewer as materialized (select public.current_profile_id() as id)
  select exists (select 1 from public.direct_conversations c cross join viewer
    where c.id = p_conversation_id
      and (c.participant_one_profile_id = viewer.id or c.participant_two_profile_id = viewer.id));
$$;

-- Scalar subqueries become statement initplans instead of doing an ownership
-- lookup for each candidate row. Keep equality on the indexed participant IDs.
alter policy direct_conversations_read on public.direct_conversations using (
  participant_one_profile_id = (select public.current_profile_id())
  or participant_two_profile_id = (select public.current_profile_id())
);
alter policy direct_messages_read on public.direct_messages using (
  conversation_id in (select c.id from public.direct_conversations c)
);
alter policy messaging_preferences_own on public.messaging_preferences
using (profile_id = (select public.current_profile_id()))
with check (profile_id = (select public.current_profile_id()));
alter policy direct_conversation_states_own on public.direct_conversation_states
using (profile_id = (select public.current_profile_id()) and public.is_direct_conversation_participant(conversation_id))
with check (profile_id = (select public.current_profile_id()) and public.is_direct_conversation_participant(conversation_id));
alter policy direct_message_blocks_own on public.direct_message_blocks
using (blocker_profile_id = (select public.current_profile_id()))
with check (blocker_profile_id = (select public.current_profile_id()));
alter policy direct_message_reports_own on public.direct_message_reports
using (reporter_profile_id = (select public.current_profile_id()));
alter policy direct_message_reports_insert_own on public.direct_message_reports
with check (reporter_profile_id = (select public.current_profile_id()) and public.is_direct_conversation_participant(conversation_id));
alter policy direct_message_reactions_own_insert on public.direct_message_reactions
with check (profile_id = (select public.current_profile_id()) and exists (
  select 1 from public.direct_messages message
  join public.direct_conversations conversation on conversation.id = message.conversation_id
  where message.id = direct_message_reactions.message_id and conversation.status = 'active'
    and public.can_interact_direct_conversation(message.conversation_id)
));
alter policy direct_message_reactions_own_delete on public.direct_message_reactions
using (profile_id = (select public.current_profile_id()));
alter policy direct_messages_update_own on public.direct_messages
using (sender_profile_id = (select public.current_profile_id()) and public.can_interact_direct_conversation(conversation_id))
with check (sender_profile_id = (select public.current_profile_id()) and public.can_interact_direct_conversation(conversation_id));
alter policy direct_messages_delete_own on public.direct_messages
using (sender_profile_id = (select public.current_profile_id()) and public.is_direct_conversation_participant(conversation_id));
alter policy direct_reads_participant_select on public.direct_conversation_reads
using (public.is_direct_conversation_participant(conversation_id) and (
  profile_id = (select public.current_profile_id()) or (
    public.can_interact_direct_conversation(conversation_id) and exists (
      select 1 from public.direct_conversations conversation where conversation.id = conversation_id and conversation.status = 'active'
    )
  )
));
alter policy direct_reads_own_insert on public.direct_conversation_reads
with check (profile_id = (select public.current_profile_id()) and public.is_direct_conversation_participant(conversation_id));
alter policy direct_reads_own_update on public.direct_conversation_reads
using (profile_id = (select public.current_profile_id()) and public.is_direct_conversation_participant(conversation_id))
with check (profile_id = (select public.current_profile_id()) and public.is_direct_conversation_participant(conversation_id));

create or replace function public.direct_conversation_message_summaries(p_conversation_ids uuid[])
returns table(conversation_id uuid, last_message jsonb, last_incoming_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with viewer as materialized (select public.current_profile_id() as id)
  select conversation.id,
    (select to_jsonb(message) from public.direct_messages message
      where message.conversation_id = conversation.id order by message.created_at desc, message.id desc limit 1),
    (select max(message.created_at) from public.direct_messages message
      where message.conversation_id = conversation.id and message.sender_profile_id <> (select id from viewer))
  from public.direct_conversations conversation
  where conversation.id = any(p_conversation_ids)
    and (conversation.participant_one_profile_id = (select id from viewer)
      or conversation.participant_two_profile_id = (select id from viewer));
$$;

commit;
