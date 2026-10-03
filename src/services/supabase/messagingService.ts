import type { MessagingService } from '../interfaces';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ConversationPage, DirectMessage, MessageAttachment, MessageCursor, MessagePage, MessageParticipant, MessageReaction, MessagingPreferences } from '../../types/messages';
import { requireSupabase } from './client';

type ConversationRow = {
  id: string;
  participant_one_profile_id: string | null;
  participant_two_profile_id: string | null;
  last_message_at: string | null;
  created_at: string;
  edited_at?: string | null;
  status?: 'active' | 'request';
  initiator_profile_id?: string | null;
  request_message_sent_at?: string | null;
  established_at?: string | null;
};

type ConversationStateRow = {
  conversation_id: string;
  is_muted: boolean;
  archived_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_profile_id: string | null;
  removed_at?: string | null;
  body: string;
  created_at: string;
  edited_at?: string | null;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string | null;
  removed_at?: string | null;
};

type ReactionRow = { message_id: string; profile_id: string; emoji: string };

const typingChannels = new Map<string, RealtimeChannel>();
let activityCapability: Promise<boolean> | null = null;
async function hasScopedActivity(): Promise<boolean> {
  // Capability contains no account data. Legacy databases keep their working
  // subscriptions until this separately approved migration is installed.
  activityCapability ??= Promise.resolve(requireSupabase().rpc('messaging_realtime_version'))
    .then(({ data, error }) => !error && data === 1).catch(() => false);
  return activityCapability;
}

