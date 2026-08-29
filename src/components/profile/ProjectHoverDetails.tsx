import React from 'react';
import { BookmarkIcon, HeartIcon, Repeat2Icon } from 'lucide-react';
import { useProjectEngagement } from '../../features/engagement/useProjectEngagement';
import type { Id } from '../../types/domain';
import { InterfaceIcon } from '../ui/InterfaceIcon';

const compactCountFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1
});

function formatEngagementCount(count: number | null): string {
  return count === null ? '—' : compactCountFormatter.format(count);
}

const METRICS = [
  { kind: 'like' as const, label: 'likes', icon: HeartIcon, color: 'var(--engagement-like-selected)' },
  { kind: 'save' as const, label: 'bookmarks', icon: BookmarkIcon, color: 'var(--engagement-save-selected)' },
  { kind: 'repost' as const, label: 'reposts', icon: Repeat2Icon, color: 'var(--engagement-repost-selected)' }
];

/**
 * The one hover/focus presentation shared by profile and Home project covers.
 * It contains read-only canonical totals; engagement itself still happens only
 * in the project viewer.
 */
export function ProjectHoverDetails({
  projectId,
  summary,
  className = '',
  bottomInset,
  footerEnd,
  showEngagementMetrics = true,
  onOpen
}: {
  projectId: Id;
  summary: string;
  className?: string;
  /** Space reserved for a persistent overlay owned by the card surface. */
  bottomInset?: number;
  /** Optional card-owned control sharing the engagement footer's centerline. */
  footerEnd?: React.ReactNode;
  /** Public shared profiles keep the hover focused on the work description. */
  showEngagementMetrics?: boolean;
  /** Profile cards place this overlay beside their open button, so it forwards clicks. */
  onOpen?: () => void;
}) {
  const engagement = useProjectEngagement(projectId);
  const hasFooter = showEngagementMetrics || Boolean(footerEnd);

  return (
    <span
      className={`absolute inset-0 grid bg-[var(--control-rest-surface)] p-3 text-[var(--control-text)] ${footerEnd ? 'overflow-visible' : 'overflow-hidden'} ${hasFooter ? 'grid-rows-[minmax(0,1fr)_auto] gap-3' : 'grid-rows-[minmax(0,1fr)]'} ${className}`}
      style={bottomInset === undefined ? undefined : { paddingBottom: bottomInset }}
    >
      <span
        data-project-hover-description=""
        onClick={onOpen}
        className="pointer-events-none block min-h-0 overflow-y-auto overscroll-contain text-[12px] font-medium leading-[1.45] text-[var(--accent-text)] group-hover:pointer-events-auto group-focus-within:pointer-events-auto"
      >
        {summary}
      </span>
      {hasFooter ? <span className="flex min-w-0 items-center gap-4 border-t border-[var(--control-border)] pt-2 text-[11px] font-semibold tabular-nums text-[var(--control-icon)]">
          {showEngagementMetrics ? METRICS.map(({ kind, label, icon, color }) => (
            <span key={kind} className="inline-flex min-w-0 items-center gap-1" title={`${formatEngagementCount(engagement.count(kind))} ${label}`}>
              <InterfaceIcon icon={icon} size="xs" weight="medium" keepColor stroke={color} style={{ color }} />
              <span>{formatEngagementCount(engagement.count(kind))}</span>
            </span>
          )) : null}
          {footerEnd ? <span className="pointer-events-auto relative ml-auto inline-flex shrink-0 items-center">{footerEnd}</span> : null}
        </span> : null}
    </span>
  );
}
