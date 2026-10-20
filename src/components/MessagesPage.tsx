import { messageReactionOption } from './messages/messageReactionIcons';
import { useUnderHeaderScroll } from '../presentation/mobile/useUnderHeaderScroll';
import { MessageBody } from './messages/MessageBody';
import { ConfirmationDialog } from './ui/ConfirmationDialog';
import { MobileContextButton, useMobileScreenActions, useMobileHold } from '../presentation/mobile/MobileContextActions';
import { contextActions } from '../presentation/mobile/contextActions';
import { useMenuFocus } from '../hooks/useMenuFocus';
import { ScreenBack } from '../presentation/mobile/MobileBackNavigation';
import { usePresentation } from '../presentation/usePresentation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownIcon, ArrowLeftIcon, BanIcon, CheckIcon, FileTextIcon, FlagIcon, MessageSquarePlusIcon, MoreHorizontalIcon, PaperclipIcon, PencilIcon, PlusIcon, SearchIcon, SendIcon, SettingsIcon, Trash2Icon, Volume2Icon, VolumeXIcon, XIcon } from 'lucide-react';
import { buildPath } from '../app/routes';
import { useAuth } from '../contexts/AuthContext';
import { useMessaging } from '../features/messages/useMessaging';
import type { Id } from '../types/domain';
import type { DirectMessage, MessageAttachment } from '../types/messages';
import { NewChatPanel } from './messages/NewChatPanel';
import { MessageControlsDialog } from './messages/MessageControlsDialog';
import { MobileMessageActions } from './messages/MobileMessageActions';
import { useConversationKeyboard } from './messages/useConversationKeyboard';
import { useDialogViewport } from '../hooks/useDialogViewport';
import { CreatorAvatar } from './profile/CreatorAvatar';
import { ProfileAvatar } from './profile/ProfileAvatar';
import { InterfaceIcon } from './ui/InterfaceIcon';
import type { InterfaceIconSource } from './ui/InterfaceIcon';
import { EmptyState, ErrorState, LoadingState } from './ui/StateViews';
import { ResizablePanelHandle, useResizablePanelWidth } from './ui/ResizablePanelHandle';

