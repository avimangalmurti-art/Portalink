import React from 'react';
import { useNotifications } from '../../features/messages/useNotifications';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';

/**
 * The inbox beside Messages: replies, follows, and other notices addressed to
 * the viewer. It reads the canonical notification service, so an empty inbox is
 * the service's real answer rather than a stand-in.
 */
export function InboxPanel() {
  const inbox = useNotifications();
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-[640px]">
        {inbox.status === 'loading' ? <LoadingState label="Loading inbox" /> : null}
        {inbox.status === 'error' ? <ErrorState title="Unable to load inbox" description={inbox.error ?? 'Check the connection, then try again.'} onRetry={inbox.retry} /> : null}
        {inbox.status === 'success' && inbox.notifications.length === 0 ? <EmptyState title="Inbox is empty" description="Replies, follows, and other notifications will appear here." /> : null}

        {inbox.notifications.length > 0 && <ul className="flex flex-col divide-y divide-[var(--hairline)]">
            {inbox.notifications.map((entry) => <li key={entry.id} className="flex items-start gap-3 py-3">
                {/* Unread is marked with a dot AND a heavier body, so the state
               never rests on colour alone. */}
                <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${entry.isUnread ? 'bg-[var(--social-unread)]' : 'bg-transparent'}`} />
                <div className="flex min-w-0 flex-col">
                  <p className={`text-[13px] leading-relaxed ${entry.isUnread ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                    {entry.body}
                    {entry.isUnread && <span className="sr-only"> (unread)</span>}
                  </p>
                  <time className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">{entry.timestamp}</time>
                </div>
              </li>)}
          </ul>}
      </div>
    </div>;
}
