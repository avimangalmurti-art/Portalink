import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import type { AsyncStatus, Id } from '../../types/domain';
import type { ConversationSummary, DirectMessage, MessageCursor, MessagePage, MessagingPermission, MessagingPreferences } from '../../types/messages';

type ThreadCache = { messages: DirectMessage[]; before: MessageCursor | null };
type ThreadRefresh = { conversationId: Id; version: number; generation: number; promise: Promise<boolean> };
type MessagingOptions = {
  initialRecipientId?: Id | null;
  initialConversationId?: Id | null;
  mobileContinuity?: boolean;
  onConversationChange?: (conversationId: Id | null, replace?: boolean) => void;
};

export function mergeMessages(current: DirectMessage[], incoming: DirectMessage[]): DirectMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Replace the fetched server range, including removals, while retaining older history and local sends. */
export function reconcileMessagePage(current: DirectMessage[], page: MessagePage): DirectMessage[] {
  const oldest = page.messages[0];
  return mergeMessages(current.filter((message) => message.id.startsWith('local-') || (page.before && oldest &&
    (message.createdAt < oldest.createdAt || (message.createdAt === oldest.createdAt && message.id < oldest.id)))), page.messages);
}

function friendlyError(caught: unknown, fallback: string): string {
  const message = caught instanceof Error ? caught.message : '';
  return message && message.length <= 180 ? message : fallback;
}

function isTemporaryThreadFailure(caught: unknown): boolean {
  // The service deliberately exposes public Errors, without database/status codes.
  return caught instanceof Error && caught.message === 'Messages could not reach the network. Check your connection and try again.';
}