type MessagesPageProps = {
  onBack: () => void;
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
  initialRecipientId = null,
  initialConversationId = null,
  onConversationChange,
}: MessagesPageProps) {
  const navigate = useNavigate();
  const searchInput = useRef<HTMLInputElement>(null);
  const conversationListWidth = useResizablePanelWidth({
    id: 'messages-conversations',
    defaultWidth: 400,
    minWidth: 280,
    maxWidth: 440,
    viewportReserve: 720,
  });
  const auth = useAuth();
  const isMobile = usePresentation() === 'mobile';
  const messaging = useMessaging({
    initialRecipientId, initialConversationId,
    // Mobile thread selection is a step within Messages. Returning to the list
    // must not leave duplicate list/thread entries in the browser's Back trail.
    onConversationChange: (id, replace) => onConversationChange?.(id, isMobile ? true : replace),
  });
  const [isNewChatOpen, setIsNewChatOpen] = useState(Boolean(initialRecipientId));
  const [conversationFilter, setConversationFilter] = useState<'all' | 'unread' | 'requests'>('all');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Awaited<ReturnType<ReturnType<typeof useMessaging>['searchConversations']>>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resultQuery, setResultQuery] = useState<string | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isConversationMenuOpen, setIsConversationMenuOpen] = useState(false);
  const conversationMenuRef = useRef<HTMLDivElement>(null);
  const conversationTriggerRef = useRef<HTMLButtonElement>(null);
  const conversationMenuFocus = useMenuFocus({ open: isConversationMenuOpen, menuRef: conversationMenuRef, triggerRef: conversationTriggerRef, onOpen: () => setIsConversationMenuOpen(true), onClose: () => setIsConversationMenuOpen(false) });
  const [confirmation, setConfirmation] = useState<'delete-request' | 'delete-chat' | 'block' | null>(null);
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
  const isMessageRequest = messaging.activeConversation?.status === 'request';
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
    if (activeId) {
      setIsNewChatOpen(false);
      setIsPrivacyOpen(false);
    }
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
    if (activeId) {
      if (isMobile && isMessageRequest) textareaRef.current?.focus({ preventScroll: true });
      else document.getElementById('messages-thread-panel')?.focus();
    }
  }, [activeId, isMobile, isMessageRequest]);

  useEffect(() => {
    const markVisible = () => { if (isAtBottomRef.current) markReadRef.current(); };
    document.addEventListener('visibilitychange', markVisible);
    return () => document.removeEventListener('visibilitychange', markVisible);
  }, []);

  useEffect(() => {
    if (!isMessageRequest && isAtBottomRef.current) markReadRef.current();
  }, [activeId, isMessageRequest]);

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
    setSearchResults([]);
    const timer = window.setTimeout(() => {
      void searchConversations(term).then((results) => {
        if (searchRequestRef.current === version) { setSearchResults(results); setResultQuery(term); }
      }).catch(() => {
        if (searchRequestRef.current === version) { setSearchResults([]); setResultQuery(term); setSearchError('Conversations could not be searched. Try again.'); }
      }).finally(() => {
        if (searchRequestRef.current === version) setIsSearching(false);
      });
    }, 220);
    return () => { window.clearTimeout(timer); searchRequestRef.current++; };
  }, [query, searchConversations, searchAttempt]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (confirmation) setConfirmation(null);
      else if (isReportOpen) setIsReportOpen(false);
      else if (isPrivacyOpen) setIsPrivacyOpen(false);
      else if (isNewChatOpen) setIsNewChatOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [confirmation, isNewChatOpen, isPrivacyOpen, isReportOpen]);

  const visibleConversations = useMemo(() => {
    const source = query.trim() ? resultQuery === query.trim() ? searchResults : [] : messaging.conversations;
    return source.filter((conversation) => {
      if (conversation.isDraft) return false;
      const isIncomingRequest = conversation.status === 'request' && !conversation.requestedByViewer;
      if (conversationFilter !== 'requests' && isIncomingRequest) return false;
      if (conversationFilter === 'unread' && !conversation.isUnread) return false;
      if (conversationFilter === 'requests' && !isIncomingRequest) return false;
      return true;
    });
  }, [conversationFilter, messaging.conversations, query, searchResults, resultQuery]);

  function updateDraft(value: string) {
    if (!activeId) return;
    setDrafts((current) => ({ ...current, [activeId]: value }));
    messaging.broadcastTyping(Boolean(value.trim()));
  }

  function submitMessage(event: React.FormEvent) {
    event.preventDefault();
    if (messaging.isSending || !activeId || (!draft.trim() && attachments.length === 0)) return;
    const body = draft;
    const files = isMessageRequest ? [] : attachments;
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

  function goBackFromMessages() {
    if (isNewChatOpen) {
      setIsNewChatOpen(false);
      messaging.closeConversation(); // Also cancels a pending conversation start.
    } else if (activeId || initialConversationId) {
      messaging.closeConversation();
    } else {
      onBack();
    }
  }

  const conversation = messaging.activeConversation;
  const participantId = conversation?.participant.id;
  useMobileScreenActions(contextActions(conversation ? 'conversation' : 'messages', { signedIn: auth.isAuthenticated }, { title: conversation ? conversation.participant.name : 'Messages', handlers: conversation ? {
    viewProfile: participantId ? () => navigate(buildPath('profile', { profileId: participantId })) : undefined,
    mute: () => messaging.setMuted(!conversation.isMuted),
    deleteChat: () => setConfirmation('delete-chat'),
    block: conversation.participant.id ? () => setConfirmation('block') : undefined,
    report: () => { setIsReportOpen(true); setReportSent(false); },
  } : { newMessage: openNewMessage, search: !isNewChatOpen ? () => searchInput.current?.focus() : undefined, blocked: () => setIsPrivacyOpen(true) }, labels: { mute: conversation?.isMuted ? 'Unmute' : 'Mute' } }));
  const showList = !activeId;
  const conversationViewport = useDialogViewport<HTMLElement>(isMobile && !showList && Boolean(conversation));
  useConversationKeyboard(isMobile && !showList && Boolean(conversation), activeId, conversationViewport, messageScrollerRef, textareaRef);
  const isMobileNewChat = isMobile && isNewChatOpen;
  useUnderHeaderScroll(conversationViewport, isMobile && !isMobileNewChat, showList ? 'inbox' : 'chat');
  const hideMobileListHeader = isMobile && showList && !isMobileNewChat;
  return <section ref={conversationViewport} data-messages-page="" data-mobile-new-message={isMobileNewChat || undefined} data-mobile-chat={isMobile && !showList && Boolean(messaging.activeConversation) || undefined} data-mobile-inbox={hideMobileListHeader || undefined} aria-labelledby="messages-heading" style={{ ['--messages-sidebar-width' as string]: `${conversationListWidth.width}px` }} className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {hideMobileListHeader ? <>
        <ScreenBack action={goBackFromMessages}>{null}</ScreenBack>
        <h1 id="messages-heading" className="sr-only">Messages</h1>
      </> : <header data-mobile-safe-header="" className="ps-panel-toolbar global-control-header relative z-20 shrink-0 !gap-0">
        <div className={`${showList ? 'flex' : 'hidden'} side-panel-content-inset h-full min-w-0 w-full shrink-0 items-center gap-[var(--side-panel-row-gap)] lg:flex lg:w-[min(var(--messages-sidebar-width),46%)] lg:border-r lg:border-[var(--hairline)]`}>
        <ScreenBack action={goBackFromMessages}><button data-ui-control="icon" data-control-size="md" data-control-variant="ghost" type="button" onClick={isMobile ? goBackFromMessages : onBack} aria-label={isMobileNewChat ? 'Back to messages' : 'Go back'} className="side-panel-compact-control shape-compact flex shrink-0 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:hidden">
          <InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl />
        </button></ScreenBack>
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 id="messages-heading" className="truncate text-[16px] font-semibold">{isMobileNewChat ? 'New message' : 'Messages'}</h1>
          {!isMobileNewChat && messaging.unreadCount > 0 ? <span className="truncate text-[12px] font-medium text-[var(--text-secondary)]">{messaging.unreadCount} unread</span> : null}
        </div>
        {!isMobileNewChat ? <div className="side-panel-control-row ml-auto shrink-0">
          <button data-ui-control="icon" data-control-size="md" data-control-variant="ghost" type="button" aria-expanded={isPrivacyOpen} aria-controls="message-privacy-settings" onClick={() => setIsPrivacyOpen((open) => !open)} aria-haspopup="dialog" aria-label="Message settings" title="Message settings" className="side-panel-compact-control shape-compact flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={SettingsIcon} /></button>
          <button data-ui-control="icon" data-control-size="md" data-control-variant="ghost" type="button" onClick={openNewMessage} aria-label="New message" title="New message" className="side-panel-compact-control shape-compact flex items-center justify-center text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={MessageSquarePlusIcon} />
          </button>
        </div> : null}
        </div>
        {messaging.activeConversation ? <div data-conversation-header="" className="side-panel-content-inset relative flex h-full min-w-0 flex-1 items-center gap-3">
          <ScreenBack visibleOnMobile><button data-ui-control="icon" data-control-size="md" data-control-variant="ghost" type="button" onClick={() => messaging.closeConversation()} aria-label="Back to conversations" className="side-panel-compact-control shape-compact flex shrink-0 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:hidden">
            <InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl />
          </button></ScreenBack>
          {isMobile ? <Link data-conversation-identity="" to={messaging.activeConversation.participant.id ? buildPath('profile', { profileId: messaging.activeConversation.participant.id }) : '#'} aria-label={`View ${messaging.activeConversation.participant.name}'s profile`} aria-disabled={!messaging.activeConversation.participant.id} onClick={event => { if (!messaging.activeConversation?.participant.id) event.preventDefault(); }}>
            <CreatorAvatar name={messaging.activeConversation.participant.name} avatar={messaging.activeConversation.participant.avatar} className="h-12 w-12" />
            <RecipientIdentity conversation={messaging.activeConversation} />
          </Link> : <><ProfileAvatar key={messaging.activeConversation.participant.id} name={messaging.activeConversation.participant.name} avatar={messaging.activeConversation.participant.avatar} />
          {messaging.activeConversation.participant.id ? <Link to={buildPath('profile', { profileId: messaging.activeConversation.participant.id })} className="shape-compact inline-flex h-10 min-w-0 flex-initial items-center text-left hover:text-[var(--accent-text)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <RecipientIdentity conversation={messaging.activeConversation} />
          </Link> : <RecipientIdentity conversation={messaging.activeConversation} />}</>}
          <span className="ml-auto min-w-0 max-w-[35%] truncate text-[12px] text-[var(--text-tertiary)]" role="status">{messaging.isParticipantTyping ? 'Typing…' : messaging.isRealtimeConnected ? '' : 'Reconnecting…'}</span>
          {isMobile ? <div data-inline-screen-actions=""><MobileContextButton /></div> : <button data-ui-control="icon" data-control-size="md" data-control-variant="ghost" ref={conversationTriggerRef} onKeyDown={conversationMenuFocus.onTriggerKeyDown} aria-haspopup="menu" type="button" aria-expanded={isConversationMenuOpen} onClick={() => setIsConversationMenuOpen((open) => !open)} aria-label="Conversation options" className="side-panel-compact-control shape-compact flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={MoreHorizontalIcon} /></button>}
          {isConversationMenuOpen ? <div ref={conversationMenuRef} tabIndex={-1} aria-label="Conversation options" className="absolute right-[var(--side-panel-content-inset)] top-[calc(100%+var(--side-panel-row-gap))] z-20 w-52 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1.5 shadow-xl" role="menu">
              <ConversationMenuButton icon={messaging.activeConversation.isMuted ? Volume2Icon : VolumeXIcon} label={messaging.activeConversation.isMuted ? 'Unmute conversation' : 'Mute conversation'} onClick={() => { setIsConversationMenuOpen(false); void messaging.setMuted(!messaging.activeConversation?.isMuted); }} />
              <ConversationMenuButton danger icon={Trash2Icon} label="Delete chat" onClick={() => { setIsConversationMenuOpen(false); setConfirmation('delete-chat'); }} />
              <ConversationMenuButton icon={FlagIcon} label="Report conversation" onClick={() => { setIsConversationMenuOpen(false); setIsReportOpen(true); setReportSent(false); }} />
              {messaging.activeConversation.participant.id ? <ConversationMenuButton danger icon={BanIcon} label={`Block ${messaging.activeConversation.participant.name}`} onClick={() => { setIsConversationMenuOpen(false); setConfirmation('block'); }} /> : null}
            </div> : null}
        </div> : null}
      </header>}

      {isPrivacyOpen ? <MessageControlsDialog permission={messaging.preferences.permission} isSaving={messaging.isSavingPreferences} error={messaging.error} onChange={messaging.updatePermission} onClose={() => setIsPrivacyOpen(false)} /> : null}

      <div data-messages-body="" className="flex min-h-0 flex-1">
        <aside data-resizable-panel="" className={`${showList ? 'flex' : 'hidden'} ps-panel relative min-h-0 w-full shrink-0 flex-col border-r border-[var(--hairline)] lg:flex lg:w-[min(var(--messages-sidebar-width),46%)]`} aria-label="Conversations">
          {isNewChatOpen ? <NewChatPanel
              showHeader={!isMobile}
              onClose={() => { setIsNewChatOpen(false); messaging.dismissError(); }}
              startingCreatorId={messaging.startingCreatorId}
              startError={messaging.error}
              onDismissError={messaging.dismissError}
              onSelectCreator={(profileId) => { void messaging.startConversation(profileId); }}
            /> : <>
              <div data-inbox-controls="" className="side-panel-control-stack side-panel-content-inset shrink-0">
                <div className={isMobile ? "mobile-screen-action-row" : undefined}><label className="text-control-shell side-panel-primary-control group flex items-center gap-2.5 px-3">
                  <InterfaceIcon icon={SearchIcon} className="text-[var(--text-tertiary)] group-focus-within:text-[var(--accent-text)]" />
                  <span className="sr-only">Search conversations</span>
                  <input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
                </label>
                {isMobile && <div data-inline-screen-actions=""><MobileContextButton /></div>}</div>
                <div className="side-panel-filter-grid" role="group" aria-label="Conversation filter">
                  <FilterChip label="Chats" isActive={conversationFilter === 'all'} onSelect={() => setConversationFilter('all')} />
                  <FilterChip label="Unread" isActive={conversationFilter === 'unread'} onSelect={() => setConversationFilter('unread')} />
                  <FilterChip label={`Requests${messaging.requestCount ? ` ${messaging.requestCount}` : ''}`} isActive={conversationFilter === 'requests'} onSelect={() => setConversationFilter('requests')} />
                </div>
              </div>

              <div data-mobile-scroll-end="" className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto">
                {isSearching ? <div className="side-panel-content-inset pt-3 text-[12px] text-[var(--text-secondary)]" role="status">Searching…</div> : null}
                {searchError ? <div className="side-panel-content-inset mt-3 text-[12px] text-[var(--status-danger)]" role="alert">{searchError}<button type="button" className="ml-2 min-h-11 underline" onClick={() => setSearchAttempt(value => value + 1)}>Try again</button></div> : null}
                {messaging.status === 'loading' && messaging.conversations.length === 0 ? <div className="side-panel-content-inset py-5"><LoadingState kind="messages" label="Loading conversations" /></div> : null}
                {messaging.status === 'error' && messaging.conversations.length === 0 ? <div className="side-panel-content-inset py-5"><ErrorState title="Messages could not be loaded" description={messaging.error ?? undefined} onRetry={() => void messaging.retry()} /></div> : null}
                {messaging.status === 'success' && visibleConversations.length === 0 && !isSearching && !searchError ? <div className="side-panel-content-inset py-5"><EmptyState title={query.trim() ? 'No matching conversations' : conversationFilter === 'unread' ? 'No unread messages' : conversationFilter === 'requests' ? 'No message requests' : 'No conversations yet'} description={query.trim() ? 'Try another name or message.' : conversationFilter === 'unread' ? 'You are all caught up.' : conversationFilter === 'requests' ? 'New requests will appear here for you to review.' : 'Start a conversation with another creator.'} action={(query.trim() || conversationFilter !== 'all') ? { label: query.trim() ? 'Clear search' : 'Clear filter', onClick: () => { if (query.trim()) setQuery(''); else setConversationFilter('all'); } } : conversationFilter === 'all' && !query.trim() ? { label: 'New message', onClick: openNewMessage } : undefined} /></div> : null}
                <ul className="side-panel-content-inset side-panel-navigation-list pb-2 inset-row-group inset-row-group-icons">
                  {visibleConversations.map((conversation) => <li key={conversation.id}>
                      <div data-selected={activeId === conversation.id ? 'true' : undefined} className="message-contact-row flex w-full items-center gap-3 p-2">
                        <ProfileAvatar name={conversation.participant.name} avatar={conversation.participant.avatar} />
                        <button type="button" onClick={() => void messaging.openConversation(conversation)} aria-current={activeId === conversation.id ? 'true' : undefined} className="flex min-w-0 flex-1 self-stretch items-center text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={`truncate text-[14px] ${conversation.isUnread ? 'font-bold' : 'font-semibold'}`}>{conversation.participant.name}</span>
                            {conversation.lastMessageAt ? <time dateTime={conversation.lastMessageAt} className="shrink-0 text-[11px] text-[var(--text-tertiary)]">{messageTime(conversation.lastMessageAt)}</time> : null}
                          </span>
                          <span className={`mt-0.5 flex items-center gap-2 text-[12px] ${conversation.isUnread ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                          <span className="min-w-0 flex-1 truncate">{conversation.lastMessage ?? 'No messages yet'}</span>
                            {conversation.status === 'request' ? <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-text)]">{conversation.requestedByViewer ? 'Pending' : 'Request'}</span> : null}
                            {conversation.isMuted ? <InterfaceIcon icon={VolumeXIcon} className="shrink-0 text-[var(--text-tertiary)]" /> : null}
                            {conversation.isUnread ? <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--social-unread)]"><span className="sr-only">Unread</span></span> : null}
                          </span>
                        </span>
                        </button>
                      </div>
                    </li>)}
                </ul>
                {messaging.nextConversationOffset !== null && !query.trim() ? <div className="side-panel-content-inset py-4">
                    <button type="button" disabled={messaging.isLoadingMoreConversations} onClick={() => void messaging.loadMoreConversations()} className="side-panel-primary-control w-full justify-center px-3 text-[13px] font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{messaging.isLoadingMoreConversations ? 'Loading…' : 'Show more conversations'}</button>
                  </div> : null}
              </div>
            </>}
          <ResizablePanelHandle desktopOnly side="right" value={conversationListWidth.width} min={280} max={440} onResize={conversationListWidth.updateWidth} onResizeEnd={conversationListWidth.commitWidth} onReset={conversationListWidth.resetWidth} label="Resize conversation list. Double-click to restore its default width." />
        </aside>

        <main id="messages-thread-panel" tabIndex={-1} role="region" aria-label={messaging.activeConversation ? `Conversation with ${messaging.activeConversation.participant.name}` : 'Conversation'} className={`${showList ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface-canvas)] lg:flex`}>
          {messaging.activeConversation ? <>
              <div data-message-scroll="" ref={messageScrollerRef} onScroll={(event) => {
                const node = event.currentTarget;
                const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
                isAtBottomRef.current = atBottom;
                if (atBottom) { setHasNewBelow(false); markReadRef.current(); }
              }} className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-5 sm:px-6">
                {messaging.isLoadingThread ? <LoadingState kind="conversation" label="Loading conversation" /> : null}
                {!messaging.isLoadingThread && messaging.hasOlderMessages ? <div className="mb-5 flex justify-center">
                    <button type="button" disabled={messaging.isLoadingOlder} onClick={() => void loadEarlier()} className="shape-compact px-4 py-2 text-[13px] font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{messaging.isLoadingOlder ? 'Loading…' : 'Earlier messages'}</button>
                  </div> : null}
                {!messaging.isLoadingThread && messaging.messages.length === 0 ? <div data-message-introduction={isMessageRequest ? "invitation" : undefined} className="mx-auto mt-10 max-w-[360px]">{isMobile && isMessageRequest ? <p className="text-[14px] leading-6 text-[var(--text-secondary)]">Send one text-only invitation to chat. You can send more messages and attachments after they accept.</p> : <EmptyState title={messaging.activeConversation.isDraft && messaging.activeConversation.status === 'request' ? `Request to message ${messaging.activeConversation.participant.name}` : `Message ${messaging.activeConversation.participant.name}`} description={messaging.activeConversation.isDraft && messaging.activeConversation.status === 'request' ? 'Send one text-only invitation to chat. You can send more messages and attachments after they accept.' : 'Only you and this creator can access this conversation in Portalink.'} />}</div> : null}
                <MessageList key={activeId} messages={messaging.messages} viewerProfileId={auth.viewerProfileId} canInteract={!isMessageRequest && !messaging.activeConversation.participant.isDeleted} participantReadAt={isMessageRequest ? null : messaging.activeConversation.participantReadAt ?? null} pendingMessageId={messaging.pendingMessageId} onRetry={messaging.retryMessage} onEdit={messaging.editMessage} onDelete={messaging.deleteMessage} onReact={messaging.toggleReaction} />
                {hasNewBelow ? <button type="button" onClick={scrollToLatest} className="sticky bottom-2 mx-auto mt-3 flex items-center gap-2 rounded-full bg-[var(--surface-raised)] px-3 py-2 text-[12px] font-semibold text-[var(--accent-text)] shadow-lg ring-1 ring-[var(--hairline)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={ArrowDownIcon} />New messages</button> : null}
              </div>

              {messaging.error ? <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--hairline)] px-4 py-2 text-[12px] text-[var(--status-danger)]" role="alert"><span>{messaging.error}</span><button type="button" onClick={messaging.dismissError} className="font-semibold underline">Dismiss</button></div> : null}
              {attachmentError ? <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--hairline)] px-4 py-2 text-[12px] text-[var(--status-danger)]" role="alert"><span>{attachmentError}</span><button type="button" onClick={() => setAttachmentError(null)} className="font-semibold underline">Dismiss</button></div> : null}
              {messaging.activeConversation.participant.isDeleted ? <p role="status" className="shrink-0 p-4 text-center text-[13px] text-[var(--text-secondary)]">This account was deleted. Your messages and attachments remain here.</p> : messaging.activeConversation.status === 'request' && !messaging.activeConversation.requestedByViewer ? <div className="shrink-0 border-t border-[var(--hairline)] bg-[var(--surface-canvas)] p-4">
                  <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-between gap-4">
                    <p className="text-[13px] text-[var(--text-secondary)]">Accept this message request? They won’t see that you’ve read it until you accept.</p>
                    <div className="flex flex-wrap gap-2"><button type="button" data-keep-color="" disabled={messaging.pendingAction !== null} onClick={() => setConfirmation('block')} className="shape-compact px-4 py-2 text-[13px] font-semibold text-[var(--status-danger)] hover:bg-[var(--surface-hover)] disabled:opacity-50">Block</button><button type="button" disabled={messaging.pendingAction !== null} onClick={() => setConfirmation('delete-request')} className="shape-compact px-4 py-2 text-[13px] font-semibold hover:bg-[var(--surface-hover)] disabled:opacity-50">{messaging.pendingAction === 'delete-request' ? 'Deleting…' : 'Delete'}</button><button type="button" disabled={messaging.pendingAction !== null} onClick={() => { const requestId = activeId; void messaging.acceptRequest().then((accepted) => { if (accepted && activeIdRef.current === requestId) setConversationFilter('all'); }); }} className="shape-compact flex items-center gap-2 bg-[var(--accent-primary)] px-4 py-2 text-[13px] font-semibold text-[var(--accent-foreground)] disabled:opacity-50"><InterfaceIcon icon={CheckIcon} />{messaging.pendingAction === 'accept' ? 'Accepting…' : 'Accept'}</button></div>
                  </div>
                </div> : messaging.activeConversation.status === 'request' && messaging.activeConversation.requestedByViewer && (messaging.activeConversation.hasSentRequest || messaging.messages.some((message) => message.deliveryState !== 'failed')) ? <div className="shrink-0 border-t border-[var(--hairline)] bg-[var(--surface-canvas)] p-4 text-center text-[13px] text-[var(--text-secondary)]">Invitation sent. You can send more messages after {messaging.activeConversation.participant.name} accepts.</div> : <form onSubmit={submitMessage} className="shrink-0 bg-transparent p-3 sm:p-4">
                {!isMessageRequest && attachments.length > 0 ? <ul className="mx-auto mb-2 flex max-w-[760px] flex-wrap gap-2" aria-label="Selected attachments">
                    {attachments.map((file, index) => <li key={`${file.name}:${file.size}:${index}`} className="flex max-w-full items-center gap-2 rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 text-[12px]"><InterfaceIcon icon={FileTextIcon} /><span className="max-w-48 truncate">{file.name}</span><button type="button" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`} className="shape-compact flex h-6 w-6 items-center justify-center"><InterfaceIcon icon={XIcon} size="xs" /></button></li>)}
                  </ul> : null}
                <div data-message-composer="" data-invitation-composer={isMessageRequest || undefined} className="text-control-shell mx-auto flex max-w-[760px] items-end gap-2 rounded-[22px] p-1.5 pl-2">
                  {!isMessageRequest ? <label className="shape-compact flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus-within:ring-2 focus-within:ring-[var(--focus-ring)]" title="Attach files">
                    <span className="sr-only">Attach files</span><InterfaceIcon icon={isMobile ? PlusIcon : PaperclipIcon} />
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
                  </label> : null}
                  <textarea ref={textareaRef} autoFocus={isMobile && isMessageRequest && messaging.activeConversation.isDraft} value={draft} onChange={(event) => updateDraft(event.target.value)} onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }} rows={1} maxLength={4000} placeholder={isMessageRequest ? "Send an invitation" : isMobile ? "Message..." : "Message"} aria-label={`Message ${messaging.activeConversation.participant.name}`} className="max-h-32 min-h-[38px] min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent py-2 text-[16px] leading-[22px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
                  <button type="submit" disabled={messaging.isSending || (!draft.trim() && (isMessageRequest || attachments.length === 0))} aria-busy={messaging.isSending} aria-label={isMessageRequest ? "Send invitation" : "Send message"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[var(--accent-foreground)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40">
                    <InterfaceIcon icon={SendIcon} weight="medium" />
                    {isMessageRequest && isMobile ? <span>{messaging.isSending ? "Sending…" : "Send"}</span> : null}
                  </button>
                </div>
                <p className="sr-only" aria-live="polite">{messaging.isSending ? 'Sending message' : ''}</p>
              </form>}
            </> : <div className="flex flex-1 items-center justify-center px-6 py-10">
              <div className="max-w-[320px] text-center">
                <p className="text-[16px] font-semibold">Your conversations</p>
                <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">Choose a conversation or start a new message.</p>
                {!isMobile ? <button type="button" onClick={openNewMessage} className="shape-compact mt-4 inline-flex min-h-9 items-center justify-center gap-2 bg-[var(--accent-primary)] px-4 py-2 text-[14px] font-semibold text-[var(--accent-foreground)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={MessageSquarePlusIcon} />New message</button> : null}
              </div>
            </div>}
        </main>
      </div>

      {confirmation && <ConfirmationDialog title={confirmation==='block' ? `Block ${messaging.activeConversation?.participant.name ?? 'this creator'}?` : confirmation==='delete-chat' ? 'Delete this chat?' : 'Delete this message request?'} description={confirmation==='block' ? 'They will not be able to start or continue conversations with you. The conversation will leave your list.' : confirmation==='delete-chat' ? 'This chat will be removed from your list only. The other person keeps their messages. Reopening the conversation can restore its history.' : 'This message request will be removed from your list.'} confirmLabel={confirmation==='block' ? 'Block' : confirmation==='delete-chat' ? 'Delete chat' : 'Delete request'} variant="destructive" pending={messaging.pendingAction!==null} error={messaging.error} onCancel={()=>setConfirmation(null)} onConfirm={async()=>{const done=await (confirmation==='block' ? messaging.blockParticipant() : confirmation==='delete-chat' ? messaging.archiveConversation() : messaging.deleteRequest());if(done)setConfirmation(null);return done;}}/>}

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
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">{conversation.participant.name}</span>
      </span>
    </>;
}

