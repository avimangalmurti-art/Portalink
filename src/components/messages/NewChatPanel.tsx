import React, { useMemo, useState } from 'react';
import { ArrowLeftIcon, SearchIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { useDirectory } from '../../features/messages/useDirectory';
import { useAuth } from '../../contexts/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';
import type { FeedCreator } from '../../types/domain';
import { CreatorAvatar } from '../profile/CreatorAvatar';
type NewChatPanelProps = {
  onClose: () => void;
  onSelectCreator: (creatorId: string) => void;
  isStarting?: boolean;
};

/**
 * Choosing who a new conversation is with.
 *
 * The people listed are real accounts, read through the existing discovery
 * boundary — no invented contacts, and no avatars claimed for profiles whose
 * canonical record carries none, so each person is identified by a monogram of
 * their own initial instead.
 */
export function NewChatPanel({
  onClose,
  onSelectCreator,
  isStarting = false
}: NewChatPanelProps) {
  const directory = useDirectory();
  const auth = useAuth();
  const [query, setQuery] = useState('');
  // Filtering happens over what has already loaded, so the list and the count
  // can never disagree with each other.
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    // The disabled self-message row already represents the viewer. Do not list
    // the same account again as though it were another available recipient.
    const otherPeople = directory.people.filter((person) => person.id !== auth.viewerProfileId);
    const matched = term ? otherPeople.filter((person) => person.name.toLowerCase().includes(term) || person.kind.toLowerCase().includes(term)) : otherPeople;
    const sorted = [...matched].sort((a, b) => a.name.localeCompare(b.name));
    const byLetter = new Map<string, FeedCreator[]>();
    for (const person of sorted) {
      // A name that does not start with a letter groups under "#" rather than
      // being dropped from the index.
      const initial = person.name.charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(initial) ? initial : '#';
      const bucket = byLetter.get(letter);
      if (bucket) {
        bucket.push(person);
      } else {
        byLetter.set(letter, [person]);
      }
    }
    return [...byLetter.entries()];
  }, [auth.viewerProfileId, directory.people, query]);
  return <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-4">
        <button type="button" onClick={onClose} aria-label="Back to messages" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={ArrowLeftIcon} size="lg" weight="medium" mirroredInRtl />
        </button>
        <h2 className="min-w-0 truncate text-medium font-semibold text-[var(--text-primary)]">Find a creator</h2>
      </div>

      <div className="shrink-0 px-4 pb-3">
        <div className="text-control-shell group flex h-10 items-center gap-2.5 rounded-[8px] px-3.5">
          <InterfaceIcon icon={SearchIcon} className="text-[var(--text-tertiary)]" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or username" aria-label="Search creators" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] leading-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <div>
          {directory.status === 'loading' ? <div className="px-4 py-6"><LoadingState label="Loading creators" /></div> : null}
          {directory.status === 'error' ? <div className="px-4 py-6"><ErrorState title="Unable to load creators" description={directory.error ?? 'Check the connection, then try again.'} onRetry={directory.retry} /></div> : null}
          {directory.status === 'success' && groups.length === 0 ? <div className="px-4 py-6">
              <EmptyState title="No creators found" description={query.trim() ? 'Try another name or username.' : 'No other creator profiles are available.'} />
            </div> : null}

          {groups.map(([letter, people]) => <section key={letter} aria-labelledby={`new-chat-group-${letter}`}>
              <h3 id={`new-chat-group-${letter}`} className="px-4 pb-1 pt-4 text-[12px] font-semibold text-[var(--text-tertiary)]">{letter}</h3>
              <ul>
                {people.map((person) => <li key={person.id}>
                    <PersonRow name={person.name} avatar={person.avatar} detail={person.kind} isDisabled={isStarting} onSelect={() => onSelectCreator(person.id)} />
                  </li>)}
              </ul>
            </section>)}
        </div>
      </div>
    </div>;
}

/**
 * One person. The canonical profile image leads when one exists; initials are
 * reserved for profiles that genuinely have no usable image.
 */
function PersonRow({
  name,
  avatar,
  detail,
  isDisabled = false,
  onSelect





}: {name: string;avatar?: string;detail?: string;isDisabled?: boolean;onSelect?: () => void;}) {
  return <button type="button" disabled={isDisabled || !onSelect} onClick={onSelect} aria-label={onSelect ? `Message ${name}` : name} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:hover:bg-transparent">
      <CreatorAvatar name={name} avatar={avatar} className="h-10 w-10 text-[13px]" />
      <span className="flex min-w-0 flex-col">
        <span className={`min-w-0 truncate text-[13px] font-medium ${isDisabled ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>{name}</span>
        {detail && <span className="min-w-0 truncate text-[12px] text-[var(--text-tertiary)]">{detail}</span>}
      </span>
    </button>;
}
