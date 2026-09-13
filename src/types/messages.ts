import type { Id } from './domain';

export type BlockedPerson = { id: Id; name: string; handle: string; avatar: string };

export type MessageParticipant = {
  id: Id | null;
  isDeleted?: boolean;
  name: string;
  handle: string;
  avatar: string;
};

export type MessageAttachment = {
  id: Id;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

export type MessageReaction = {
  emoji: string;
  count: number;
  isMine: boolean;
};

export type DirectMessage = {
  id: Id;
  conversationId: Id;
  senderProfileId: Id | null;
  isRemoved?: boolean;
  body: string;
  createdAt: string;
  /** Client-only delivery state. Stored messages omit it and therefore read as sent. */
  deliveryState?: 'sending' | 'failed' | 'sent';
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  editedAt?: string | null;
};

export type MessageCursor = {
  createdAt: string;
  id: Id;
};

export type MessagePage = {
  messages: DirectMessage[];
  /** The next request asks for records older than this exact message. */
  before: MessageCursor | null;
};

export type ConversationSummary = {
  id: Id;
  participant: MessageParticipant;
  lastMessage: string | null;
  lastMessageAt: string | null;
  isUnread: boolean;
  status?: 'active' | 'request';
  requestedByViewer?: boolean;
  hasSentRequest?: boolean;
  isMuted?: boolean;
  participantReadAt?: string | null;
  /** An unsent draft is addressable, but is not an inbox conversation. */
  isDraft?: boolean;
};

/** `following` disables requests; followed/accepted people still have direct access. */
export type MessagingPermission = 'requests' | 'followers' | 'following';

export type MessagingPreferences = {
  permission: MessagingPermission;
};

export type ConversationPage = {
  conversations: ConversationSummary[];
  nextOffset: number | null;
};

export type ConversationThread = {
  conversation: ConversationSummary;
  messages: DirectMessage[];
};