function MessageHold({ enabled, onHold, children }: { enabled: boolean; onHold: (trigger: HTMLButtonElement | null) => void; children: React.ReactNode }) {
  const rowRef = useRef<HTMLLIElement>(null);
  const hold = useMobileHold(enabled ? () => {
    const selection = typeof window !== 'undefined' ? window.getSelection?.() : null;
    if (selection && (rowRef.current?.contains(selection.anchorNode) || rowRef.current?.contains(selection.focusNode))) selection.removeAllRanges();
    onHold(rowRef.current?.querySelector<HTMLButtonElement>('[aria-label="Message options"]') ?? null);
  } : null);
  return React.cloneElement(children as React.ReactElement, { ...hold, ref: rowRef, 'data-message-hold': enabled ? '' : undefined });
}

function MessageList({ messages, viewerProfileId, canInteract, participantReadAt, pendingMessageId, onRetry, onEdit, onDelete, onReact }: {
  messages: DirectMessage[];
  viewerProfileId: Id | null;
  canInteract: boolean;
  participantReadAt: string | null;
  pendingMessageId: Id | null;
  onRetry: (id: Id) => Promise<boolean>;
  onEdit: (id: Id, body: string) => Promise<boolean>;
  onDelete: (id: Id) => Promise<boolean>;
  onReact: (id: Id, emoji: string) => Promise<boolean>;
}) {
  const isMobile = usePresentation() === 'mobile';
  const [editingId, setEditingId] = useState<Id | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deleteId, setDeleteId] = useState<Id | null>(null);
  const [actionsId, setActionsId] = useState<Id | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hadInlineActionRef = useRef(false);
  const actionMessage = isMobile && canInteract ? messages.find((message) => message.id === actionsId && !message.id.startsWith('local-') && !message.isRemoved) : undefined;
  useEffect(() => {
    const hadInlineAction = hadInlineActionRef.current;
    hadInlineActionRef.current = Boolean(editingId || deleteId);
    if (!editingId && !deleteId && !hadInlineAction) return;
    // Wait for new controls and, on mobile, sheet cleanup to commit. The
    // opener is disabled during inline editing/confirmation.
    const frame = requestAnimationFrame(() => {
      if (editingId) editTextareaRef.current?.focus();
      else if (deleteId) return;
      else if (actionTriggerRef.current?.isConnected && !actionTriggerRef.current.disabled) actionTriggerRef.current.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [deleteId, editingId, isMobile]);
  let previousDay = '';
  const latestOutgoingId = [...messages].reverse().find((message) => message.senderProfileId === viewerProfileId && message.deliveryState !== 'failed' && message.deliveryState !== 'sending')?.id ?? null;
  return <><ol className="mx-auto flex w-full max-w-[760px] flex-col gap-2" aria-label="Messages">
      {messages.map((message, index) => {
        const isMine = message.senderProfileId !== null && message.senderProfileId === viewerProfileId;
        const day = dayLabel(message.createdAt);
        const showDay = day !== previousDay;
        previousDay = day;
        const previous = messages[index - 1];
        const grouped = !showDay && previous?.senderProfileId === message.senderProfileId && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000;
        const hasReactions = Boolean(message.reactions?.length);
        const hasReceipt = isMine && (message.id === latestOutgoingId || message.deliveryState === 'sending' || message.deliveryState === 'failed');
        return <React.Fragment key={message.id}>
            {showDay ? <li data-message-date="" className="py-3 text-center text-[11px] font-medium text-[var(--text-tertiary)]">{day}</li> : null}
            <MessageHold enabled={isMobile && canInteract && !message.isRemoved && !message.id.startsWith('local-') && pendingMessageId !== message.id && !editingId && !deleteId} onHold={trigger => { actionTriggerRef.current = trigger; setActionsId(message.id); }}><li data-message-row="" data-message-grouped={grouped || undefined} data-has-reactions={hasReactions || undefined} data-has-receipt={hasReceipt || undefined} data-message-failed={message.deliveryState === 'failed' || undefined} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div data-message-bubble={isMine ? 'outgoing' : 'incoming'} className={`group/message max-w-[78%] rounded-[18px] px-3.5 py-2.5 ${isMine ? 'bg-[var(--accent-primary)] text-[var(--accent-foreground)]' : 'bg-[var(--surface-raised)] text-[var(--text-primary)] ring-1 ring-[var(--hairline)]'} ${message.deliveryState === 'failed' ? 'ring-2 ring-[var(--status-danger)]' : ''}`}>
                {message.isRemoved ? <p className="text-[12px] text-[var(--text-tertiary)]">Deleted User</p> : null}
                {editingId === message.id ? <form onSubmit={(event) => { event.preventDefault(); void onEdit(message.id, editBody).then((saved) => { if (saved) setEditingId(null); }); }}>
                    <textarea ref={editTextareaRef} autoFocus aria-label="Edit message" value={editBody} onChange={(event) => setEditBody(event.target.value)} onKeyDown={!isMobile ? (event) => {
                      if (event.nativeEvent.isComposing || pendingMessageId === message.id) return;
                      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditingId(null); }
                      else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        if (editBody.trim()) event.currentTarget.form?.requestSubmit();
                      }
                    } : undefined} maxLength={4000} className={`min-h-20 w-full resize-y rounded-[9px] bg-[var(--surface-canvas)] p-2 text-[var(--text-primary)] ${isMobile ? 'text-[16px] border border-[var(--hairline)] rounded-[16px] !p-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]' : 'text-[15px]'}`} />
                    {!isMobile ? <p className="mt-1 text-[11px] opacity-75">Esc to cancel · Ctrl/Cmd+Enter to save</p> : null}
                    <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setEditingId(null)} className={`${isMobile ? 'min-h-[44px] min-w-[80px] px-4 text-[14px] rounded-[12px] bg-[var(--surface-sunken)] !no-underline' : 'text-[12px]'} font-semibold underline`}>Cancel</button><button type="submit" disabled={!editBody.trim() || pendingMessageId === message.id} className={`${isMobile ? 'min-h-[44px] min-w-[80px] px-4 text-[14px] rounded-[12px] bg-[var(--surface-sunken)] !no-underline' : 'text-[12px]'} font-semibold underline disabled:opacity-50`}>Save</button></div>
                  </form> : <p className="whitespace-pre-wrap break-words text-[16px] leading-6"><MessageBody body={message.body} /></p>}
                {message.attachments?.length ? <ul className="mt-2 grid gap-2">
                    {message.attachments.map((attachment) => <li key={attachment.id}><MessageAttachmentView attachment={attachment} /></li>)}
                  </ul> : null}
                <span data-message-meta="" className="mt-1 flex items-center justify-end gap-2 text-[11px]">
                  <time hidden={isMobile} dateTime={message.createdAt} className={isMine ? 'opacity-75' : 'text-[var(--text-tertiary)]'}>{messageTime(message.createdAt)}</time>
                  {message.editedAt && !isMobile ? <span className="opacity-70">Edited</span> : null}
                  {message.deliveryState === 'sending' ? <span className="opacity-75">Sending…</span> : null}
                  {message.deliveryState === 'failed' ? <button type="button" onClick={() => void onRetry(message.id)} className={`${isMobile ? 'min-h-[44px] min-w-[44px] px-2' : ''} font-semibold underline`}>Retry</button> : null}
                  {message.id === latestOutgoingId && message.deliveryState !== 'failed' ? <span className="opacity-75">{participantReadAt && participantReadAt >= message.createdAt ? 'Seen' : 'Sent'}</span> : null}
                </span>
                {!message.id.startsWith('local-') && !message.isRemoved && canInteract ? <div data-message-reactions="" className="mt-2 flex flex-wrap items-center gap-1">
                    {(canInteract ? message.reactions ?? [] : []).map((reaction) => <button key={reaction.emoji} type="button" aria-pressed={reaction.isMine} disabled={pendingMessageId === message.id} onClick={() => void onReact(message.id, reaction.emoji)} className={`rounded-full px-2 py-0.5 text-[12px] ring-1 ${isMobile ? 'inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px]' : ''} ${reaction.isMine ? 'bg-white/20 ring-current' : 'bg-black/10 ring-black/10'}`} aria-label={`${messageReactionOption(reaction.emoji).label}: ${reaction.count}${reaction.isMine ? '. Selected' : ''}`}>{isMobile ? <InterfaceIcon icon={messageReactionOption(reaction.emoji).icon} size="sm" /> : reaction.emoji} {reaction.count}</button>)}
                    {isMobile ? <button type="button" aria-label="Message options" aria-haspopup="dialog" aria-expanded={actionsId === message.id} disabled={pendingMessageId === message.id || editingId === message.id || deleteId === message.id} onClick={(event) => { actionTriggerRef.current = event.currentTarget; setActionsId(message.id); }} className="sr-only focus:not-sr-only focus:absolute focus:right-0 focus:bottom-0 focus:h-11 focus:w-11 focus:rounded-full focus:bg-[var(--surface-raised)] focus:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-current"><InterfaceIcon icon={MoreHorizontalIcon} /></button> : <>
                      {(canInteract ? ['❤', '👏', '✨'] as const : []).filter((emoji) => !(message.reactions ?? []).some((reaction) => reaction.emoji === emoji)).map((emoji) => <button key={emoji} type="button" disabled={pendingMessageId === message.id} onClick={() => void onReact(message.id, emoji)} aria-label={`React ${emoji}`} className="rounded-full px-1.5 py-0.5 text-[12px] opacity-0 hover:bg-black/10 focus:opacity-100 group-hover/message:opacity-70 group-focus-within/message:opacity-70">{emoji}</button>)}
                      {isMine ? <><button type="button" onClick={(event) => { actionTriggerRef.current = event.currentTarget; setEditingId(message.id); setEditBody(message.body); }} disabled={pendingMessageId === message.id || editingId === message.id || deleteId === message.id} aria-label="Edit message" title="Edit message" className="shape-compact ml-auto flex h-7 w-7 items-center justify-center opacity-0 focus:opacity-100 group-hover/message:opacity-70 group-focus-within/message:opacity-70"><InterfaceIcon icon={PencilIcon} size="xs" /></button><button type="button" onClick={(event) => { actionTriggerRef.current = event.currentTarget; setDeleteId(message.id); }} disabled={pendingMessageId === message.id || editingId === message.id || deleteId === message.id} aria-label="Unsend message" title="Unsend message" className="shape-compact flex h-7 w-7 items-center justify-center opacity-0 focus:opacity-100 group-hover/message:opacity-70 group-focus-within/message:opacity-70"><InterfaceIcon icon={Trash2Icon} size="xs" /></button></> : null}
                    </>}
                  </div> : null}
                {deleteId===message.id && <ConfirmationDialog title="Unsend this message?" description="This message will be removed for both people." confirmLabel="Unsend message" variant="destructive" pending={pendingMessageId===message.id} pendingLabel="Unsending…" onCancel={()=>setDeleteId(null)} onConfirm={async()=>{const removed=await onDelete(message.id);if(removed)setDeleteId(null);return removed;}}/>}
              </div>
            </li></MessageHold>
          </React.Fragment>;
      })}
    </ol>
    {actionMessage ? <MobileMessageActions message={actionMessage} isMine={actionMessage.senderProfileId !== null && actionMessage.senderProfileId === viewerProfileId} pending={pendingMessageId === actionMessage.id} onClose={() => setActionsId(null)} onReact={(emoji) => { setActionsId(null); void onReact(actionMessage.id, emoji); }} onEdit={() => { setActionsId(null); setEditingId(actionMessage.id); setEditBody(actionMessage.body); }} onRequestUnsend={() => { setActionsId(null); setDeleteId(actionMessage.id); }} /> : null}
    </>;
}

