import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveIcon, ArrowDownIcon, ArrowLeftIcon, BanIcon, CheckIcon, FileTextIcon, FlagIcon, MessageSquarePlusIcon, MoreHorizontalIcon, PaperclipIcon, PencilIcon, SearchIcon, SendIcon, SettingsIcon, Trash2Icon, Volume2Icon, VolumeXIcon, XIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMessaging } from '../features/messages/useMessaging';
import type { Id } from '../types/domain';
import type { DirectMessage, MessageAttachment } from '../types/messages';
import { NewChatPanel } from './messages/NewChatPanel';
import { CreatorAvatar } from './profile/CreatorAvatar';
import { InterfaceIcon } from './ui/InterfaceIcon';
import type { InterfaceIconSource } from './ui/InterfaceIcon';
import { EmptyState, ErrorState, LoadingState } from './ui/StateViews';
import { ResizablePanelHandle, useResizablePanelWidth } from './ui/ResizablePanelHandle';

type MessagesPageProps = {
  onBack: () => void;
  onOpenCreator?: (creatorId: Id) => void;
  initialRecipientId?: Id | null;
  initialConversationId?: Id | null;
  onConversationChange?: (conversationId: Id | null, replace?: boolean) => void;
};

function messageTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function dayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(date);
}

function readDrafts(key: string): Record<string, string> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch { return {}; }
}

