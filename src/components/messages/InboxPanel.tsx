import { FormattedText } from '../text/FormattedText';
import React from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../../features/messages/useNotifications';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';

function kindLabel(kind?: string): string {
  if (kind === 'message') return 'Message';
  if (kind === 'reply') return 'Reply';
  if (kind === 'follow') return 'Follow';
  return 'Update';
}

/** Canonical Activity list. Messaging links open the exact conversation. */
export function InboxPanel() {
  const activity = useNotifications();
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="mb-4 side-panel-control-row flex-wrap justify-between">
          <p className="text-[14px] text-[var(--text-secondary)]">{activity.unreadCount > 0 ? `${activity.unreadCount} unread` : 'You are up to date'}</p>
          <div className="side-panel-control-row">
            {activity.unreadCount > 0 ? <button type="button" onClick={() => void activity.markAllRead()} disabled={activity.isMarkingAll} className="side-panel-primary-control px-3 text-[13px] font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{activity.isMarkingAll ? 'Marking…' : 'Mark all read'}</button> : null}
            <button type="button" onClick={activity.retry} disabled={activity.status === 'loading'} className="side-panel-primary-control px-3 text-[13px] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">Refresh</button>
          </div>
        </div>
        {activity.mutationError ? <p role="alert" className="mb-3 text-[13px] text-[var(--status-danger)]">{activity.mutationError}</p> : null}
        {activity.status === 'loading' ? <LoadingState label="Loading activity" /> : null}
        {activity.status === 'error' ? <ErrorState title="Unable to load activity" description={activity.error ?? undefined} onRetry={activity.retry} /> : null}
        {activity.status === 'success' && activity.notifications.length === 0 ? <EmptyState title="No activity yet" description="Messages, replies, follows, and account updates will appear here." /> : null}

        {activity.notifications.length > 0 ? <ul className="flex flex-col divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
            {activity.notifications.map((entry) => {
              const content = <>
                  <span className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{kindLabel(entry.kind)}</span>
                  <span className={`text-[14px] leading-relaxed ${entry.isUnread ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}><FormattedText text={entry.body} /><span className="sr-only">{entry.isUnread ? ' (unread)' : ''}</span></span>
                  <time dateTime={entry.timestamp} className="mt-1 text-[12px] text-[var(--text-tertiary)]">{Number.isNaN(Date.parse(entry.timestamp)) ? entry.timestamp : new Date(entry.timestamp).toLocaleString()}</time>
                </>;
              return <li key={entry.id} className="flex items-start gap-3 py-3">
                  <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${entry.isUnread ? 'bg-[var(--social-unread)]' : 'bg-transparent'}`} />
                  {entry.targetPath ? <Link to={entry.targetPath} onClick={() => { if (entry.isUnread) void activity.markRead(entry.id); }} className="shape-compact flex min-w-0 flex-1 flex-col px-2 py-1 hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{content}</Link> : <div className="flex min-w-0 flex-1 flex-col px-2 py-1">{content}</div>}
                  {entry.isUnread ? <button type="button" disabled={activity.pendingIds.has(entry.id)} onClick={() => void activity.markRead(entry.id)} className="side-panel-primary-control shrink-0 px-2 text-[12px] font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{activity.pendingIds.has(entry.id) ? 'Marking…' : 'Mark read'}</button> : null}
                </li>;
            })}
          </ul> : null}
      </div>
    </div>;
}
