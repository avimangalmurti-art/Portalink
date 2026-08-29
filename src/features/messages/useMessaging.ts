import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { AsyncStatus, Id } from '../../types/domain';
import type { ConversationSummary, DirectMessage } from '../../types/messages';

export function useMessaging(initialRecipientId: Id | null = null) {
  const { messaging } = useServices();
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialRecipientRef = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const next = await messaging.listConversations();
      setConversations(next);
      setActiveConversation((current) => current ? next.find((conversation) => conversation.id === current.id) ?? current : null);
      setStatus('success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Messages could not be loaded.');
      setStatus('error');
    }
  }, [messaging]);

  const openConversation = useCallback(async (conversation: ConversationSummary) => {
    setActiveConversation(conversation);
    setIsLoadingThread(true);
    setError(null);
    try {
      const next = await messaging.listMessages(conversation.id);
      setMessages(next);
      await messaging.markConversationRead(conversation.id);
      setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, isUnread: false } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This conversation could not be loaded.');
    } finally {
      setIsLoadingThread(false);
    }
  }, [messaging]);

  const startConversation = useCallback(async (profileId: Id) => {
    setIsStarting(true);
    setError(null);
    try {
      const conversation = await messaging.getOrCreateConversation(profileId);
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      await openConversation(conversation);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That conversation could not be started.');
      return false;
    } finally {
      setIsStarting(false);
    }
  }, [messaging, openConversation]);

  const sendMessage = useCallback(async (body: string) => {
    if (!activeConversation) return false;
    setIsSending(true);
    setError(null);
    try {
      const sent = await messaging.sendMessage(activeConversation.id, body);
      setMessages((current) => [...current, sent]);
      setConversations((current) => [{
        ...activeConversation,
        lastMessage: sent.body,
        lastMessageAt: sent.createdAt,
        isUnread: false,
      }, ...current.filter((item) => item.id !== activeConversation.id)]);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your message could not be sent.');
      return false;
    } finally {
      setIsSending(false);
    }
  }, [activeConversation, messaging]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!initialRecipientId || initialRecipientRef.current === initialRecipientId) return;
    initialRecipientRef.current = initialRecipientId;
    void startConversation(initialRecipientId);
  }, [initialRecipientId, startConversation]);

  // Lightweight polling keeps an open conversation useful without tying the UI
  // to a specific realtime provider. Supabase Realtime can replace this later.
  useEffect(() => {
    if (!activeConversation) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      messaging.listMessages(activeConversation.id).then(setMessages).catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [activeConversation, messaging]);

  return {
    status,
    conversations,
    activeConversation,
    messages,
    isLoadingThread,
    isStarting,
    isSending,
    error,
    retry: loadConversations,
    openConversation,
    startConversation,
    sendMessage,
  };
}