export function MessagesPage({
  onBack,
  onOpenCreator,
  initialRecipientId = null,
  initialConversationId = null,
  onConversationChange,
}: MessagesPageProps) {
  const conversationListWidth = useResizablePanelWidth({
    id: 'messages-conversations',
    defaultWidth: 400,
    minWidth: 280,
    maxWidth: 440,
    viewportReserve: 720,
  });
  const auth = useAuth();
  const messaging = useMessaging({ initialRecipientId, initialConversationId, onConversationChange });
  const [isNewChatOpen, setIsNewChatOpen] = useState(Boolean(initialRecipientId));
  const [conversationFilter, setConversationFilter] = useState<'all' | 'unread' | 'requests'>('all');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Awaited<ReturnType<ReturnType<typeof useMessaging>['searchConversations']>>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isConversationMenuOpen, setIsConversationMenuOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<'archive' | 'block' | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [attachmentsByConversation, setAttachmentsByConversation] = useState<Record<string, File[]>>({});
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const draftStorageKey = `portalink-message-drafts:${auth.viewerProfileId ?? 'account'}`;
  const [drafts, setDrafts] = useState<Record<string, string>>(() => readDrafts(draftStorageKey));
  const messageScrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousThreadRef = useRef<{ conversationId: string | null; lastId: string | null }>({ conversationId: null, lastId: null });
  const searchRequestRef = useRef(0);
  const isAtBottomRef = useRef(true);
  const preserveScrollRef = useRef(false);
  const activeId = messaging.activeConversation?.id ?? null;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const attachments = activeId ? attachmentsByConversation[activeId] ?? [] : [];
  const setAttachments = (update: File[] | ((current: File[]) => File[])) => {
    if (!activeId) return;
    setAttachmentsByConversation((current) => ({ ...current, [activeId]: typeof update === 'function' ? update(current[activeId] ?? []) : update }));
  };
  const markReadRef = useRef(messaging.markVisibleMessagesRead);
  markReadRef.current = messaging.markVisibleMessagesRead;
  const searchConversations = messaging.searchConversations;
  const draft = activeId ? drafts[activeId] ?? '' : '';

  useEffect(() => {
    try { sessionStorage.setItem(draftStorageKey, JSON.stringify(drafts)); } catch { /* A draft can remain in memory when storage is unavailable. */ }
  }, [draftStorageKey, drafts]);

  useEffect(() => {
    if (activeId) setIsNewChatOpen(false);
  }, [activeId]);

  useEffect(() => {
    setIsConversationMenuOpen(false);
    setConfirmation(null);
    setIsReportOpen(false);
    setReportReason('');
    setReportSent(false);
    setAttachmentError(null);
    setHasNewBelow(false);
    isAtBottomRef.current = true;
    preserveScrollRef.current = false;
    if (activeId) document.getElementById('messages-thread-panel')?.focus();
  }, [activeId]);

  useEffect(() => {
    const markVisible = () => { if (isAtBottomRef.current) markReadRef.current(); };
    document.addEventListener('visibilitychange', markVisible);
    return () => document.removeEventListener('visibilitychange', markVisible);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(128, Math.max(38, textarea.scrollHeight))}px`;
  }, [draft]);

  useEffect(() => {
    const scroller = messageScrollerRef.current;
    const last = messaging.messages[messaging.messages.length - 1] ?? null;
    const previous = previousThreadRef.current;
    const changedThread = previous.conversationId !== activeId;
    const changedLast = previous.lastId !== (last?.id ?? null);
    previousThreadRef.current = { conversationId: activeId, lastId: last?.id ?? null };
    if (!scroller || preserveScrollRef.current) return;
    if (!changedLast) { if (isAtBottomRef.current) markReadRef.current(); return; }
    if (changedThread || isAtBottomRef.current || last?.senderProfileId === auth.viewerProfileId) {
      requestAnimationFrame(() => {
        if (activeIdRef.current !== activeId) return;
        scroller.scrollTop = scroller.scrollHeight;
        isAtBottomRef.current = true;
        markReadRef.current();
      });
      setHasNewBelow(false);
    } else {
      setHasNewBelow(true);
    }
  }, [activeId, auth.viewerProfileId, messaging.messages]);

  useEffect(() => {
    const term = query.trim();
    const version = ++searchRequestRef.current;
    if (!term) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return undefined;
    }
    setIsSearching(true);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      void searchConversations(term).then((results) => {
        if (searchRequestRef.current === version) setSearchResults(results);
      }).catch(() => {
        if (searchRequestRef.current === version) setSearchError('Conversations could not be searched. Try again.');
      }).finally(() => {
        if (searchRequestRef.current === version) setIsSearching(false);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, searchConversations]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmation) setConfirmation(null);
      else if (isReportOpen) setIsReportOpen(false);
      else if (isConversationMenuOpen) setIsConversationMenuOpen(false);
      else if (isPrivacyOpen) setIsPrivacyOpen(false);
      else if (isNewChatOpen) setIsNewChatOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [confirmation, isConversationMenuOpen, isNewChatOpen, isPrivacyOpen, isReportOpen]);

  const visibleConversations = useMemo(() => {
    const source = query.trim() ? searchResults : messaging.conversations;
    return source.filter((conversation) => {
      if (conversationFilter === 'unread' && !conversation.isUnread) return false;
      if (conversationFilter === 'requests' && (conversation.status !== 'request' || conversation.requestedByViewer)) return false;
      return true;
    });
  }, [conversationFilter, messaging.conversations, query, searchResults]);

  function updateDraft(value: string) {
    if (!activeId) return;
    setDrafts((current) => ({ ...current, [activeId]: value }));
    messaging.broadcastTyping(Boolean(value.trim()));
  }

  function submitMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!activeId || (!draft.trim() && attachments.length === 0)) return;
    const body = draft;
    const files = attachments;
    setDrafts((current) => ({ ...current, [activeId]: '' }));
    setAttachments([]);
    messaging.broadcastTyping(false);
    void messaging.sendMessage(body, files);
  }

  async function loadEarlier() {
    const conversationId = activeId;
    const scroller = messageScrollerRef.current;
    if (!scroller) return;
    const previousHeight = scroller.scrollHeight;
    const previousTop = scroller.scrollTop;
    preserveScrollRef.current = true;
    await messaging.loadOlderMessages();
    requestAnimationFrame(() => {
      if (activeIdRef.current !== conversationId) return;
      scroller.scrollTop = previousTop + (scroller.scrollHeight - previousHeight);
      preserveScrollRef.current = false;
    });
  }

  function scrollToLatest() {
    const scroller = messageScrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    setHasNewBelow(false);
  }

  function openNewMessage() {
    messaging.closeConversation();
    setIsPrivacyOpen(false);
    setIsNewChatOpen(true);
  }

  const showList = !activeId;
  return <section aria-labelledby="messages-heading" className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <header className="ps-panel-toolbar global-control-header shrink-0 gap-3 px-3 sm:px-4">
        <button type="button" onClick={onBack} aria-label="Go back" className="shape-compact flex h-9 w-9 shrink-0 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:hidden">
          <InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl />
        </button>
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 id="messages-heading" className="truncate text-[16px] font-semibold">Messages</h1>
          {messaging.unreadCount > 0 ? <span className="truncate text-[12px] font-medium text-[var(--text-secondary)]">{messaging.unreadCount} unread</span> : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button type="button" aria-expanded={isPrivacyOpen} aria-controls="message-privacy-settings" onClick={() => setIsPrivacyOpen((open) => !open)} aria-label="Message privacy" title="Message privacy" className="shape-compact flex h-9 w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={SettingsIcon} /></button>
          <button type="button" onClick={openNewMessage} aria-label="New message" title="New message" className="shape-compact flex h-9 w-9 items-center justify-center gap-2 text-[14px] font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:w-auto sm:px-3">
            <InterfaceIcon icon={MessageSquarePlusIcon} />
            <span className="hidden sm:inline">New message</span>
          </button>
        </div>
      </header>

      {isPrivacyOpen ? <div id="message-privacy-settings" className="max-h-[min(24rem,50dvh)] shrink-0 overflow-y-auto border-b border-[var(--hairline)] px-4 py-3">
          <fieldset className="shape-container border border-[var(--hairline)] p-3">
            <legend className="px-1 text-[14px] font-semibold text-[var(--text-secondary)]">Who can message you</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ['everyone', 'Everyone', 'New conversations open immediately.'],
                ['requests', 'Requests', 'People you do not follow require approval.'],
                ['following', 'People you follow', 'Only creators you follow can begin a conversation.'],
                ['nobody', 'Nobody', 'No new conversations. Existing ones remain available.'],
              ] as const).map(([value, label, description]) => <label key={value} className="shape-compact flex cursor-pointer items-start gap-2 px-2 py-2 hover:bg-[var(--surface-hover)]">
                  <input type="radio" name="message-permission" value={value} checked={messaging.preferences.permission === value} disabled={messaging.isSavingPreferences} onChange={() => void messaging.updatePermission(value)} className="mt-1 accent-[var(--accent-primary)]" />
                  <span><span className="block text-[14px] font-semibold">{label}</span><span className="block text-[12px] leading-relaxed text-[var(--text-tertiary)]">{description}</span></span>
                </label>)}
            </div>
          </fieldset>
          {messaging.error ? <div className="mt-3 flex items-start justify-between gap-3 text-[14px] text-[var(--status-danger)]" role="alert"><span>{messaging.error}</span><button type="button" onClick={messaging.dismissError} className="shrink-0 font-semibold underline">Dismiss</button></div> : null}
        </div> : null}

      <div className="flex min-h-0 flex-1">
        <aside data-resizable-panel="" style={{ ['--messages-sidebar-width' as string]: `${conversationListWidth.width}px` }} className={`${showList ? 'flex' : 'hidden'} ps-panel relative min-h-0 w-full shrink-0 flex-col border-r border-[var(--hairline)] lg:flex lg:w-[min(var(--messages-sidebar-width),46%)]`} aria-label="Conversations">
          {isNewChatOpen ? <NewChatPanel
              onClose={() => { setIsNewChatOpen(false); messaging.dismissError(); }}
              startingCreatorId={messaging.startingCreatorId}
              startError={messaging.error}
              onDismissError={messaging.dismissError}
              onSelectCreator={(profileId) => { void messaging.startConversation(profileId); }}
            /> : <>
              <div className="shrink-0 space-y-3 px-4 py-4">
                <label className="text-control-shell group flex h-10 items-center gap-2.5 rounded-[8px] px-3.5">
                  <InterfaceIcon icon={SearchIcon} className="text-[var(--text-tertiary)] group-focus-within:text-[var(--accent-text)]" />
                  <span className="sr-only">Search conversations</span>
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
                </label>
                <div className="flex gap-1.5" role="group" aria-label="Conversation filter">
                  <FilterChip label="All" isActive={conversationFilter === 'all'} onSelect={() => setConversationFilter('all')} />
                  <FilterChip label="Unread" isActive={conversationFilter === 'unread'} onSelect={() => setConversationFilter('unread')} />
                  <FilterChip label={`Requests${messaging.requestCount ? ` ${messaging.requestCount}` : ''}`} isActive={conversationFilter === 'requests'} onSelect={() => setConversationFilter('requests')} />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto border-t border-[var(--hairline)]">
                {isSearching ? <div className="px-4 pt-3 text-[12px] text-[var(--text-secondary)]" role="status">Searching…</div> : null}
                {searchError ? <div className="mx-4 mt-3 text-[12px] text-[var(--status-danger)]" role="alert">{searchError}</div> : null}
                {messaging.status === 'loading' && messaging.conversations.length === 0 ? <div className="p-5"><LoadingState label="Loading conversations" /></div> : null}
                {messaging.status === 'error' && messaging.conversations.length === 0 ? <div className="p-5"><ErrorState title="Messages could not be loaded" description={messaging.error ?? undefined} onRetry={() => void messaging.retry()} /></div> : null}
                {messaging.status === 'success' && visibleConversations.length === 0 ? <div className="p-5"><EmptyState title={conversationFilter === 'unread' ? 'No unread messages' : conversationFilter === 'requests' ? 'No message requests' : query.trim() ? 'No matching conversations' : 'No conversations yet'} description={conversationFilter === 'unread' ? 'You are all caught up.' : conversationFilter === 'requests' ? 'New requests will appear here for you to review.' : query.trim() ? 'Try another name or message.' : 'Start a conversation with another creator.'} action={conversationFilter === 'all' && !query.trim() ? { label: 'New message', onClick: openNewMessage } : undefined} /></div> : null}
                <ul>
                  {visibleConversations.map((conversation) => <li key={conversation.id}>
                      <button type="button" onClick={() => void messaging.openConversation(conversation)} aria-current={activeId === conversation.id ? 'true' : undefined} className={`ps-list-btn flex w-full items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 text-left hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${activeId === conversation.id ? 'bg-[var(--surface-selected)]' : ''}`}>
                        <CreatorAvatar name={conversation.participant.name} avatar={conversation.participant.avatar} className="h-11 w-11 text-[14px]" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`truncate text-[14px] ${conversation.isUnread ? 'font-bold' : 'font-semibold'}`}>{conversation.participant.name}</span>
                            {conversation.lastMessageAt ? <time dateTime={conversation.lastMessageAt} className="shrink-0 text-[11px] text-[var(--text-tertiary)]">{messageTime(conversation.lastMessageAt)}</time> : null}
                          </span>
                          <span className={`mt-0.5 flex items-center gap-2 text-[12px] ${conversation.isUnread ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                          <span className="min-w-0 flex-1 truncate">{conversation.lastMessage ?? conversation.participant.handle}</span>
                            {conversation.status === 'request' ? <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-text)]">{conversation.requestedByViewer ? 'Pending' : 'Request'}</span> : null}
                            {conversation.isMuted ? <InterfaceIcon icon={VolumeXIcon} className="shrink-0 text-[var(--text-tertiary)]" /> : null}
                            {conversation.isUnread ? <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--social-unread)]"><span className="sr-only">Unread</span></span> : null}
                          </span>
                        </span>
                      </button>
                    </li>)}
                </ul>
                {messaging.nextConversationOffset !== null && !query.trim() ? <div className="p-4">
                    <button type="button" disabled={messaging.isLoadingMoreConversations} onClick={() => void messaging.loadMoreConversations()} className="shape-compact w-full px-4 py-2.5 text-[13px] font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{messaging.isLoadingMoreConversations ? 'Loading…' : 'Show more conversations'}</button>
                  </div> : null}
              </div>
            </>}
          <ResizablePanelHandle desktopOnly side="right" value={conversationListWidth.width} min={280} max={440} onResize={conversationListWidth.updateWidth} onResizeEnd={conversationListWidth.commitWidth} onReset={conversationListWidth.resetWidth} label="Resize conversation list. Double-click to restore its default width." />
        </aside>

        <main id="messages-thread-panel" tabIndex={-1} role="region" aria-label={messaging.activeConversation ? `Conversation with ${messaging.activeConversation.participant.name}` : 'Conversation'} className={`${showList ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col bg-[var(--surface-sunken)] lg:flex`}>
          {messaging.activeConversation ? <>
              <div className="relative flex h-14 shrink-0 items-center gap-2 bg-[var(--surface-canvas)] px-3 sm:px-4">
                <button type="button" onClick={() => messaging.closeConversation()} aria-label="Back to conversations" className="shape-compact flex h-9 w-9 shrink-0 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:hidden">
                  <InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl />
                </button>
                {onOpenCreator ? <button type="button" onClick={() => { const participantId = messaging.activeConversation?.participant.id; if (participantId) onOpenCreator(participantId); }} className="shape-compact flex min-w-0 items-center gap-2.5 px-1 text-left focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                    <RecipientIdentity conversation={messaging.activeConversation} />
                  </button> : <div className="flex min-w-0 items-center gap-2.5"><RecipientIdentity conversation={messaging.activeConversation} /></div>}
                <span className="ml-auto text-[12px] text-[var(--text-tertiary)]" role="status">{messaging.isParticipantTyping ? 'Typing…' : messaging.isRealtimeConnected ? '' : 'Reconnecting…'}</span>
                <button type="button" aria-expanded={isConversationMenuOpen} onClick={() => setIsConversationMenuOpen((open) => !open)} aria-label="Conversation options" className="shape-compact flex h-9 w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={MoreHorizontalIcon} /></button>
                {isConversationMenuOpen ? <div className="absolute right-3 top-12 z-20 w-52 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1.5 shadow-xl" role="menu">
                    <ConversationMenuButton icon={messaging.activeConversation.isMuted ? Volume2Icon : VolumeXIcon} label={messaging.activeConversation.isMuted ? 'Unmute conversation' : 'Mute conversation'} onClick={() => { setIsConversationMenuOpen(false); void messaging.setMuted(!messaging.activeConversation?.isMuted); }} />
                    <ConversationMenuButton icon={ArchiveIcon} label="Archive conversation" onClick={() => { setIsConversationMenuOpen(false); setConfirmation('archive'); }} />
                    <ConversationMenuButton icon={FlagIcon} label="Report conversation" onClick={() => { setIsConversationMenuOpen(false); setIsReportOpen(true); setReportSent(false); }} />
                    <ConversationMenuButton danger icon={BanIcon} label={`Block ${messaging.activeConversation.participant.name}`} onClick={() => { setIsConversationMenuOpen(false); setConfirmation('block'); }} />
                  </div> : null}
              </div>

              <div ref={messageScrollerRef} onScroll={(event) => {
                const node = event.currentTarget;
                const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
                isAtBottomRef.current = atBottom;
                if (atBottom) { setHasNewBelow(false); markReadRef.current(); }
              }} className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-5 sm:px-6">
                {messaging.isLoadingThread ? <LoadingState label="Loading conversation" /> : null}
                {!messaging.isLoadingThread && messaging.hasOlderMessages ? <div className="mb-5 flex justify-center">
                    <button type="button" disabled={messaging.isLoadingOlder} onClick={() => void loadEarlier()} className="shape-compact px-4 py-2 text-[13px] font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{messaging.isLoadingOlder ? 'Loading…' : 'Earlier messages'}</button>
                  </div> : null}
                {!messaging.isLoadingThread && messaging.messages.length === 0 ? <div className="mx-auto mt-10 max-w-[360px]"><EmptyState title={`Message ${messaging.activeConversation.participant.name}`} description="Only you and this creator can access this conversation in Portalink." /></div> : null}
                <MessageList key={activeId} messages={messaging.messages} viewerProfileId={auth.viewerProfileId} participantReadAt={messaging.activeConversation.participantReadAt ?? null} pendingMessageId={messaging.pendingMessageId} onRetry={messaging.retryMessage} onEdit={messaging.editMessage} onDelete={messaging.deleteMessage} onReact={messaging.toggleReaction} />
                {hasNewBelow ? <button type="button" onClick={scrollToLatest} className="sticky bottom-2 mx-auto mt-3 flex items-center gap-2 rounded-full bg-[var(--surface-raised)] px-3 py-2 text-[12px] font-semibold text-[var(--accent-text)] shadow-lg ring-1 ring-[var(--hairline)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={ArrowDownIcon} />New messages</button> : null}
              </div>

              {messaging.error ? <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--hairline)] px-4 py-2 text-[12px] text-[var(--status-danger)]" role="alert"><span>{messaging.error}</span><button type="button" onClick={messaging.dismissError} className="font-semibold underline">Dismiss</button></div> : null}
              {attachmentError ? <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--hairline)] px-4 py-2 text-[12px] text-[var(--status-danger)]" role="alert"><span>{attachmentError}</span><button type="button" onClick={() => setAttachmentError(null)} className="font-semibold underline">Dismiss</button></div> : null}
              {messaging.activeConversation.status === 'request' && !messaging.activeConversation.requestedByViewer ? <div className="shrink-0 border-t border-[var(--hairline)] bg-[var(--surface-canvas)] p-4">
                  <div className="mx-auto flex max-w-[760px] items-center justify-between gap-4">
                    <p className="text-[13px] text-[var(--text-secondary)]">Accept this request before replying.</p>
                    <div className="flex gap-2"><button type="button" onClick={() => setConfirmation('block')} className="shape-compact px-4 py-2 text-[13px] font-semibold text-[var(--status-danger)] hover:bg-[var(--surface-hover)]">Block</button><button type="button" disabled={messaging.pendingAction === 'accept'} onClick={() => void messaging.acceptRequest()} className="shape-compact flex items-center gap-2 bg-[var(--accent-primary)] px-4 py-2 text-[13px] font-semibold text-[var(--accent-foreground)] disabled:opacity-50"><InterfaceIcon icon={CheckIcon} />{messaging.pendingAction === 'accept' ? 'Accepting…' : 'Accept'}</button></div>
                  </div>
                </div> : messaging.activeConversation.status === 'request' && messaging.activeConversation.requestedByViewer && (messaging.activeConversation.hasSentRequest || messaging.messages.some((message) => message.deliveryState !== 'failed')) ? <div className="shrink-0 border-t border-[var(--hairline)] bg-[var(--surface-canvas)] p-4 text-center text-[13px] text-[var(--text-secondary)]">Waiting for {messaging.activeConversation.participant.name} to accept your request.</div> : <form onSubmit={submitMessage} className="shrink-0 border-t border-[var(--hairline)] bg-[var(--surface-canvas)] p-3 sm:p-4">
                {attachments.length > 0 ? <ul className="mx-auto mb-2 flex max-w-[760px] flex-wrap gap-2" aria-label="Selected attachments">
                    {attachments.map((file, index) => <li key={`${file.name}:${file.size}:${index}`} className="flex max-w-full items-center gap-2 rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 text-[12px]"><InterfaceIcon icon={FileTextIcon} /><span className="max-w-48 truncate">{file.name}</span><button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`} className="shape-compact flex h-6 w-6 items-center justify-center"><InterfaceIcon icon={XIcon} size="xs" /></button></li>)}
                  </ul> : null}
                <div className="text-control-shell mx-auto flex max-w-[760px] items-end gap-2 rounded-[22px] p-1.5 pl-2">
                  <label className="shape-compact flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus-within:ring-2 focus-within:ring-[var(--focus-ring)]" title="Attach files">
                    <span className="sr-only">Attach files</span><InterfaceIcon icon={PaperclipIcon} />
                    <input type="file" multiple className="sr-only" onChange={(event) => {
                      const selected = [...(event.target.files ?? [])];
                      const oversized = selected.filter((file) => file.size > 25 * 1024 * 1024);
                      const valid = selected.filter((file) => file.size <= 25 * 1024 * 1024);
                      setAttachments((current) => {
                        const room = Math.max(0, 5 - current.length);
                        if (oversized.length > 0) setAttachmentError('Each attachment can be up to 25 MB.');
                        else if (valid.length > room) setAttachmentError('You can attach up to five files to one message.');
                        else setAttachmentError(null);
                        return [...current, ...valid.slice(0, room)];
                      });
                      event.currentTarget.value = '';
                    }} />
                  </label>
                  <textarea ref={textareaRef} value={draft} onChange={(event) => updateDraft(event.target.value)} onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }} rows={1} maxLength={4000} placeholder="Message" aria-label={`Message ${messaging.activeConversation.participant.name}`} className="max-h-32 min-h-[38px] min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent py-2 text-[16px] leading-[22px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
                  <button type="submit" disabled={!draft.trim() && attachments.length === 0} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[var(--accent-foreground)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40">
                    <InterfaceIcon icon={SendIcon} weight="medium" />
                  </button>
                </div>
                <p className="sr-only" aria-live="polite">{messaging.isSending ? 'Sending message' : ''}</p>
                <p className="mx-auto mt-1 max-w-[760px] px-3 text-[12px] text-[var(--text-tertiary)]">Enter to send · Shift + Enter for a new line · up to 5 attachments, 25 MB each</p>
              </form>}
            </> : <div className="flex flex-1 items-center justify-center px-6 py-10">
              <div className="max-w-[320px] text-center">
                <p className="text-[16px] font-semibold">Your conversations</p>
                <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">Choose a conversation or start a new message.</p>
              </div>
            </div>}
        </main>
      </div>

      {confirmation ? <ConfirmationDialog kind={confirmation} creatorName={messaging.activeConversation?.participant.name ?? 'this creator'} pending={messaging.pendingAction !== null} onCancel={() => setConfirmation(null)} onConfirm={() => {
        if (confirmation === 'archive') void messaging.archiveConversation().then((done) => { if (done) setConfirmation(null); });
        else void messaging.blockParticipant().then((done) => { if (done) setConfirmation(null); });
      }} /> : null}

      {isReportOpen ? <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsReportOpen(false); }}>
          <form role="dialog" aria-modal="true" aria-labelledby="report-conversation-title" onSubmit={(event) => {
            event.preventDefault();
            void messaging.reportConversation(reportReason).then((sent) => { if (sent) { setReportSent(true); setReportReason(''); } });
          }} className="shape-container w-full max-w-[420px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-5 shadow-2xl">
            <h2 id="report-conversation-title" className="text-[17px] font-semibold">Report conversation</h2>
            {reportSent ? <><p className="mt-3 text-[14px] text-[var(--text-secondary)]">Your report has been received. Blocking is separate, so you remain in control of whether this person can contact you.</p><button type="button" onClick={() => setIsReportOpen(false)} className="shape-compact mt-5 w-full bg-[var(--accent-primary)] px-4 py-2.5 text-[14px] font-semibold text-[var(--accent-foreground)]">Done</button></> : <>
                <label className="mt-4 block text-[13px] font-semibold" htmlFor="conversation-report-reason">What happened?</label>
                <textarea id="conversation-report-reason" required maxLength={500} value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="Describe the problem" className="text-control-shell mt-2 min-h-28 w-full resize-y rounded-[9px] p-3 text-[14px]" />
                <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setIsReportOpen(false)} className="shape-compact px-4 py-2 text-[13px] font-semibold hover:bg-[var(--surface-hover)]">Cancel</button><button type="submit" disabled={!reportReason.trim() || messaging.pendingAction === 'report'} className="shape-compact bg-[var(--accent-primary)] px-4 py-2 text-[13px] font-semibold text-[var(--accent-foreground)] disabled:opacity-50">{messaging.pendingAction === 'report' ? 'Sending…' : 'Send report'}</button></div>
              </>}
          </form>
        </div> : null}
    </section>;
}

function RecipientIdentity({ conversation }: { conversation: NonNullable<ReturnType<typeof useMessaging>['activeConversation']> }) {
  return <>
      <CreatorAvatar name={conversation.participant.name} avatar={conversation.participant.avatar} className="h-8 w-8 shrink-0 text-[11px]" />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">{conversation.participant.name}</span>
        <span className="block truncate text-[12px] text-[var(--text-secondary)]">{conversation.participant.handle}</span>
      </span>
    </>;
}

function MessageList({ messages, viewerProfileId, participantReadAt, pendingMessageId, onRetry, onEdit, onDelete, onReact }: {
  messages: DirectMessage[];
  viewerProfileId: Id | null;
  participantReadAt: string | null;
  pendingMessageId: Id | null;
  onRetry: (id: Id) => Promise<boolean>;
  onEdit: (id: Id, body: string) => Promise<boolean>;
  onDelete: (id: Id) => Promise<boolean>;
  onReact: (id: Id, emoji: string) => Promise<boolean>;
}) {
  const [editingId, setEditingId] = useState<Id | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deleteId, setDeleteId] = useState<Id | null>(null);
  let previousDay = '';
  const latestOutgoingId = [...messages].reverse().find((message) => message.senderProfileId === viewerProfileId && message.deliveryState !== 'failed' && message.deliveryState !== 'sending')?.id ?? null;
  return <ol className="mx-auto flex w-full max-w-[760px] flex-col gap-2" aria-label="Messages">
      {messages.map((message) => {
        const isMine = message.senderProfileId === viewerProfileId;
        const day = dayLabel(message.createdAt);
        const showDay = day !== previousDay;
        previousDay = day;
        return <React.Fragment key={message.id}>
            {showDay ? <li className="py-3 text-center text-[11px] font-medium text-[var(--text-tertiary)]">{day}</li> : null}
            <li className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`group/message max-w-[78%] rounded-[18px] px-3.5 py-2.5 ${isMine ? 'bg-[var(--accent-primary)] text-[var(--accent-foreground)]' : 'bg-[var(--surface-raised)] text-[var(--text-primary)] ring-1 ring-[var(--hairline)]'} ${message.deliveryState === 'failed' ? 'ring-2 ring-[var(--status-danger)]' : ''}`}>
                {editingId === message.id ? <form onSubmit={(event) => { event.preventDefault(); void onEdit(message.id, editBody).then((saved) => { if (saved) setEditingId(null); }); }}>
                    <textarea autoFocus value={editBody} onChange={(event) => setEditBody(event.target.value)} maxLength={4000} className="min-h-20 w-full resize-y rounded-[9px] bg-[var(--surface-canvas)] p-2 text-[15px] text-[var(--text-primary)]" />
                    <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setEditingId(null)} className="text-[12px] font-semibold underline">Cancel</button><button type="submit" disabled={!editBody.trim() || pendingMessageId === message.id} className="text-[12px] font-semibold underline disabled:opacity-50">Save</button></div>
                  </form> : <p className="whitespace-pre-wrap break-words text-[16px] leading-6">{message.body}</p>}
                {message.attachments?.length ? <ul className="mt-2 grid gap-2">
                    {message.attachments.map((attachment) => <li key={attachment.id}><MessageAttachmentView attachment={attachment} /></li>)}
                  </ul> : null}
                <span className="mt-1 flex items-center justify-end gap-2 text-[11px]">
                  <time dateTime={message.createdAt} className={isMine ? 'opacity-75' : 'text-[var(--text-tertiary)]'}>{messageTime(message.createdAt)}</time>
                  {message.editedAt ? <span className="opacity-70">Edited</span> : null}
                  {message.deliveryState === 'sending' ? <span className="opacity-75">Sending…</span> : null}
                  {message.deliveryState === 'failed' ? <button type="button" onClick={() => void onRetry(message.id)} className="font-semibold underline">Retry</button> : null}
                  {message.id === latestOutgoingId && message.deliveryState !== 'failed' ? <span className="opacity-75">{participantReadAt && participantReadAt >= message.createdAt ? 'Read' : 'Sent'}</span> : null}
                </span>
                {!message.id.startsWith('local-') ? <div className="mt-2 flex flex-wrap items-center gap-1">
                    {(message.reactions ?? []).map((reaction) => <button key={reaction.emoji} type="button" aria-pressed={reaction.isMine} disabled={pendingMessageId === message.id} onClick={() => void onReact(message.id, reaction.emoji)} className={`rounded-full px-2 py-0.5 text-[12px] ring-1 ${reaction.isMine ? 'bg-white/20 ring-current' : 'bg-black/10 ring-black/10'}`}>{reaction.emoji} {reaction.count}</button>)}
                    {(['❤', '👏', '✨'] as const).filter((emoji) => !(message.reactions ?? []).some((reaction) => reaction.emoji === emoji)).map((emoji) => <button key={emoji} type="button" disabled={pendingMessageId === message.id} onClick={() => void onReact(message.id, emoji)} aria-label={`React ${emoji}`} className="rounded-full px-1.5 py-0.5 text-[12px] opacity-0 hover:bg-black/10 focus:opacity-100 group-hover/message:opacity-70">{emoji}</button>)}
                    {isMine ? <><button type="button" onClick={() => { setEditingId(message.id); setEditBody(message.body); }} aria-label="Edit message" className="shape-compact ml-auto flex h-7 w-7 items-center justify-center opacity-0 focus:opacity-100 group-hover/message:opacity-70"><InterfaceIcon icon={PencilIcon} size="xs" /></button><button type="button" onClick={() => setDeleteId(message.id)} aria-label="Unsend message" className="shape-compact flex h-7 w-7 items-center justify-center opacity-0 focus:opacity-100 group-hover/message:opacity-70"><InterfaceIcon icon={Trash2Icon} size="xs" /></button></> : null}
                  </div> : null}
                {deleteId === message.id ? <div className="mt-2 rounded-[9px] bg-black/10 p-2 text-[12px]"><p>Unsend this message for both people?</p><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setDeleteId(null)} className="font-semibold underline">Cancel</button><button type="button" disabled={pendingMessageId === message.id} onClick={() => void onDelete(message.id).then((removed) => { if (removed) setDeleteId(null); })} className="font-semibold underline">Unsend</button></div></div> : null}
              </div>
            </li>
          </React.Fragment>;
      })}
    </ol>;
}

function FilterChip({ label, isActive, onSelect }: { label: string; isActive: boolean; onSelect: () => void }) {
  return <button type="button" aria-pressed={isActive} onClick={onSelect} className={`ps-nav-item rounded-full px-3 py-1.5 text-[12px] font-semibold focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isActive ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--accent-text)]'}`}>{label}</button>;
}

function ConversationMenuButton({ icon, label, danger = false, onClick }: { icon: InterfaceIconSource; label: string; danger?: boolean; onClick: () => void }) {
  return <button type="button" role="menuitem" onClick={onClick} className={`shape-compact flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] font-medium hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${danger ? 'text-[var(--status-danger)]' : 'text-[var(--text-primary)]'}`}><InterfaceIcon icon={icon} /><span>{label}</span></button>;
}

function MessageAttachmentView({ attachment }: { attachment: MessageAttachment }) {
  if (attachment.mimeType.startsWith('image/')) return <a href={attachment.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[12px] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><img src={attachment.url} alt={attachment.fileName} className="max-h-72 w-full object-cover" /></a>;
  if (attachment.mimeType.startsWith('audio/')) return <div><p className="mb-1 truncate text-[12px] font-medium">{attachment.fileName}</p><audio controls preload="metadata" src={attachment.url} className="max-w-full" /></div>;
  if (attachment.mimeType.startsWith('video/')) return <video controls preload="metadata" src={attachment.url} className="max-h-72 w-full rounded-[12px]" aria-label={attachment.fileName} />;
  return <a href={attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-[10px] bg-black/10 px-3 py-2 text-[13px] font-semibold underline focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={FileTextIcon} /><span className="min-w-0 truncate">{attachment.fileName}</span></a>;
}

function ConfirmationDialog({ kind, creatorName, pending, onCancel, onConfirm }: { kind: 'archive' | 'block'; creatorName: string; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  const isBlock = kind === 'block';
  return <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onCancel(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="conversation-confirm-title" aria-describedby="conversation-confirm-description" className="shape-container w-full max-w-[400px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-5 shadow-2xl">
        <h2 id="conversation-confirm-title" className="text-[17px] font-semibold">{isBlock ? `Block ${creatorName}?` : 'Archive this conversation?'}</h2>
        <p id="conversation-confirm-description" className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">{isBlock ? 'They will not be able to start or continue conversations with you. The conversation will leave your list.' : 'This removes the conversation from your list. Starting a new message with this creator will restore it.'}</p>
        <div className="mt-5 flex justify-end gap-2"><button autoFocus type="button" disabled={pending} onClick={onCancel} className="shape-compact px-4 py-2 text-[13px] font-semibold hover:bg-[var(--surface-hover)] disabled:opacity-50">Cancel</button><button type="button" disabled={pending} onClick={onConfirm} className={`shape-compact px-4 py-2 text-[13px] font-semibold disabled:opacity-50 ${isBlock ? 'bg-[var(--status-danger)] text-white' : 'bg-[var(--accent-primary)] text-[var(--accent-foreground)]'}`}>{pending ? 'Working…' : isBlock ? 'Block' : 'Archive'}</button></div>
      </div>
    </div>;
}