function identitySearchVariants(value: string): string[] {
  const term = value.trim().replace(/^@(?=.)/, '');
  return [...new Set([term, term.replace(/[’‘]/g, "'"), term.replace(/['‘]/g, '’')])];
}

async function viewerProfileId(): Promise<string> {
  const { data: authData, error: authError } = await requireSupabase().auth.getSession();
  if (authError || !authData.session?.user) throw new Error('Sign in to use messages.');
  // This is only a client query key. Every table/RPC still verifies access with RLS.
  const { data, error } = await requireSupabase().from('profiles').select('id').eq('account_id', authData.session.user.id).single();
  if (error || !data) throw new Error('Create your profile before using messages.');
  return (data as { id: string }).id;
}

function publicMessageError(error: { code?: string; message?: string } | null | undefined, fallback: string): Error {
  const message = error?.message?.toLowerCase() ?? '';
  if (message.includes('rate') || error?.code === '429') return new Error('You are sending messages too quickly. Wait a moment, then try again.');
  if (message.includes('blocked')) return new Error('This conversation is not available.');
  if (message.includes('messages unavailable')) return new Error('This person isn’t accepting message requests.');
  if (message.includes('awaiting response')) return new Error('Your request is waiting for this person to accept.');
  if (message.includes('accept request before replying')) return new Error('Accept this message request before replying.');
  if (message.includes('text-only invitation')) return new Error('You can send one text-only invitation. Attachments are available after it’s accepted.');
  if (message.includes('permission') || message.includes('policy') || error?.code === '42501') return new Error('You do not have access to this conversation.');
  if (message.includes('network') || message.includes('fetch')) return new Error('Messages could not reach the network. Check your connection and try again.');
  return new Error(fallback);
}

function isMissingMessagingUpgrade(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === '42703' || error?.code === 'PGRST202' || error?.code === 'PGRST204' || error?.code === 'PGRST205'
    || /could not find|does not exist|schema cache/i.test(error?.message ?? '');
}

function directMessage(row: MessageRow, attachments: MessageAttachment[] = [], reactions: MessageReaction[] = []): DirectMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderProfileId: row.sender_profile_id,
    body: row.removed_at ? 'Message removed' : row.body,
    isRemoved: Boolean(row.removed_at),
    createdAt: row.created_at,
    attachments,
    reactions,
    editedAt: row.edited_at ?? null,
  };
}

async function hydrateMessages(rows: MessageRow[], viewerId: string): Promise<DirectMessage[]> {
  if (rows.length === 0) return [];
  const client = requireSupabase();
  const [result, reactionResult] = await Promise.all([
    client.from('direct_message_attachments').select('*').in('message_id', rows.map((row) => row.id)),
    client.from('direct_message_reactions').select('message_id,profile_id,emoji').in('message_id', rows.map((row) => row.id)),
  ]);
  if (result.error && !isMissingMessagingUpgrade(result.error)) throw publicMessageError(result.error, 'Message attachments could not be loaded.');
  if (reactionResult.error && !isMissingMessagingUpgrade(reactionResult.error)) throw publicMessageError(reactionResult.error, 'Message reactions could not be loaded.');
  const attachmentRows = ((result.error ? [] : result.data ?? []) as AttachmentRow[])
    .filter((row): row is AttachmentRow & { storage_path: string } => Boolean(row.storage_path) && !row.removed_at);
  const signed = attachmentRows.length > 0
    ? await client.storage.from('message-media').createSignedUrls(attachmentRows.map((row) => row.storage_path), 60 * 60)
    : { data: [], error: null };
  if (signed.error) throw publicMessageError(signed.error, 'Message attachments could not be opened.');
  const urlByPath = new Map((signed.data ?? []).map((entry) => [entry.path, entry.signedUrl]));
  const byMessage = new Map<string, MessageAttachment[]>();
  for (const row of attachmentRows) {
    const item: MessageAttachment = { id: row.id, fileName: row.file_name, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), url: urlByPath.get(row.storage_path) ?? '' };
    byMessage.set(row.message_id, [...(byMessage.get(row.message_id) ?? []), item]);
  }
  const reactionCounts = new Map<string, Map<string, { count: number; isMine: boolean }>>();
  for (const reaction of (reactionResult.error ? [] : reactionResult.data ?? []) as ReactionRow[]) {
    const message = reactionCounts.get(reaction.message_id) ?? new Map<string, { count: number; isMine: boolean }>();
    const current = message.get(reaction.emoji) ?? { count: 0, isMine: false };
    message.set(reaction.emoji, { count: current.count + 1, isMine: current.isMine || reaction.profile_id === viewerId });
    reactionCounts.set(reaction.message_id, message);
  }
  return rows.map((row) => directMessage(row, byMessage.get(row.id) ?? [], [...(reactionCounts.get(row.id)?.entries() ?? [])].map(([emoji, value]) => ({ emoji, ...value }))));
}

async function readConversationSummaries(options: { conversationId?: string; conversationIds?: string[]; offset?: number; limit?: number; includeArchived?: boolean } = {}): Promise<ConversationPage> {
  const viewerId = await viewerProfileId();
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(50, Math.max(1, options.limit ?? 30));
  let conversationQuery = requireSupabase().from('direct_conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);
  if (options.conversationId) conversationQuery = conversationQuery.eq('id', options.conversationId);
  else conversationQuery = conversationQuery.or('established_at.not.is.null,request_message_sent_at.not.is.null,last_message_at.not.is.null');
  if (options.conversationIds) conversationQuery = conversationQuery.in('id', options.conversationIds);
  const { data, error } = await conversationQuery;
  if (error) throw publicMessageError(error, 'Conversations could not be loaded.');
  const fetchedRows = (data ?? []) as ConversationRow[];
  const hasMore = !options.conversationId && fetchedRows.length > limit;
  const rows = fetchedRows.slice(0, limit);
  if (rows.length === 0) return { conversations: [], nextOffset: null };

  const otherIds = rows.map((row) => row.participant_one_profile_id === viewerId ? row.participant_two_profile_id : row.participant_one_profile_id).filter((id): id is string => id !== null);
  const conversationIds = rows.map((row) => row.id);
  const [profilesResult, readsResult, statesResult, blocksResult, summariesResult] = await Promise.all([
    otherIds.length ? requireSupabase().rpc('profile_identities', { p_profile_ids: otherIds }) : Promise.resolve({ data: [], error: null }),
    requireSupabase().from('direct_conversation_reads').select('conversation_id,profile_id,last_read_at').in('conversation_id', conversationIds),
    requireSupabase().from('direct_conversation_states').select('conversation_id,is_muted,archived_at').eq('profile_id', viewerId).in('conversation_id', conversationIds),
    otherIds.length ? requireSupabase().from('direct_message_blocks').select('blocked_profile_id').eq('blocker_profile_id', viewerId).in('blocked_profile_id', otherIds) : Promise.resolve({ data: [], error: null }),
    requireSupabase().rpc('direct_conversation_message_summaries', { p_conversation_ids: conversationIds }),
  ]);
  if (profilesResult.error) throw publicMessageError(profilesResult.error, 'Conversation participants could not be loaded.');
  if (readsResult.error) throw publicMessageError(readsResult.error, 'Unread messages could not be determined.');
  if (statesResult.error && !isMissingMessagingUpgrade(statesResult.error)) throw publicMessageError(statesResult.error, 'Conversation settings could not be loaded.');
  if (blocksResult.error && !isMissingMessagingUpgrade(blocksResult.error)) throw publicMessageError(blocksResult.error, 'Blocked conversations could not be determined.');
  if (summariesResult.error) throw publicMessageError(summariesResult.error, 'Conversation previews could not be loaded.');

  const participants = new Map(((profilesResult.data ?? []) as Array<{ id: string; name: string; handle: string; avatar_url: string }>).map((profile) => [profile.id, {
    id: profile.id,
    name: profile.name,
    handle: `@${profile.handle}`,
    avatar: profile.avatar_url,
  } satisfies MessageParticipant]));
  const summaries = new Map(((summariesResult.data ?? []) as Array<{ conversation_id: string; last_message: MessageRow | null; last_incoming_at: string | null }>).map((row) => [row.conversation_id, row]));
  const readAt = new Map(((readsResult.data ?? []) as Array<{ conversation_id: string; profile_id: string; last_read_at: string }>).map((read) => [`${read.conversation_id}:${read.profile_id}`, read.last_read_at]));
  const states = new Map(((statesResult.error ? [] : statesResult.data ?? []) as ConversationStateRow[]).map((state) => [state.conversation_id, state]));
  const blockedProfileIds = new Set(((blocksResult.error ? [] : blocksResult.data ?? []) as Array<{ blocked_profile_id: string }>).map((row) => row.blocked_profile_id));

  const conversations = rows.map((row) => {
    const otherId = row.participant_one_profile_id === viewerId ? row.participant_two_profile_id : row.participant_one_profile_id;
    const latest = summaries.get(row.id)?.last_message ?? null;
    const latestIncomingAt = summaries.get(row.id)?.last_incoming_at;
    const participant: MessageParticipant = otherId === null
      ? { id: null, name: 'Deleted User', handle: '', avatar: '', isDeleted: true }
      : participants.get(otherId) ?? { id: otherId, name: 'Creator', handle: '', avatar: '' };
    const lastReadAt = readAt.get(`${row.id}:${viewerId}`) ?? null;
    const participantReadAt = row.status === 'request' ? null : readAt.get(`${row.id}:${otherId}`) ?? null;
    const state = states.get(row.id);
    return {
      id: row.id,
      participant,
      lastMessage: latest?.body ?? null,
      lastMessageAt: latest?.created_at ?? row.last_message_at,
      isUnread: Boolean(latestIncomingAt && (!lastReadAt || latestIncomingAt > lastReadAt)),
      status: row.status === 'request' ? 'request' as const : 'active' as const,
      requestedByViewer: row.status === 'request' && row.initiator_profile_id === viewerId,
      hasSentRequest: Boolean(row.request_message_sent_at || (row.status === 'request' && latest)),
      isMuted: state?.is_muted ?? false,
      participantReadAt,
      isDraft: !row.established_at && !row.request_message_sent_at && !latest && !row.last_message_at,
    };
  }).filter((conversation) => !conversation.participant.id || !blockedProfileIds.has(conversation.participant.id))
    .filter((conversation) => options.includeArchived || !states.get(conversation.id)?.archived_at);
  return { conversations, nextOffset: hasMore ? offset + rows.length : null };
}

export const supabaseMessagingService: MessagingService = {
  async listBlockedPeople() {
    const viewerId = await viewerProfileId();
    const { data, error } = await requireSupabase().from('direct_message_blocks')
      .select('blocked_profile_id').eq('blocker_profile_id', viewerId).order('created_at', { ascending: false });
    if (error) throw publicMessageError(error, 'Blocked people could not be loaded.');
    const ids = ((data ?? []) as Array<{ blocked_profile_id: string }>).map(row => row.blocked_profile_id);
    if (!ids.length) return [];
    const result = await requireSupabase().rpc('profile_identities', { p_profile_ids: ids });
    // Missing identity must not hide a block or make it impossible to remove.
    const people = new Map(((result.data ?? []) as Array<{ id: string; name: string; handle: string; avatar_url: string }>).map(person => [person.id, person]));
    return ids.map(id => ({ id, name: people.get(id)?.name ?? 'Blocked person', handle: people.get(id)?.handle ?? '', avatar: people.get(id)?.avatar_url ?? '' }));
  },

  async unblockParticipant(otherProfileId) {
    const viewerId = await viewerProfileId();
    const { error } = await requireSupabase().from('direct_message_blocks').delete()
      .eq('blocker_profile_id', viewerId).eq('blocked_profile_id', otherProfileId);
    if (error) throw publicMessageError(error, 'This person could not be unblocked. Try again.');
  },

  async listConversations(options = {}) {
    return readConversationSummaries(options);
  },

  async getConversation(conversationId) {
    let result = await readConversationSummaries({ conversationId, includeArchived: true });
    let [conversation] = result.conversations;
    if (!conversation) throw new Error('This conversation is no longer available.');
    if (conversation.isDraft && conversation.participant.id) {
      const { error } = await requireSupabase().rpc('get_or_create_direct_conversation', { p_other_profile_id: conversation.participant.id });
      if (error) throw publicMessageError(error, 'That conversation could not be started.');
      result = await readConversationSummaries({ conversationId, includeArchived: true });
      [conversation] = result.conversations;
      if (!conversation) throw new Error('This conversation is no longer available.');
    }
    return conversation;
  },

  async getOrCreateConversation(otherProfileId) {
    const { data, error } = await requireSupabase().rpc('get_or_create_direct_conversation', {
      p_other_profile_id: otherProfileId,
    });
    if (error) throw publicMessageError(error, 'That conversation could not be started.');
    const conversationId = String(data ?? '');
    const profileId = await viewerProfileId();
    const restored = await requireSupabase().from('direct_conversation_states').upsert({ conversation_id: conversationId, profile_id: profileId, archived_at: null }, { onConflict: 'conversation_id,profile_id' });
    if (restored.error && !isMissingMessagingUpgrade(restored.error)) throw publicMessageError(restored.error, 'That conversation could not be restored.');
    return this.getConversation(conversationId);
  },

  async listMessages(conversationId, options = {}): Promise<MessagePage> {
    const viewerId = await viewerProfileId();
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    let query = requireSupabase().from('direct_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    const before = options.before;
    if (before) query = query.or(`created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`);
    const { data, error } = await query;
    if (error) throw publicMessageError(error, 'This conversation could not be loaded.');
    const rows = (data ?? []) as MessageRow[];
    const page = rows.slice(0, limit);
    const oldest = page[page.length - 1];
    return {
      messages: await hydrateMessages(page.reverse(), viewerId),
      before: rows.length > limit && oldest ? { createdAt: oldest.created_at, id: oldest.id } satisfies MessageCursor : null,
    };
  },

  async searchConversations(search, options = {}) {
    const viewerId = await viewerProfileId();
    const term = search.trim().slice(0, 80);
    const limit = Math.min(50, Math.max(1, options.limit ?? 30));
    if (!term) return (await readConversationSummaries({ limit })).conversations;
    const client = requireSupabase();
    const conversationIds = new Set<string>();
    const matchingProfileIds = new Set<string>();
    // Identity RPC arguments are literal text. Preserve punctuation in names;
    // try both apostrophe spellings without turning them into word separators.
    for (const variant of identitySearchVariants(term)) {
      for (let offset = 0; ; offset += 100) {
        const result = await client.rpc('search_message_identities', { p_query: variant, p_limit: 100, p_offset: offset, p_conversations_only: true });
        if (result.error) throw publicMessageError(result.error, 'Conversations could not be searched.');
        const rows = (result.data ?? []) as Array<{ id: string }>;
        for (const row of rows) if (row.id !== viewerId) matchingProfileIds.add(row.id);
        if (rows.length < 100) break;
      }
    }
    const profileIds = [...matchingProfileIds];
    for (let start = 0; start < profileIds.length; start += 50) {
      const ids = profileIds.slice(start, start + 50).join(',');
      for (let offset = 0; ; offset += 100) {
        const result = await client.from('direct_conversations').select('id')
          .or(`participant_one_profile_id.in.(${ids}),participant_two_profile_id.in.(${ids})`)
          .order('id').range(offset, offset + 99);
        if (result.error) throw publicMessageError(result.error, 'Conversations could not be searched.');
        const rows = (result.data ?? []) as Array<{ id: string }>;
        for (const row of rows) conversationIds.add(row.id);
        if (rows.length < 100) break;
      }
    }
    // Page matching message rows until enough DISTINCT conversations are found.
    // A prolific thread must not consume the entire result budget.
    const pattern = `%${term.replace(/[\\%_]/g, char => `\\${char}`)}%`;
    const messageConversations = new Set<string>();
    for (let offset = 0; ; offset += 150) {
      const result = await client.from('direct_messages').select('conversation_id')
        .ilike('body', pattern).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 149);
      if (result.error) throw publicMessageError(result.error, 'Conversations could not be searched.');
      const rows = (result.data ?? []) as Array<{ conversation_id: string }>;
      for (const row of rows) messageConversations.add(row.conversation_id);
      if (messageConversations.size >= limit || rows.length < 150) break;
    }
    for (const id of messageConversations) conversationIds.add(id);
    const ids = [...conversationIds];
    const conversations = [];
    for (let start = 0; start < ids.length; start += 50) {
      conversations.push(...(await readConversationSummaries({ conversationIds: ids.slice(start, start + 50), limit: 50 })).conversations);
    }
    return conversations.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '') || a.id.localeCompare(b.id)).slice(0, limit);
  },

  async searchRecipients(search, options = {}) {
    await viewerProfileId();
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.min(50, Math.max(1, options.limit ?? 30));
    const term = search.trim().replace(/^@(?=.)/, '').slice(0, 80);
    // Merge apostrophe aliases BEFORE slicing, retaining stable pagination.
    // Single-spelling queries keep the ordinary server-paginated path.
    const variants = identitySearchVariants(term);
    const profiles = new Map<string, { id: string; name: string; handle: string; avatar_url: string }>();
    for (const variant of variants) {
      for (let from = variants.length > 1 ? 0 : offset; ; from += 100) {
        const pageSize = variants.length > 1 ? 100 : limit;
        const { data, error } = await requireSupabase().rpc('search_message_identities', {
          p_query: variant, p_limit: pageSize, p_offset: from, p_conversations_only: false,
        });
        if (error) throw publicMessageError(error, 'Creators could not be searched.');
        const rows = (data ?? []) as Array<{ id: string; name: string; handle: string; avatar_url: string }>;
        for (const row of rows) profiles.set(row.id, row);
        if (variants.length === 1 || rows.length < pageSize) break;
      }
    }
    const rows = [...profiles.values()];
    const selected = variants.length > 1 ? rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(offset, offset + limit) : rows;
    return selected.map(profile => ({ id: profile.id, name: profile.name, handle: `@${profile.handle}`, avatar: profile.avatar_url }));
  },

  async sendMessage(conversationId, body, attachments = []) {
    const senderProfileId = await viewerProfileId();
    const trimmed = body.trim();
    if (!trimmed && attachments.length === 0) throw new Error('Write a message or attach a file before sending.');
    if (trimmed.length > 4000) throw new Error('Messages can contain up to 4,000 characters.');
    if (attachments.length > 5) throw new Error('Attach up to five files to one message.');
    if (attachments.some((file) => file.size > 25 * 1024 * 1024)) throw new Error('Each message attachment can be up to 25 MB.');
    const client = requireSupabase();
    if (attachments.length > 0) {
      const conversation = await this.getConversation(conversationId);
      if (!conversation || !conversation.participant.id) throw new Error('This conversation is unavailable.');
      if (conversation.status === 'request') throw new Error('You can send one text-only invitation. Attachments are available after it’s accepted.');
    }
    const uploaded: Array<AttachmentRow & { storage_path: string }> = [];
    try {
      for (const file of attachments) {
        const id = crypto.randomUUID();
        const safeName = file.name.normalize('NFKC').replace(/[^\p{L}\p{N}_. -]/gu, '_').slice(-140) || 'attachment';
        const storagePath = `${senderProfileId}/${conversationId}/${id}/${safeName}`;
        const upload = await client.storage.from('message-media').upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (upload.error) throw publicMessageError(upload.error, 'An attachment could not be uploaded.');
        uploaded.push({ id, message_id: '', file_name: file.name.slice(0, 240), mime_type: file.type || 'application/octet-stream', size_bytes: file.size, storage_path: storagePath });
      }
    } catch (caught) {
      if (uploaded.length) await client.storage.from('message-media').remove(uploaded.map((item) => item.storage_path));
      throw caught;
    }
    const rpc = await client.rpc('send_direct_message', {
      p_conversation_id: conversationId,
      p_body: trimmed,
      p_attachments: uploaded.map((item) => ({ id: item.id, fileName: item.file_name, mimeType: item.mime_type, sizeBytes: item.size_bytes, storagePath: item.storage_path })),
    });
    if (!rpc.error) {
      const row = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as MessageRow | null;
      if (!row) throw new Error('Your message could not be sent.');
      const signed = uploaded.length ? await client.storage.from('message-media').createSignedUrls(uploaded.map((item) => item.storage_path), 60 * 60) : { data: [], error: null };
      const returnedAttachments = uploaded.map((item, index) => ({ id: item.id, fileName: item.file_name, mimeType: item.mime_type, sizeBytes: item.size_bytes, url: signed.data?.[index]?.signedUrl ?? '' }));
      return directMessage(row, returnedAttachments);
    }
    if (uploaded.length) await client.storage.from('message-media').remove(uploaded.map((item) => item.storage_path));
    // All sends must pass the server's request, blocking and throttling checks.
    // An unavailable RPC is not permission to fall back to an unguarded insert.
    throw publicMessageError(rpc.error, isMissingMessagingUpgrade(rpc.error)
      ? 'Messaging is being updated. Please try again shortly.'
      : 'Your message could not be sent.');
  },

  async editMessage(messageId, body) {
    await viewerProfileId();
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 4000) throw new Error('Edited messages must contain between 1 and 4,000 characters.');
    const { data, error } = await requireSupabase().from('direct_messages').update({ body: trimmed, edited_at: new Date().toISOString() }).eq('id', messageId).select('*').single();
    if (error) throw publicMessageError(error, 'This message could not be edited.');
    return directMessage(data as MessageRow);
  },

  async deleteMessage(messageId) {
    await viewerProfileId();
    const client = requireSupabase();
    const paths = await client.from('direct_message_attachments').select('storage_path').eq('message_id', messageId);
    if (paths.error && !isMissingMessagingUpgrade(paths.error)) throw publicMessageError(paths.error, 'This message could not be removed.');
    const { error } = await client.from('direct_messages').delete().eq('id', messageId);
    if (error) throw publicMessageError(error, 'This message could not be removed.');
    const storagePaths = ((paths.data ?? []) as Array<{ storage_path: string }>).map((row) => row.storage_path);
    if (storagePaths.length) await client.storage.from('message-media').remove(storagePaths);
  },

  async toggleReaction(messageId, emoji) {
    const profileId = await viewerProfileId();
    if (!['❤', '👏', '✨'].includes(emoji)) throw new Error('That reaction is not available.');
    const client = requireSupabase();
    const existing = await client.from('direct_message_reactions').select('message_id').eq('message_id', messageId).eq('profile_id', profileId).eq('emoji', emoji).maybeSingle();
    if (existing.error) throw publicMessageError(existing.error, 'This reaction could not be updated.');
    const mutation = existing.data
      ? await client.from('direct_message_reactions').delete().eq('message_id', messageId).eq('profile_id', profileId).eq('emoji', emoji)
      : await client.from('direct_message_reactions').insert({ message_id: messageId, profile_id: profileId, emoji });
    if (mutation.error) throw publicMessageError(mutation.error, 'This reaction could not be updated.');
    const result = await client.from('direct_message_reactions').select('profile_id,emoji').eq('message_id', messageId);
    if (result.error) throw publicMessageError(result.error, 'Reactions could not be refreshed.');
    const grouped = new Map<string, { count: number; isMine: boolean }>();
    for (const row of (result.data ?? []) as Array<{ profile_id: string; emoji: string }>) {
      const current = grouped.get(row.emoji) ?? { count: 0, isMine: false };
      grouped.set(row.emoji, { count: current.count + 1, isMine: current.isMine || row.profile_id === profileId });
    }
    return [...grouped.entries()].map(([value, state]) => ({ emoji: value, ...state }));
  },

  async markConversationRead(conversationId, throughCreatedAt) {
    await viewerProfileId();
    const { error } = await requireSupabase().rpc('mark_direct_conversation_read', {
      p_conversation_id: conversationId,
      p_through_created_at: throughCreatedAt,
    });
    if (error) throw publicMessageError(error, 'Read status could not be updated.');
  },

  subscribeToMessages(conversationId, onMessage, onStatus, onRefresh) {
    const client = requireSupabase();
    let stopped = false;
    const channels: RealtimeChannel[] = [];
    void hasScopedActivity().then((scoped) => {
    if (stopped) return;
    let changesReady = false;
    let activityReady = !scoped;
    const report = () => { if (!stopped) onStatus?.(changesReady && activityReady); };
    const channel = client.channel(`direct-messages:${conversationId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        onMessage(directMessage(payload.new as MessageRow));
        onRefresh?.();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` }, () => onRefresh?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_conversation_reads', filter: `conversation_id=eq.${conversationId}` }, () => onRefresh?.());
    if (!scoped) {
      // DELETE row filters are unsupported; use these only for legacy servers.
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' }, () => onRefresh?.())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_message_reactions' }, () => onRefresh?.());
    }
    channels.push(channel);
    channel.subscribe((status) => { changesReady = status === 'SUBSCRIBED'; report(); });
    if (scoped) {
      const activity = client.channel(`direct-activity:${conversationId}`, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, ({ payload }) => {
          if (!stopped && payload?.conversationId === conversationId) onRefresh?.();
        });
      channels.push(activity);
      activity.subscribe((status) => { activityReady = status === 'SUBSCRIBED'; report(); });
    }
    });
    return () => { stopped = true; for (const channel of channels) void client.removeChannel(channel); };
  },

  subscribeToConversationChanges(onChange, onStatus) {
    const client = requireSupabase();
    let stopped = false;
    let channel: RealtimeChannel | null = null;
    void Promise.all([viewerProfileId(), hasScopedActivity()]).then(([profileId, scoped]) => {
      if (stopped) return;
      channel = client.channel(`direct-conversations:${profileId}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_conversations', filter: `participant_one_profile_id=eq.${profileId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_conversations', filter: `participant_two_profile_id=eq.${profileId}` }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_conversation_reads', filter: `profile_id=eq.${profileId}` }, onChange);
      if (scoped) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'direct_conversation_states', filter: `profile_id=eq.${profileId}` }, onChange);
      channel.subscribe((status) => { if (!stopped) onStatus?.(scoped && status === 'SUBSCRIBED'); });
    }).catch(() => { if (!stopped) onStatus?.(false); });
    return () => { stopped = true; if (channel) void client.removeChannel(channel); };
  },

  subscribeToTyping(conversationId, onTyping) {
    const client = requireSupabase();
    const channel = client.channel(`direct-typing:${conversationId}`, { config: { private: true } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const value = payload as { profileId?: string; isTyping?: boolean };
        if (value.profileId) onTyping(value.profileId, Boolean(value.isTyping));
      })
      .subscribe();
    typingChannels.set(conversationId, channel);
    return () => {
      if (typingChannels.get(conversationId) === channel) typingChannels.delete(conversationId);
      void client.removeChannel(channel);
    };
  },

  broadcastTyping(conversationId, profileId, isTyping) {
    void typingChannels.get(conversationId)?.send({ type: 'broadcast', event: 'typing', payload: { profileId, isTyping } });
  },

  async getPreferences(): Promise<MessagingPreferences> {
    const profileId = await viewerProfileId();
    const { data, error } = await requireSupabase().from('messaging_preferences').select('permission').eq('profile_id', profileId).maybeSingle();
    if (error && !isMissingMessagingUpgrade(error)) throw publicMessageError(error, 'Message privacy could not be loaded.');
    const permission = (data as { permission?: string } | null)?.permission;
    return { permission: permission === 'followers' ? 'followers' : permission === 'following' || permission === 'nobody' ? 'following' : 'requests' };
  },

  async updatePreferences(preferences) {
    const profileId = await viewerProfileId();
    const { error } = await requireSupabase().from('messaging_preferences').upsert({ profile_id: profileId, permission: preferences.permission }, { onConflict: 'profile_id' });
    if (error) throw publicMessageError(error, 'Message privacy could not be saved. Apply the latest platform update, then try again.');
    return preferences;
  },

  async acceptRequest(conversationId) {
    const { error } = await requireSupabase().rpc('accept_direct_message_request', { p_conversation_id: conversationId });
    if (error) throw publicMessageError(error, 'This message request could not be accepted.');
    return this.getConversation(conversationId);
  },

  async deleteRequest(conversationId) {
    const { error } = await requireSupabase().rpc('delete_direct_message_request', { p_conversation_id: conversationId });
    if (error) throw publicMessageError(error, 'This message request could not be deleted.');
  },

  async setMuted(conversationId, muted) {
    const profileId = await viewerProfileId();
    const { error } = await requireSupabase().from('direct_conversation_states').upsert({ conversation_id: conversationId, profile_id: profileId, is_muted: muted, archived_at: null }, { onConflict: 'conversation_id,profile_id' });
    if (error) throw publicMessageError(error, 'This conversation setting could not be saved.');
  },

  async archiveConversation(conversationId) {
    const profileId = await viewerProfileId();
    const { error } = await requireSupabase().from('direct_conversation_states').upsert({ conversation_id: conversationId, profile_id: profileId, archived_at: new Date().toISOString() }, { onConflict: 'conversation_id,profile_id' });
    if (error) throw publicMessageError(error, 'This conversation could not be archived.');
  },

  async blockParticipant(conversationId) {
    const profileId = await viewerProfileId();
    const conversation = await this.getConversation(conversationId);
    const client = requireSupabase();
    const { error } = await client.from('direct_message_blocks').upsert({ blocker_profile_id: profileId, blocked_profile_id: conversation.participant.id }, { onConflict: 'blocker_profile_id,blocked_profile_id' });
    if (error) throw publicMessageError(error, 'This creator could not be blocked.');
    const archived = await client.from('direct_conversation_states').upsert({ conversation_id: conversationId, profile_id: profileId, archived_at: new Date().toISOString() }, { onConflict: 'conversation_id,profile_id' });
    if (archived.error && !isMissingMessagingUpgrade(archived.error)) throw publicMessageError(archived.error, 'This creator was blocked, but the conversation could not be hidden.');
  },

  async reportConversation(conversationId, reason) {
    const profileId = await viewerProfileId();
    const cleanReason = reason.trim().slice(0, 500);
    if (!cleanReason) throw new Error('Choose or write a reason for the report.');
    const { error } = await requireSupabase().from('direct_message_reports').insert({ reporter_profile_id: profileId, conversation_id: conversationId, reason: cleanReason });
    if (error) throw publicMessageError(error, 'This report could not be submitted.');
  },
};
