import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, SearchIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDirectory } from '../../features/messages/useDirectory';
import type { MessageParticipant } from '../../types/messages';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';

type NewChatPanelProps = {
  onClose: () => void;
  onSelectCreator: (creatorId: string) => void;
  startingCreatorId?: string | null;
  startError?: string | null;
  onDismissError?: () => void;
};

/** Starts with followed people and expands to visible profiles when searching. */
export function NewChatPanel({
  onClose,
  onSelectCreator,
  startingCreatorId = null,
  startError = null,
  onDismissError,
}: NewChatPanelProps) {
  const auth = useAuth();
  const [query, setQuery] = useState('');
  const directory = useDirectory(query);
  const isSearching = Boolean(query.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const groups = useMemo(() => {
    const sorted = directory.people
      .filter((person) => person.id !== auth.viewerProfileId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const byLetter = new Map<string, MessageParticipant[]>();
    for (const person of sorted) {
      const initial = person.name.charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(initial) ? initial : '#';
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), person]);
    }
    return [...byLetter.entries()];
  }, [auth.viewerProfileId, directory.people]);

  return <div className="flex min-h-0 flex-1 flex-col" aria-busy={directory.status === 'loading' || Boolean(startingCreatorId)}>
      <div className="side-panel-control-stack side-panel-content-inset shrink-0">
      <div className="side-panel-primary-control side-panel-control-row">
        <button type="button" onClick={onClose} aria-label="Back to messages" className="side-panel-compact-control shape-compact flex shrink-0 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={ArrowLeftIcon} size="lg" weight="medium" mirroredInRtl />
        </button>
        <h2 className="min-w-0 truncate text-[16px] font-semibold text-[var(--text-primary)]">New message</h2>
      </div>

        <label className="text-control-shell side-panel-primary-control group flex items-center gap-2.5 px-3">
          <InterfaceIcon icon={SearchIcon} className="text-[var(--text-tertiary)] group-focus-within:text-[var(--accent-text)]" />
          <span className="sr-only">Search by name or username</span>
          <input ref={inputRef} type="search" value={query} onChange={(event) => { setQuery(event.target.value); onDismissError?.(); }} placeholder="Name or username" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
        </label>
      </div>

      <p className="side-panel-content-inset py-3 text-[14px] font-medium text-[var(--text-secondary)]">{isSearching ? 'Search results' : 'People you follow'}</p>

      {startError ? <div className="mx-4 mb-3 flex items-start justify-between gap-3 rounded-[9px] bg-[color-mix(in_srgb,var(--status-danger)_12%,transparent)] px-3 py-2 text-[13px] text-[var(--status-danger)]" role="alert">
          <span>{startError}</span>
          <button type="button" onClick={onDismissError} className="shrink-0 font-semibold underline">Dismiss</button>
        </div> : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto pb-6">
        {directory.status === 'loading' && directory.people.length === 0 ? <div className="side-panel-content-inset py-6"><LoadingState label={isSearching ? 'Searching creators' : 'Loading people you follow'} /></div> : null}
        {directory.status === 'error' && directory.people.length === 0 ? <div className="side-panel-content-inset py-6"><ErrorState title={isSearching ? 'Unable to search creators' : 'Unable to load people you follow'} description={directory.error ?? undefined} onRetry={directory.retry} /></div> : null}
        {directory.status === 'success' && groups.length === 0 ? <div className="side-panel-content-inset py-6"><EmptyState title={isSearching ? 'No creators found' : 'No followed creators to show'} description={isSearching ? 'Try another name or username.' : 'Search by name or username to find someone to message.'} /></div> : null}

        {groups.map(([letter, people]) => <section key={letter} aria-labelledby={`new-chat-group-${letter === '#' ? 'other' : letter}`}>
            <h3 id={`new-chat-group-${letter === '#' ? 'other' : letter}`} className="side-panel-content-inset pb-1 pt-4 text-[12px] font-semibold text-[var(--text-tertiary)]">{letter}</h3>
            <ul className="side-panel-content-inset side-panel-navigation-list">
              {people.map((person) => <li key={person.id}>
                  <PersonRow person={person} isStarting={startingCreatorId === person.id} isDisabled={Boolean(startingCreatorId)} onSelect={() => onSelectCreator(person.id)} />
                </li>)}
            </ul>
          </section>)}

        {directory.hasMore ? <div className="side-panel-content-inset pt-4">
            <button type="button" disabled={directory.status === 'loading'} onClick={() => void directory.loadMore()} className="side-panel-primary-control w-full justify-center px-3 text-[13px] font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">
              {directory.status === 'loading' ? 'Loading…' : 'Show more creators'}
            </button>
          </div> : null}
      </div>
    </div>;
}

function PersonRow({ person, isStarting, isDisabled, onSelect }: {
  person: MessageParticipant;
  isStarting: boolean;
  isDisabled: boolean;
  onSelect: () => void;
}) {
  return <div data-selected={isStarting ? 'true' : undefined} className="message-contact-row flex w-full items-center gap-3 p-2">
      <ProfileAvatar name={person.name} avatar={person.avatar} />
      <button type="button" disabled={isDisabled} onClick={onSelect} aria-label={`Message ${person.name}`} className="flex min-w-0 flex-1 self-stretch items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-60">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-medium text-[var(--text-primary)]">{person.name}</span>
        <span className="truncate text-[12px] text-[var(--text-tertiary)]">{person.handle}</span>
      </span>
      {isStarting ? <span className="text-[12px] text-[var(--text-secondary)]" role="status">Opening…</span> : null}
      </button>
    </div>;
}
