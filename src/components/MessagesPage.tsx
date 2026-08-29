import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, MessageSquarePlusIcon, SearchIcon, SendIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMessaging } from '../features/messages/useMessaging';
import { useNotifications } from '../features/messages/useNotifications';
import type { Id } from '../types/domain';
import { InboxPanel } from './messages/InboxPanel';
import { NewChatPanel } from './messages/NewChatPanel';
import { CreatorAvatar } from './profile/CreatorAvatar';
import { InterfaceIcon } from './ui/InterfaceIcon';
import { EmptyState, ErrorState, LoadingState } from './ui/StateViews';

type MessagesPageProps = {
  onBack: () => void;
  onOpenCreator?: (creatorId: Id) => void;
  initialRecipientId?: Id | null;
};

type MessagesView = 'messages' | 'inbox';

function messageTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

/** A production one-to-one message destination backed by MessagingService. */
export function MessagesPage({ onBack, onOpenCreator, initialRecipientId = null }: MessagesPageProps) {
  const auth = useAuth();
  const inbox = useNotifications();
  const messaging = useMessaging(initialRecipientId);
  const [view, setView] = useState<MessagesView>('messages');
  const [isNewChatOpen, setIsNewChatOpen] = useState(Boolean(initialRecipientId));
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messaging.activeConversation) setIsNewChatOpen(false);
  }, [messaging.activeConversation]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messaging.messages]);

  const visibleConversations = useMemo(() => {
    const term = query.trim().toLowerCase();
    return messaging.conversations.filter((conversation) => {
      if (showUnreadOnly && !conversation.isUnread) return false;
      return !term || `${conversation.participant.name} ${conversation.participant.handle} ${conversation.lastMessage ?? ''}`.toLowerCase().includes(term);
    });
  }, [messaging.conversations, query, showUnreadOnly]);

  async function submitMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || messaging.isSending) return;
    const body = draft;
    const sent = await messaging.sendMessage(body);
    if (sent) setDraft('');
  }

  return <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <header className="ps-panel-toolbar global-control-header shrink-0 gap-3 px-2 sm:px-4">
        <button type="button" onClick={onBack} aria-label="Go back" className="flex h-9 w-9 items-center justify-center rounded-[9px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:hidden">
          <InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl />
        </button>
        <div role="tablist" aria-label="Messages view" className="ps-nav-bar flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] p-1">
          <ViewTab label="Messages" isActive={view === 'messages'} onSelect={() => setView('messages')} />
          <ViewTab label="Inbox" isActive={view === 'inbox'} onSelect={() => setView('inbox')} badge={inbox.unreadCount} />
        </div>
      </header>

      {view === 'inbox' ? <InboxPanel /> : <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="ps-panel flex min-h-0 shrink-0 flex-col border-b border-[var(--hairline)] lg:w-[340px] lg:border-b-0 lg:border-r">
            {isNewChatOpen ? <NewChatPanel onClose={() => setIsNewChatOpen(false)} isStarting={messaging.isStarting} onSelectCreator={(profileId) => void messaging.startConversation(profileId)} /> : <>
                {messaging.conversations.length > 0 ? <div className="shrink-0 space-y-3 px-4 py-4">
                  <div className="flex items-center justify-end">
                    <button type="button" onClick={() => setIsNewChatOpen(true)} aria-label="Start a conversation" title="Start a conversation" className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                      <InterfaceIcon icon={MessageSquarePlusIcon} size="lg" />
                    </button>
                  </div>
                  <>
                      <label className="text-control-shell group flex h-10 items-center gap-2.5 rounded-[8px] px-3.5">
                        <InterfaceIcon icon={SearchIcon} className="text-[var(--text-tertiary)] transition-colors group-focus-within:text-[var(--accent-text)]" />
                        <span className="sr-only">Search conversations</span>
                        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
                      </label>
                      <div className="flex gap-1.5" role="group" aria-label="Conversation filter">
                        <FilterChip label="All" isActive={!showUnreadOnly} onSelect={() => setShowUnreadOnly(false)} />
                        <FilterChip label="Unread" isActive={showUnreadOnly} onSelect={() => setShowUnreadOnly(true)} />
                      </div>
                    </>
                </div> : null}
                <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--hairline)]">
                  {messaging.status === 'loading' && messaging.conversations.length === 0 ? <div className="p-5"><LoadingState label="Loading conversations" /></div> : null}
                  {messaging.status === 'error' && messaging.conversations.length === 0 ? <div className="p-5"><ErrorState title="Messages could not be loaded" description={messaging.error ?? undefined} onRetry={() => void messaging.retry()} /></div> : null}
                  {messaging.status === 'success' && visibleConversations.length === 0 ? <div className="p-5"><EmptyState title={showUnreadOnly ? 'No unread messages' : query.trim() ? 'No matching conversations' : 'No conversations yet'} description={showUnreadOnly ? 'You are all caught up.' : query.trim() ? 'Try another name or message.' : 'Start a conversation with another creator.'} action={!showUnreadOnly && !query.trim() ? { label: 'Start a conversation', onClick: () => setIsNewChatOpen(true) } : undefined} /></div> : null}
                  {visibleConversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => void messaging.openConversation(conversation)} aria-current={messaging.activeConversation?.id === conversation.id ? 'true' : undefined} className={`ps-list-btn flex w-full items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${messaging.activeConversation?.id === conversation.id ? 'bg-[var(--surface-selected)]' : ''}`}>
                      <CreatorAvatar name={conversation.participant.name} avatar={conversation.participant.avatar} className="h-11 w-11 text-[14px]" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-[14px] ${conversation.isUnread ? 'font-bold' : 'font-semibold'}`}>{conversation.participant.name}</span>
                          <time className="shrink-0 text-[11px] text-[var(--text-tertiary)]">{messageTime(conversation.lastMessageAt)}</time>
                        </span>
                        <span className={`mt-0.5 flex items-center gap-2 text-[12px] ${conversation.isUnread ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                          <span className="min-w-0 flex-1 truncate">{conversation.lastMessage ?? conversation.participant.handle}</span>
                          {conversation.isUnread ? <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--social-unread)]"><span className="sr-only">Unread</span></span> : null}
                        </span>
                      </span>
                    </button>)}
                </div>
              </>}
          </aside>

          <main className="flex min-h-0 flex-1 flex-col bg-[var(--surface-sunken)]">
            {messaging.activeConversation ? <>
                <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--surface-canvas)] px-4">
                  <button type="button" onClick={() => onOpenCreator?.(messaging.activeConversation?.participant.id ?? '')} className="flex min-w-0 items-center gap-2.5 rounded-[9px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                    <CreatorAvatar name={messaging.activeConversation.participant.name} avatar={messaging.activeConversation.participant.avatar} className="h-8 w-8 text-[11px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{messaging.activeConversation.participant.name}</span>
                      <span className="block truncate text-[12px] text-[var(--text-secondary)]">{messaging.activeConversation.participant.handle}</span>
                    </span>
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8" aria-live="polite">
                  {messaging.isLoadingThread ? <LoadingState label="Loading conversation" /> : null}
                  {!messaging.isLoadingThread && messaging.messages.length === 0 ? <div className="mx-auto mt-12 max-w-[360px]"><EmptyState title={`Start a conversation with ${messaging.activeConversation.participant.name}`} description="Messages are private to the two participants." /></div> : null}
                  <ol className="mx-auto flex w-full max-w-[760px] flex-col gap-2">
                    {messaging.messages.map((message) => {
                      const isMine = message.senderProfileId === auth.viewerProfileId;
                      return <li key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[78%] rounded-[18px] px-3.5 py-2.5 ${isMine ? 'bg-[var(--accent-primary)] text-[var(--accent-foreground)]' : 'bg-[var(--surface-raised)] text-[var(--text-primary)] ring-1 ring-[var(--hairline)]'}`}>
                            <p className="whitespace-pre-wrap break-words text-[16px] leading-6">{message.body}</p>
                            <time className={`mt-1 block text-right text-[11px] ${isMine ? 'opacity-75' : 'text-[var(--text-tertiary)]'}`}>{messageTime(message.createdAt)}</time>
                          </div>
                        </li>;
                    })}
                  </ol>
                  <div ref={messagesEndRef} />
                </div>
                {messaging.error ? <p role="alert" className="shrink-0 border-t border-[var(--hairline)] px-4 py-2 text-[12px] text-[var(--status-danger)]">{messaging.error}</p> : null}
                <form onSubmit={submitMessage} className="shrink-0 border-t border-[var(--hairline)] bg-[var(--surface-canvas)] p-3 sm:p-4">
                  <div className="text-control-shell mx-auto flex max-w-[760px] items-end gap-2 rounded-[22px] p-1.5 pl-4">
                    <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }} rows={1} maxLength={4000} placeholder="Message" aria-label="Message" className="max-h-32 min-h-[38px] min-w-0 flex-1 resize-none border-0 bg-transparent py-2 text-[16px] leading-[22px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
                    <button type="submit" disabled={!draft.trim() || messaging.isSending} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[var(--accent-foreground)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40">
                      <InterfaceIcon icon={SendIcon} weight="medium" />
                    </button>
                  </div>
                </form>
              </> : messaging.conversations.length > 0 ? <div className="flex flex-1 items-center justify-center px-6 py-10">
                  <p className="text-[14px] text-[var(--text-secondary)]">Choose a conversation.</p>
                </div> : null}
          </main>
        </div>}
    </div>;
}

function ViewTab({ label, isActive, onSelect, badge = 0 }: { label: string; isActive: boolean; onSelect: () => void; badge?: number }) {
  return <button type="button" role="tab" aria-selected={isActive} onClick={onSelect} className={`ps-nav-item flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isActive ? 'bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.12)]' : 'font-medium text-[var(--text-secondary)] hover:text-[var(--accent-text)]'}`}>
      {label}{badge > 0 ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--social-unread)] px-1 text-[10px] font-bold text-[var(--social-unread-foreground)]">{badge}</span> : null}
    </button>;
}

function FilterChip({ label, isActive, onSelect }: { label: string; isActive: boolean; onSelect: () => void }) {
  return <button type="button" aria-pressed={isActive} onClick={onSelect} className={`ps-nav-item rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isActive ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--accent-text)]'}`}>{label}</button>;
}
