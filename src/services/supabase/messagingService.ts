import type { MessagingService } from '../interfaces';
import type { ConversationSummary, DirectMessage, MessageParticipant } from '../../types/messages';
import { requireSupabase } from './client';

type ConversationRow = {
  id: string;
  participant_one_profile_id: string;
  participant_two_profile_id: string;
  last_message_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_profile_id: string;
  body: string;
  created_at: string;
};

async function viewerProfileId(): Promise<string> {
  const { data: authData, error: authError } = await requireSupabase().auth.getUser();
  if (authError || !authData.user) throw new Error('Sign in to use messages.');
  const { data, error } = await requireSupabase().from('profiles').select('id').eq('account_id', authData.user.id).single();
  if (error || !data) throw new Error('Create your profile before using messages.');
  return (data as { id: string }).id;
}

function directMessage(row: MessageRow): DirectMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderProfileId: row.sender_profile_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

async function readConversationSummaries(conversationId?: string): Promise<ConversationSummary[]> {
  const viewerId = await viewerProfileId();
  let conversationQuery = requireSupabase().from('direct_conversations')
    .select('id,participant_one_profile_id,participant_two_profile_id,last_message_at')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (conversationId) conversationQuery = conversationQuery.eq('id', conversationId);
  const { data, error } = await conversationQuery;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ConversationRow[];
  if (rows.length === 0) return [];

  const otherIds = rows.map((row) => row.participant_one_profile_id === viewerId ? row.participant_two_profile_id : row.participant_one_profile_id);
  const conversationIds = rows.map((row) => row.id);
  const [profilesResult, messagesResult, readsResult] = await Promise.all([
    requireSupabase().from('profiles').select('id,name,handle,avatar_url').in('id', otherIds),
    requireSupabase().from('direct_messages').select('id,conversation_id,sender_profile_id,body,created_at').in('conversation_id', conversationIds).order('created_at', { ascending: false }).limit(500),
    requireSupabase().from('direct_conversation_reads').select('conversation_id,last_read_at').eq('profile_id', viewerId).in('conversation_id', conversationIds),
  ]);
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (messagesResult.error) throw new Error(messagesResult.error.message);
  if (readsResult.error) throw new Error(readsResult.error.message);

  const participants = new Map(((profilesResult.data ?? []) as Array<{ id: string; name: string; handle: string; avatar_url: string }>).map((profile) => [profile.id, {
    id: profile.id,
    name: profile.name,
    handle: `@${profile.handle}`,
    avatar: profile.avatar_url,
  } satisfies MessageParticipant]));
  const latestByConversation = new Map<string, MessageRow>();
  for (const row of (messagesResult.data ?? []) as MessageRow[]) {
    if (!latestByConversation.has(row.conversation_id)) latestByConversation.set(row.conversation_id, row);
  }
  const readAt = new Map(((readsResult.data ?? []) as Array<{ conversation_id: string; last_read_at: string }>).map((read) => [read.conversation_id, read.last_read_at]));

  return rows.map((row) => {
    const otherId = row.participant_one_profile_id === viewerId ? row.participant_two_profile_id : row.participant_one_profile_id;
    const latest = latestByConversation.get(row.id) ?? null;
    const participant = participants.get(otherId) ?? { id: otherId, name: 'Creator', handle: '', avatar: '' };
    const lastReadAt = readAt.get(row.id) ?? null;
    return {
      id: row.id,
      participant,
      lastMessage: latest?.body ?? null,
      lastMessageAt: latest?.created_at ?? row.last_message_at,
      isUnread: Boolean(latest && latest.sender_profile_id !== viewerId && (!lastReadAt || latest.created_at > lastReadAt)),
    };
  });
}

export const supabaseMessagingService: MessagingService = {
  async listConversations() {
    return readConversationSummaries();
  },

  async getOrCreateConversation(otherProfileId) {
    const { data, error } = await requireSupabase().rpc('get_or_create_direct_conversation', {
      p_other_profile_id: otherProfileId,
    });
    if (error) throw new Error(error.message);
    const conversationId = String(data ?? '');
    const [conversation] = await readConversationSummaries(conversationId);
    if (!conversation) throw new Error('That conversation could not be opened.');
    return conversation;
  },

  async listMessages(conversationId) {
    await viewerProfileId();
    const { data, error } = await requireSupabase().from('direct_messages')
      .select('id,conversation_id,sender_profile_id,body,created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return ((data ?? []) as MessageRow[]).map(directMessage);
  },

  async sendMessage(conversationId, body) {
    const senderProfileId = await viewerProfileId();
    const trimmed = body.trim();
    if (!trimmed) throw new Error('Write a message before sending.');
    if (trimmed.length > 4000) throw new Error('Messages can contain up to 4,000 characters.');
    const { data, error } = await requireSupabase().from('direct_messages').insert({
      conversation_id: conversationId,
      sender_profile_id: senderProfileId,
      body: trimmed,
    }).select('id,conversation_id,sender_profile_id,body,created_at').single();
    if (error) throw new Error(error.message);
    return directMessage(data as MessageRow);
  },

  async markConversationRead(conversationId) {
    const profileId = await viewerProfileId();
    const { error } = await requireSupabase().from('direct_conversation_reads').upsert({
      conversation_id: conversationId,
      profile_id: profileId,
      last_read_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id,profile_id' });
    if (error) throw new Error(error.message);
  },
};