function FilterChip({ label, isActive, onSelect }: { label: string; isActive: boolean; onSelect: () => void }) {
  return <button data-ui-control="button" data-control-size="md" data-control-variant="ghost" type="button" aria-pressed={isActive} title={label} onClick={onSelect} className="ps-nav-item side-panel-primary-control flex w-full items-center justify-center px-1.5 text-[14px] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><span className="truncate">{label}</span></button>;
}

function ConversationMenuButton({ icon, label, danger = false, onClick }: { icon: InterfaceIconSource; label: string; danger?: boolean; onClick: () => void }) {
  return <button type="button" role="menuitem" data-keep-color={danger ? '' : undefined} onClick={onClick} className={`side-panel-primary-control side-panel-control-row w-full px-3 text-left text-[13px] font-medium hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${danger ? 'text-[var(--status-danger)]' : 'text-[var(--text-primary)]'}`}><InterfaceIcon icon={icon} /><span>{label}</span></button>;
}

function MessageAttachmentView({ attachment }: { attachment: MessageAttachment }) {
  const isMobile = usePresentation() === 'mobile';
  if (attachment.mimeType.startsWith('image/')) return <a href={attachment.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[12px] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><img src={attachment.url} alt={attachment.fileName} loading="lazy" decoding="async" className="max-h-72 w-full object-cover" /></a>;
  if (attachment.mimeType.startsWith('audio/')) return <div><p className="mb-1 truncate text-[12px] font-medium">{attachment.fileName}</p><audio controls preload="metadata" src={attachment.url} className="max-w-full" /></div>;
  if (attachment.mimeType.startsWith('video/')) return <video controls loop={isMobile || undefined} muted playsInline={isMobile || undefined} preload="metadata" src={attachment.url} className="max-h-72 w-full rounded-[12px]" aria-label={attachment.fileName} />;
  return <a href={attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-[10px] bg-black/10 px-3 py-2 text-[13px] font-semibold underline focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={FileTextIcon} /><span className="min-w-0 truncate">{attachment.fileName}</span></a>;
}
