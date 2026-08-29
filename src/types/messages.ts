import type { Id } from './domain';

export type MessageParticipant = {
  id: Id;
  name: string;
  handle: string;
  avatar: string;
};

export type DirectMessage = {
  id: Id;
  conversationId: Id;
  senderProfileId: Id;
  body: string;
  createdAt: string;
};

export type ConversationSummary = {
  id: Id;
  participant: MessageParticipant;
  lastMessage: string | null;
  lastMessageAt: string | null;
  isUnread: boolean;
};

export type ConversationThread = {
  conversation: ConversationSummary;
  messages: DirectMessage[];
};