export function useMessaging({
  initialRecipientId = null,
  initialConversationId = null,
  mobileContinuity = false,
  onConversationChange,
}: MessagingOptions = {}) {
  const { messaging } = useServices();
  const auth = useAuth();
  const onConversationChangeRef = useRef(onConversationChange);
  onConversationChangeRef.current = onConversationChange;
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [nextConversationOffset, setNextConversationOffset] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<MessageCursor | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [startingCreatorId, setStartingCreatorId] = useState<Id | null>(null);
  const [sendingCount, setSendingCount] = useState(0);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [isParticipantTyping, setIsParticipantTyping] = useState(false);
  const [preferences, setPreferences] = useState<MessagingPreferences>({ permission: 'requests' });
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [pendingAction, setPendingAction] = useState<'accept' | 'delete-request' | 'mute' | 'archive' | 'block' | 'report' | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<Id | null>(null);
  const [pendingReactions, setPendingReactions] = useState<ReadonlyMap<Id, number>>(() => new Map());
  const reactionRequests = useRef(new Map<Id, number>());
  const [error, setError] = useState<string | null>(null);
  const [threadFailure, setThreadFailure] = useState<{ generation: number; conversationId: Id; message: string } | null>(null);
  const [refreshingThread, setRefreshingThread] = useState<{ generation: number; version: number; conversationId: Id } | null>(null);
  const initialRecipientRef = useRef<string | null>(null);
  const initialConversationRef = useRef<string | null>(null);
  const activeRef = useRef<ConversationSummary | null>(null);
  const requestVersion = useRef(0);
  const conversationRequestVersion = useRef(0);
  const startingRequestVersion = useRef(0);
  const confirmedReads = useRef(new Map<Id, string>());
  const removedConversationIds = useRef(new Set<Id>());
  const nextConversationOffsetRef = useRef<number | null>(null);
  const loadedConversationDepth = useRef(30);
  const threadCache = useRef(new Map<Id, ThreadCache>());
  const retryFiles = useRef(new Map<Id, File[]>());
  const typingStopTimer = useRef<number | null>(null);
  const isTypingBroadcastRef = useRef(false);
  const mounted = useRef(true);
  const threadRefresh = useRef<ThreadRefresh | null>(null);
  const rejectedThreads = useRef(new Map<Id, number>());
  const refreshAfterPresentationChange = useRef(false);
  const threadScope = useRef({ owner: auth.user?.id, profile: auth.viewerProfileId, session: auth.loginSession, messaging, mobileContinuity, generation: 0, ownerGeneration: 0 });
  const previousScope = threadScope.current;
  if (previousScope.owner !== auth.user?.id || previousScope.profile !== auth.viewerProfileId || previousScope.session !== auth.loginSession || previousScope.messaging !== messaging || previousScope.mobileContinuity !== mobileContinuity) {
    const ownerChanged = previousScope.owner !== auth.user?.id || previousScope.profile !== auth.viewerProfileId || previousScope.session !== auth.loginSession || previousScope.messaging !== messaging;
    threadScope.current = { owner: auth.user?.id, profile: auth.viewerProfileId, session: auth.loginSession, messaging, mobileContinuity, generation: previousScope.generation + 1, ownerGeneration: previousScope.ownerGeneration + (ownerChanged ? 1 : 0) };
    if (previousScope.mobileContinuity || mobileContinuity) {
      requestVersion.current += 1;
      threadRefresh.current = null;
      rejectedThreads.current.clear();
      if (ownerChanged) {
        threadCache.current.clear();
        activeRef.current = null;
        initialConversationRef.current = null;
        initialRecipientRef.current = null;
      } else refreshAfterPresentationChange.current = true;
    }
  }
  const threadGeneration = threadScope.current.generation;
  const threadOwnerGeneration = threadScope.current.ownerGeneration;
  const resetMobileThread = mobileContinuity || previousScope.mobileContinuity;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      threadRefresh.current = null;
    };
  }, []);

  useEffect(() => {
    if (!resetMobileThread) return;
    setThreadFailure(null);
    setRefreshingThread(null);
    setIsLoadingThread(false);
    setIsLoadingOlder(false);
    if (!activeRef.current) {
      setActiveConversation(null);
      setMessages([]);
      setOlderCursor(null);
    }
  }, [resetMobileThread, threadGeneration]);

  const applyConversationPage = useCallback((next: ConversationSummary[], append: boolean, replace = false) => {
    setConversations((current) => {
      const combined = replace ? next : append ? [...current, ...next] : [...next, ...current.filter((item) => !next.some((entry) => entry.id === item.id))];
      const unique = [...new Map(combined.map((conversation) => [conversation.id, conversation])).values()];
      return unique.filter((conversation) => !conversation.isDraft).sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
    });
    setActiveConversation((current) => {
      if (!current) return null;
      const refreshed = next.find((conversation) => conversation.id === current.id) ?? current;
      if (refreshed.status === 'request' || current.status === 'request') confirmedReads.current.delete(refreshed.id);
      activeRef.current = refreshed;
      return refreshed;
    });
  }, []);

  const loadConversations = useCallback(async ({ append = false, background = false }: { append?: boolean; background?: boolean } = {}) => {
    const version = ++conversationRequestVersion.current;
    if (!background) append ? setIsLoadingMoreConversations(true) : setStatus('loading');
    if (!background) setError(null);
    try {
      let offset = append ? nextConversationOffsetRef.current ?? 0 : 0;
      let page = await messaging.listConversations({ offset, limit: 30 });
      while (!append && page.nextOffset !== null && page.nextOffset < loadedConversationDepth.current) {
        offset = page.nextOffset;
        const next = await messaging.listConversations({ offset, limit: 30 });
        page = { conversations: [...page.conversations, ...next.conversations], nextOffset: next.nextOffset };
      }
      if (version !== conversationRequestVersion.current) return;
      for (const item of page.conversations) removedConversationIds.current.delete(item.id);
      applyConversationPage(page.conversations, append, !append);
      loadedConversationDepth.current = offset + 30;
      nextConversationOffsetRef.current = page.nextOffset;
      setNextConversationOffset(page.nextOffset);
      setStatus('success');
      return true;
    } catch (caught) {
      if (!background && version === conversationRequestVersion.current) {
        setError(friendlyError(caught, 'Messages could not be loaded.'));
        if (!append) setStatus('error');
      }
      return false;
    } finally {
      if (append) setIsLoadingMoreConversations(false);
    }
  }, [applyConversationPage, messaging]);

  const markReadThrough = useCallback(async (conversationId: Id, thread: DirectMessage[]) => {
    if (document.visibilityState !== 'visible' || activeRef.current?.id !== conversationId || activeRef.current.status === 'request') return;
    const readingConversation = activeRef.current;
    const latestIncoming = [...thread].reverse().find((message) => message.senderProfileId !== auth.viewerProfileId && !message.id.startsWith('local-'));
    if (!latestIncoming || (confirmedReads.current.get(conversationId) ?? '') >= latestIncoming.createdAt) return;
    try {
      await messaging.markConversationRead(conversationId, latestIncoming.createdAt);
      // A request/accept transition can turn this RPC into a no-op. Recheck on
      // the new conversation state instead of caching a stale acknowledgment.
      if (activeRef.current !== readingConversation) return;
      confirmedReads.current.set(conversationId, [confirmedReads.current.get(conversationId) ?? '', latestIncoming.createdAt].sort().at(-1) ?? latestIncoming.createdAt);
      const hasNewerIncoming = threadCache.current.get(conversationId)?.messages.some((message) => message.senderProfileId !== auth.viewerProfileId && message.createdAt > latestIncoming.createdAt);
      if (!hasNewerIncoming) setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, isUnread: false } : item));
    } catch {
      // Reading the actual messages remains available when the secondary marker fails.
    }
  }, [auth.viewerProfileId, messaging]);

  const rejectMobileThread = useCallback((conversationId: Id, generation: number) => {
    rejectedThreads.current.set(conversationId, generation);
    threadCache.current.delete(conversationId);
    setMessages([]);
    setOlderCursor(null);
    setIsLoadingOlder(false);
    // Reject any older-page response that was already in flight too.
    requestVersion.current += 1;
    setRefreshingThread(null);
    setIsLoadingThread(false);
  }, []);

  const refreshMobileThread = useCallback((conversationId: Id, version: number): Promise<boolean> => {
    const isCurrent = () => mounted.current && threadScope.current.mobileContinuity && threadScope.current.generation === threadGeneration && requestVersion.current === version && activeRef.current?.id === conversationId;
    if (!isCurrent()) return Promise.resolve(false);
    const existing = threadRefresh.current;
    if (existing?.conversationId === conversationId && existing.version === version && existing.generation === threadGeneration) return existing.promise;
    const identity = { conversationId, version, generation: threadGeneration };
    setRefreshingThread(identity);
    setIsLoadingThread(!threadCache.current.has(conversationId));
    const baseline = threadCache.current.get(conversationId);
    const flight: ThreadRefresh = { ...identity, promise: Promise.resolve(false) };
    threadRefresh.current = flight;
    flight.promise = Promise.resolve().then(async () => {
      if (!isCurrent()) return false;
      try {
        let page = await messaging.listMessages(conversationId, { limit: 100 });
        while (isCurrent() && page.before) {
          // Older pagination may finish while this refresh is pending. Cover the
          // current oldest loaded record before replacing the fetched range.
          const oldestLoaded = threadCache.current.get(conversationId)?.messages.find((message) => !message.id.startsWith('local-'));
          if (!oldestLoaded || page.before.createdAt < oldestLoaded.createdAt || (page.before.createdAt === oldestLoaded.createdAt && page.before.id <= oldestLoaded.id)) break;
          const older = await messaging.listMessages(conversationId, { before: page.before, limit: 100 });
          page = { messages: mergeMessages(older.messages, page.messages), before: older.before };
        }
        if (!isCurrent()) return false;
        const cache = threadCache.current.get(conversationId);
        const changedDuringRefresh = (cache?.messages ?? []).filter((message) => !baseline?.messages.includes(message));
        const next = mergeMessages(reconcileMessagePage(cache?.messages ?? [], page), changedDuringRefresh);
        threadCache.current.set(conversationId, { messages: next, before: page.before });
        setMessages(next);
        setOlderCursor(page.before);
        rejectedThreads.current.delete(conversationId);
        setThreadFailure(null);
        return true;
      } catch (caught) {
        if (!isCurrent()) return false;
        setThreadFailure({ generation: threadGeneration, conversationId, message: friendlyError(caught, 'This conversation could not be loaded.') });
        if (!isTemporaryThreadFailure(caught)) rejectMobileThread(conversationId, threadGeneration);
        return false;
      } finally {
        if (threadRefresh.current === flight) {
          threadRefresh.current = null;
          if (isCurrent()) {
            setRefreshingThread(null);
            setIsLoadingThread(false);
          }
        }
      }
    });
    return flight.promise;
  }, [messaging, rejectMobileThread, threadGeneration]);

  const loadWebThread = useCallback(async (conversationId: Id, version: number, cached: ThreadCache | undefined) => {
    try {
      const page = await messaging.listMessages(conversationId, { limit: 50 });
      if (requestVersion.current !== version || activeRef.current?.id !== conversationId) return;
      const next = reconcileMessagePage(threadCache.current.get(conversationId)?.messages ?? [], page);
      const before = cached ? cached.before : page.before;
      threadCache.current.set(conversationId, { messages: next, before });
      setMessages(next);
      setOlderCursor(before);
    } catch (caught) {
      if (requestVersion.current === version && activeRef.current?.id === conversationId) {
        setMessages([]);
        setOlderCursor(null);
        setError(friendlyError(caught, 'This conversation could not be loaded.'));
      }
    } finally {
      if (requestVersion.current === version) setIsLoadingThread(false);
    }
  }, [messaging]);

  useEffect(() => {
    if (!refreshAfterPresentationChange.current) return;
    refreshAfterPresentationChange.current = false;
    const conversationId = activeRef.current?.id;
    if (!conversationId) return;
    if (mobileContinuity) void refreshMobileThread(conversationId, requestVersion.current);
    else {
      const cached = threadCache.current.get(conversationId);
      setIsLoadingThread(!cached);
      void loadWebThread(conversationId, requestVersion.current, cached);
    }
  }, [loadWebThread, mobileContinuity, refreshMobileThread, threadGeneration]);

  const openConversation = useCallback(async (conversation: ConversationSummary, options: { replaceHistory?: boolean } = {}) => {
    if ((mobileContinuity || threadScope.current.mobileContinuity) && (!mounted.current || threadScope.current.generation !== threadGeneration)) return;
    const version = ++requestVersion.current;
    startingRequestVersion.current += 1;
    setStartingCreatorId(null);
    activeRef.current = conversation;
    if (conversation.status === 'request') confirmedReads.current.delete(conversation.id);
    setActiveConversation(conversation);
    const cached = threadCache.current.get(conversation.id);
    setMessages(cached?.messages ?? []);
    setOlderCursor(cached?.before ?? null);
    setIsLoadingThread(!cached);
    setIsLoadingOlder(false);
    setPendingAction(null);
    setPendingMessageId(null);
    setError(null);
    setThreadFailure(null);
    onConversationChangeRef.current?.(conversation.id, options.replaceHistory ?? false);
    if (mobileContinuity) {
      await refreshMobileThread(conversation.id, version);
      return;
    }
    await loadWebThread(conversation.id, version, cached);
  }, [loadWebThread, mobileContinuity, refreshMobileThread, threadGeneration]);

  const closeConversation = useCallback((replaceHistory = true) => {
    requestVersion.current += 1;
    startingRequestVersion.current += 1;
    setStartingCreatorId(null);
    activeRef.current = null;
    setActiveConversation(null);
    setMessages([]);
    setOlderCursor(null);
    setIsLoadingThread(false);
    setIsLoadingOlder(false);
    setError(null);
    setThreadFailure(null);
    setRefreshingThread(null);
    threadRefresh.current = null;
    onConversationChangeRef.current?.(null, replaceHistory);
  }, []);

  const renderedThreadVersion = requestVersion.current;
  const renderedConversationId = activeConversation?.id ?? null;
  const retryThread = useCallback((): Promise<boolean> => {
    if (!mobileContinuity || !renderedConversationId || renderedThreadVersion !== requestVersion.current || activeRef.current?.id !== renderedConversationId) return Promise.resolve(false);
    return refreshMobileThread(renderedConversationId, renderedThreadVersion);
  }, [mobileContinuity, refreshMobileThread, renderedConversationId, renderedThreadVersion]);

  const startConversation = useCallback(async (profileId: Id) => {
    const version = ++startingRequestVersion.current;
    setStartingCreatorId(profileId);
    setError(null);
    try {
      const conversation = await messaging.getOrCreateConversation(profileId);
      if (version !== startingRequestVersion.current) return false;
      removedConversationIds.current.delete(conversation.id);
      applyConversationPage([conversation], false);
      await openConversation(conversation);
      return true;
    } catch (caught) {
      if (version === startingRequestVersion.current) setError(friendlyError(caught, 'That conversation could not be started.'));
      return false;
    } finally {
      if (version === startingRequestVersion.current || activeRef.current?.participant.id === profileId) setStartingCreatorId(null);
    }
  }, [applyConversationPage, messaging, openConversation]);

  const placeMessage = useCallback((conversationId: Id, updater: (current: DirectMessage[]) => DirectMessage[]) => {
    if ((mobileContinuity || threadScope.current.mobileContinuity) && threadScope.current.ownerGeneration !== threadOwnerGeneration) return;
    if (threadScope.current.mobileContinuity && rejectedThreads.current.get(conversationId) === threadScope.current.generation) return;
    const cache = threadCache.current.get(conversationId) ?? { messages: [], before: null };
    const next = updater(cache.messages);
    threadCache.current.set(conversationId, { ...cache, messages: next });
    if (activeRef.current?.id === conversationId) setMessages(next);
  }, [mobileContinuity, threadOwnerGeneration]);

  const sendMessage = useCallback(async (body: string, attachments: File[] = [], retryId?: Id) => {
    const conversation = activeRef.current;
    const trimmed = body.trim();
    if (!conversation || (!trimmed && attachments.length === 0)) return false;
    if (conversation.status === 'request' && attachments.length > 0) {
      setError('You can send one text-only invitation. Attachments are available after it’s accepted.');
      return false;
    }
    const localId = retryId ?? `local-${crypto.randomUUID()}`;
    const existingLocal = retryId ? threadCache.current.get(conversation.id)?.messages.find((message) => message.id === retryId) : null;
    const optimistic: DirectMessage = {
      id: localId,
      conversationId: conversation.id,
      senderProfileId: auth.viewerProfileId ?? 'viewer',
      body: trimmed,
      createdAt: new Date().toISOString(),
      deliveryState: 'sending',
      attachments: existingLocal?.attachments ?? attachments.map((file) => ({ id: `local-${crypto.randomUUID()}`, fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, url: URL.createObjectURL(file) })),
    };
    retryFiles.current.set(localId, attachments);
    setSendingCount((count) => count + 1);
    setError(null);
    placeMessage(conversation.id, (current) => mergeMessages(current.filter((message) => message.id !== localId), [optimistic]));
    try {
      const sent = await messaging.sendMessage(conversation.id, trimmed, attachments);
      for (const attachment of optimistic.attachments ?? []) if (attachment.url.startsWith('blob:')) URL.revokeObjectURL(attachment.url);
      retryFiles.current.delete(localId);
      placeMessage(conversation.id, (current) => mergeMessages(current.filter((message) => message.id !== localId), [{ ...sent, deliveryState: 'sent' }]));
      if (!removedConversationIds.current.has(conversation.id)) void loadConversations({ background: true });
      return true;
    } catch (caught) {
      placeMessage(conversation.id, (current) => current.map((message) => message.id === localId ? { ...message, deliveryState: 'failed' } : message));
      if (activeRef.current?.id === conversation.id) setError(friendlyError(caught, 'Your message could not be sent.'));
      return false;
    } finally {
      setSendingCount((count) => Math.max(0, count - 1));
    }
  }, [auth.viewerProfileId, loadConversations, messaging, placeMessage]);

  const retryMessage = useCallback(async (messageId: Id) => {
    const activeId = activeRef.current?.id;
    const failed = activeId ? threadCache.current.get(activeId)?.messages.find((message) => message.id === messageId && message.deliveryState === 'failed') : null;
    return failed ? sendMessage(failed.body, retryFiles.current.get(failed.id) ?? [], failed.id) : false;
  }, [sendMessage]);

  const loadOlderMessages = useCallback(async () => {
    const conversation = activeRef.current;
    if (!conversation || !olderCursor || isLoadingOlder) return false;
    if (threadScope.current.mobileContinuity && rejectedThreads.current.get(conversation.id) === threadScope.current.generation) return false;
    const version = requestVersion.current;
    const scope = threadScope.current;
    setIsLoadingOlder(true);
    try {
      const page = await messaging.listMessages(conversation.id, { before: olderCursor, limit: 50 });
      if (activeRef.current?.id !== conversation.id || version !== requestVersion.current) return false;
      const cache = threadCache.current.get(conversation.id) ?? { messages: [], before: null };
      const next = mergeMessages(page.messages, cache.messages);
      threadCache.current.set(conversation.id, { messages: next, before: page.before });
      setMessages(next);
      setOlderCursor(page.before);
      return true;
    } catch (caught) {
      if (version === requestVersion.current) {
        if (scope.mobileContinuity) {
          setThreadFailure({ generation: scope.generation, conversationId: conversation.id, message: friendlyError(caught, 'Older messages could not be loaded.') });
          if (!isTemporaryThreadFailure(caught)) rejectMobileThread(conversation.id, scope.generation);
        } else setError(friendlyError(caught, 'Older messages could not be loaded.'));
      }
      return false;
    } finally {
      if (version === requestVersion.current) setIsLoadingOlder(false);
    }
  }, [isLoadingOlder, messaging, olderCursor, rejectMobileThread]);

  const editMessage = useCallback(async (messageId: Id, body: string) => {
    const conversationId = activeRef.current?.id;
    if (!conversationId) return false;
    setPendingMessageId(messageId);
    setError(null);
    try {
      const edited = await messaging.editMessage(messageId, body);
      placeMessage(conversationId, (current) => current.map((message) => message.id === messageId ? { ...edited, attachments: message.attachments, reactions: message.reactions } : message));
      return true;
    } catch (caught) {
      if (activeRef.current?.id === conversationId) setError(friendlyError(caught, 'This message could not be edited.'));
      return false;
    } finally { if (activeRef.current?.id === conversationId) setPendingMessageId(null); }
  }, [messaging, placeMessage]);

  const deleteMessage = useCallback(async (messageId: Id) => {
    const conversationId = activeRef.current?.id;
    if (!conversationId) return false;
    setPendingMessageId(messageId);
    setError(null);
    try {
      await messaging.deleteMessage(messageId);
      placeMessage(conversationId, (current) => current.filter((message) => message.id !== messageId));
      return true;
    } catch (caught) {
      if (activeRef.current?.id === conversationId) setError(friendlyError(caught, 'This message could not be removed.'));
      return false;
    } finally { if (activeRef.current?.id === conversationId) setPendingMessageId(null); }
  }, [messaging, placeMessage]);

  const toggleReaction = useCallback(async (messageId: Id, emoji: string) => {
    const conversationId = activeRef.current?.id;
    if (!conversationId || activeRef.current?.status === 'request' || messageId.startsWith('local-')) return false;
    const ownerGeneration = threadScope.current.ownerGeneration;
    const requests = reactionRequests.current;
    if (requests.get(messageId) === ownerGeneration) return false;
    requests.set(messageId, ownerGeneration);
    setPendingReactions(new Map(requests));
    setError(null);
    try {
      const reactions = await messaging.toggleReaction(messageId, emoji);
      if (!mounted.current || threadScope.current.ownerGeneration !== ownerGeneration) return false;
      placeMessage(conversationId, (current) => current.map((message) => message.id === messageId ? { ...message, reactions } : message));
      return true;
    } catch (caught) {
      if (mounted.current && threadScope.current.ownerGeneration === ownerGeneration && activeRef.current?.id === conversationId) {
        setError(friendlyError(caught, 'This reaction could not be updated.'));
      }
      return false;
    } finally {
      if (requests.get(messageId) === ownerGeneration) {
        requests.delete(messageId);
        if (mounted.current) setPendingReactions(new Map(requests));
      }
    }
  }, [messaging, placeMessage]);

  const searchConversations = useCallback((query: string) => messaging.searchConversations(query, { limit: 50 }), [messaging]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  useEffect(() => {
    let current = true;
    void messaging.getPreferences().then((next) => { if (current) setPreferences(next); }).catch(() => undefined);
    return () => { current = false; };
  }, [messaging]);

  useEffect(() => {
    if (!initialConversationId || initialConversationRef.current === initialConversationId) return;
    initialConversationRef.current = initialConversationId;
    if (activeRef.current?.id === initialConversationId) return;
    const version = requestVersion.current;
    let current = true;
    void messaging.getConversation(initialConversationId).then((conversation) => {
      if (!current || (mobileContinuity && version !== requestVersion.current)) return;
      applyConversationPage([conversation], false);
      void openConversation(conversation, { replaceHistory: true });
    }).catch((caught) => {
      if (current && (!mobileContinuity || version === requestVersion.current)) setError(friendlyError(caught, 'This conversation is no longer available.'));
    });
    return () => { current = false; };
  }, [applyConversationPage, initialConversationId, messaging, mobileContinuity, openConversation]);

  useEffect(() => {
    if (initialConversationId || !initialConversationRef.current) return;
    initialConversationRef.current = null;
    requestVersion.current += 1;
    activeRef.current = null;
    setActiveConversation(null);
    setMessages([]);
    setOlderCursor(null);
    setError(null);
    setThreadFailure(null);
    setRefreshingThread(null);
    threadRefresh.current = null;
    setIsLoadingThread(false);
    setIsLoadingOlder(false);
  }, [initialConversationId]);

  useEffect(() => {
    if (!initialRecipientId || initialRecipientRef.current === initialRecipientId) return;
    initialRecipientRef.current = initialRecipientId;
    void startConversation(initialRecipientId);
  }, [initialRecipientId, startConversation]);

  useEffect(() => {
    let connected = false;
    let refreshTimer: number | undefined;
    const refresh = () => { if (document.visibilityState === 'visible') void loadConversations({ background: true }).then((success) => { if (success === false) connected = false; }); };
    const schedule = () => { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(refresh, 150); };
    const unsubscribe = messaging.subscribeToConversationChanges(schedule, (ready) => { connected = ready; if (ready) schedule(); });
    const timer = window.setInterval(() => { if (!connected) refresh(); }, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { unsubscribe(); window.clearTimeout(refreshTimer); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [loadConversations, messaging]);

  const activeConversationId = activeConversation?.id ?? null;
  const activeParticipantId = activeConversation?.participant.id ?? null;

  useEffect(() => {
    const conversationId = activeConversationId;
    if (!conversationId) { setIsRealtimeConnected(false); return undefined; }
    let current = true;
    let refreshing = false;
    let refreshAgain = false;
    let connected = false;
    let refreshTimer: number | undefined;
    const accept = (incoming: DirectMessage) => {
      if (!current || incoming.conversationId !== conversationId) return;
      if ((mobileContinuity || threadScope.current.mobileContinuity) && (!mounted.current || threadScope.current.generation !== threadGeneration)) return;
      if (mobileContinuity && rejectedThreads.current.get(conversationId) === threadGeneration) return;
      setIsParticipantTyping(false);
      placeMessage(conversationId, (existing) => mergeMessages(existing, [{ ...incoming, deliveryState: 'sent' }]));
      void loadConversations({ background: true });
    };
    const refresh = async () => {
      if (!current || document.visibilityState !== 'visible' || activeRef.current?.id !== conversationId) return;
      if (refreshing) { refreshAgain = true; return; }
      refreshing = true;
      if (mobileContinuity) {
        try {
          const success = await refreshMobileThread(conversationId, requestVersion.current);
          if (!current) return;
          if (success) void loadConversations({ background: true });
          else { connected = false; setIsRealtimeConnected(false); }
        } finally {
          refreshing = false;
          if (refreshAgain && current) { refreshAgain = false; void refresh(); }
        }
        return;
      }
      const baseline = threadCache.current.get(conversationId);
      const oldestLoaded = baseline?.messages.find((message) => !message.id.startsWith('local-'));
      try {
        let page = await messaging.listMessages(conversationId, { limit: 100 });
        while (current && page.before && oldestLoaded && (page.before.createdAt > oldestLoaded.createdAt || (page.before.createdAt === oldestLoaded.createdAt && page.before.id > oldestLoaded.id))) {
          const older = await messaging.listMessages(conversationId, { before: page.before, limit: 100 });
          page = { messages: mergeMessages(older.messages, page.messages), before: older.before };
        }
        if (!current || activeRef.current?.id !== conversationId) return;
        const cache = threadCache.current.get(conversationId);
        const changedDuringRefresh = (cache?.messages ?? []).filter((message) => !baseline?.messages.includes(message));
        const next = mergeMessages(reconcileMessagePage(cache?.messages ?? [], page), changedDuringRefresh);
        threadCache.current.set(conversationId, { messages: next, before: page.before });
        setMessages(next);
        setOlderCursor(page.before);
        // Read receipts are scoped to the active conversation's realtime feed.
        // Refresh its inbox summary too, where participantReadAt is stored.
        void loadConversations({ background: true });
      } catch {
        if (current) { connected = false; setIsRealtimeConnected(false); }
      } finally {
        refreshing = false;
        if (refreshAgain && current) { refreshAgain = false; void refresh(); }
      }
    };
    const schedule = () => { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(() => { void refresh(); }, 150); };
    const unsubscribe = messaging.subscribeToMessages(conversationId, accept, (ready) => {
      if (!current) return;
      connected = ready;
      setIsRealtimeConnected(ready);
      if (ready) void refresh();
    }, schedule);
    const timer = window.setInterval(() => { if (!connected) void refresh(); }, 30_000);
    const onVisible = () => { void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { current = false; unsubscribe(); window.clearTimeout(refreshTimer); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [activeConversationId, loadConversations, messaging, mobileContinuity, placeMessage, refreshMobileThread, threadGeneration]);

  useEffect(() => {
    const conversationId = activeConversationId;
    if (!conversationId || activeConversation?.status === 'request') { setIsParticipantTyping(false); return undefined; }
    let expiry: number | undefined;
    const unsubscribe = messaging.subscribeToTyping(conversationId, (profileId, typing) => {
      if (profileId !== activeParticipantId) return;
      window.clearTimeout(expiry);
      setIsParticipantTyping(typing);
      if (typing) expiry = window.setTimeout(() => setIsParticipantTyping(false), 5_000);
    });
    return () => {
      if (isTypingBroadcastRef.current && auth.viewerProfileId) messaging.broadcastTyping(conversationId, auth.viewerProfileId, false);
      window.clearTimeout(expiry);
      isTypingBroadcastRef.current = false;
      unsubscribe();
      setIsParticipantTyping(false);
      if (typingStopTimer.current !== null) window.clearTimeout(typingStopTimer.current);
    };
  }, [activeConversationId, activeParticipantId, activeConversation?.status, auth.viewerProfileId, messaging]);

  const broadcastTyping = useCallback((isTyping: boolean) => {
    const conversationId = activeRef.current?.id;
    const profileId = auth.viewerProfileId;
    if (!conversationId || !profileId || activeRef.current?.status === 'request') return;
    if (isTyping !== isTypingBroadcastRef.current) {
      messaging.broadcastTyping(conversationId, profileId, isTyping);
      isTypingBroadcastRef.current = isTyping;
    }
    if (typingStopTimer.current !== null) window.clearTimeout(typingStopTimer.current);
    if (isTyping) typingStopTimer.current = window.setTimeout(() => {
      messaging.broadcastTyping(conversationId, profileId, false);
      isTypingBroadcastRef.current = false;
    }, 1_200);
  }, [auth.viewerProfileId, messaging]);

  const unreadCount = useMemo(() => conversations.filter((conversation) => conversation.isUnread && (conversation.status !== 'request' || conversation.requestedByViewer)).length, [conversations]);
  const requestCount = useMemo(() => conversations.filter((conversation) => conversation.status === 'request' && !conversation.requestedByViewer).length, [conversations]);

  const updatePermission = useCallback(async (permission: MessagingPermission) => {
    const previous = preferences;
    const next = { permission } satisfies MessagingPreferences;
    setPreferences(next);
    setIsSavingPreferences(true);
    setError(null);
    try {
      setPreferences(await messaging.updatePreferences(next));
      await loadConversations({ background: true });
      return true;
    } catch (caught) {
      setPreferences(previous);
      setError(friendlyError(caught, 'Message privacy could not be saved.'));
      return false;
    } finally {
      setIsSavingPreferences(false);
    }
  }, [loadConversations, messaging, preferences]);

  const acceptRequest = useCallback(async () => {
    const conversation = activeRef.current;
    if (!conversation || conversation.status !== 'request' || conversation.requestedByViewer) return false;
    setPendingAction('accept');
    setError(null);
    try {
      const accepted = await messaging.acceptRequest(conversation.id);
      applyConversationPage([accepted], false);
      return true;
    } catch (caught) {
      if (activeRef.current?.id === conversation.id) setError(friendlyError(caught, 'This message request could not be accepted.'));
      return false;
    } finally { if (activeRef.current?.id === conversation.id || activeRef.current === null) setPendingAction(null); }
  }, [applyConversationPage, messaging]);

  const setMuted = useCallback(async (muted: boolean) => {
    const conversation = activeRef.current;
    if (!conversation) return false;
    setPendingAction('mute');
    setError(null);
    try {
      await messaging.setMuted(conversation.id, muted);
      const next = { ...conversation, isMuted: muted };
      applyConversationPage([next], false);
      return true;
    } catch (caught) {
      if (activeRef.current?.id === conversation.id) setError(friendlyError(caught, 'This conversation setting could not be saved.'));
      return false;
    } finally { if (activeRef.current?.id === conversation.id || activeRef.current === null) setPendingAction(null); }
  }, [applyConversationPage, messaging]);

  const removeActiveConversation = useCallback((id: Id) => {
    conversationRequestVersion.current += 1;
    removedConversationIds.current.add(id);
    setConversations((current) => current.filter((conversation) => conversation.id !== id));
    threadCache.current.delete(id);
    if (activeRef.current?.id === id) closeConversation(true);
  }, [closeConversation]);

  const archiveConversation = useCallback(async () => {
    const conversation = activeRef.current;
    if (!conversation) return false;
    setPendingAction('archive');
    setError(null);
    try {
      await messaging.archiveConversation(conversation.id);
      removeActiveConversation(conversation.id);
      return true;
    } catch (caught) {
      if (activeRef.current?.id === conversation.id) setError(friendlyError(caught, 'This conversation could not be archived.'));
      return false;
    } finally { if (activeRef.current?.id === conversation.id || activeRef.current === null) setPendingAction(null); }
  }, [messaging, removeActiveConversation]);

  const deleteRequest = useCallback(async () => {
    const conversation = activeRef.current;
    if (!conversation || conversation.status !== 'request' || conversation.requestedByViewer) return false;
    setPendingAction('delete-request');
    setError(null);
    try {
      await messaging.deleteRequest(conversation.id);
      removeActiveConversation(conversation.id);
      return true;
    } catch (caught) {
      if (activeRef.current?.id === conversation.id) setError(friendlyError(caught, 'This message request could not be deleted.'));
      return false;
    } finally { if (activeRef.current?.id === conversation.id || activeRef.current === null) setPendingAction(null); }
  }, [messaging, removeActiveConversation]);

  const blockParticipant = useCallback(async () => {
    const conversation = activeRef.current;
    if (!conversation) return false;
    setPendingAction('block');
    setError(null);
    try {
      await messaging.blockParticipant(conversation.id);
      removeActiveConversation(conversation.id);
      return true;
    } catch (caught) {
      if (activeRef.current?.id === conversation.id) setError(friendlyError(caught, 'This creator could not be blocked.'));
      return false;
    } finally { if (activeRef.current?.id === conversation.id || activeRef.current === null) setPendingAction(null); }
  }, [messaging, removeActiveConversation]);

  const reportConversation = useCallback(async (reason: string) => {
    const conversation = activeRef.current;
    if (!conversation) return false;
    setPendingAction('report');
    setError(null);
    try {
      await messaging.reportConversation(conversation.id, reason);
      return true;
    } catch (caught) {
      if (activeRef.current?.id === conversation.id) setError(friendlyError(caught, 'This report could not be submitted.'));
      return false;
    } finally { if (activeRef.current?.id === conversation.id || activeRef.current === null) setPendingAction(null); }
  }, [messaging]);

  const isReactionPending = useCallback((messageId: Id) => pendingReactions.get(messageId) === threadOwnerGeneration,
    [pendingReactions, threadOwnerGeneration]);

  return {
    status,
    conversations,
    nextConversationOffset,
    activeConversation: activeRef.current ? activeConversation : null,
    messages: activeRef.current ? messages : [],
    unreadCount,
    requestCount,
    hasOlderMessages: activeRef.current !== null && olderCursor !== null,
    isLoadingThread,
    threadLoadError: mobileContinuity && threadFailure?.generation === threadGeneration && threadFailure.conversationId === activeConversation?.id ? threadFailure.message : null,
    threadUnavailable: mobileContinuity && activeConversation !== null && rejectedThreads.current.get(activeConversation.id) === threadGeneration,
    isRefreshingThread: mobileContinuity && refreshingThread?.generation === threadGeneration && refreshingThread.version === requestVersion.current && refreshingThread.conversationId === activeConversation?.id,
    isLoadingOlder,
    isLoadingMoreConversations,
    isStarting: startingCreatorId !== null,
    startingCreatorId,
    isSending: sendingCount > 0,
    isRealtimeConnected,
    isParticipantTyping,
    preferences,
    isSavingPreferences,
    pendingAction,
    pendingMessageId,
    isReactionPending,
    error,
    dismissError: () => { setError(null); if (mobileContinuity) setThreadFailure(null); },
    retryThread,
    retry: () => loadConversations(),
    loadMoreConversations: () => loadConversations({ append: true }),
    openConversation,
    closeConversation,
    startConversation,
    sendMessage,
    retryMessage,
    loadOlderMessages,
    updatePermission,
    acceptRequest,
    deleteRequest,
    setMuted,
    archiveConversation,
    blockParticipant,
    reportConversation,
    broadcastTyping,
    editMessage,
    deleteMessage,
    toggleReaction,
    searchConversations,
    markVisibleMessagesRead: () => {
      const id = activeRef.current?.id;
      if (id) void markReadThrough(id, threadCache.current.get(id)?.messages ?? []);
    },
  };
}
