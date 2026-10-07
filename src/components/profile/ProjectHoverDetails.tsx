import { FormattedText } from '../text/FormattedText';
import React, { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { BookmarkIcon, HeartIcon, MessageCircleIcon, Repeat2Icon } from 'lucide-react';
import { useProjectEngagement } from '../../features/engagement/useProjectEngagement';
import { useProjectComments } from '../../features/comments/useProjectComments';
import type { Id } from '../../types/domain';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { usePresentation } from '../../presentation/usePresentation';

const formatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const formatCount = (count: number | null) => count === null ? '—' : formatter.format(count);
const METRICS = [
  { kind: 'like' as const, label: 'likes', icon: HeartIcon },
  { kind: 'save' as const, label: 'bookmarks', icon: BookmarkIcon },
  { kind: 'repost' as const, label: 'reposts', icon: Repeat2Icon },
];

/** Only the description occupies the original artwork frame. */
export function ProjectHoverDetails({ summary, className = '', onOpen, href }: {
  summary: string;
  className?: string;
  onOpen?: (event: React.MouseEvent<HTMLElement>) => void;
  href?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const presentation = usePresentation();
  useLayoutEffect(() => {
    if (presentation !== 'mobile') return;
    const text = containerRef.current?.querySelector<HTMLElement>('[data-project-hover-description]');
    if (!text) return;
    const updateEdges = () => {
      const maximum = Math.max(0, text.scrollHeight - text.clientHeight);
      const offset = Math.min(maximum, Math.max(0, text.scrollTop));
      text.style.setProperty('--description-fade-top', offset > 1 ? '14px' : '0px');
      text.style.setProperty('--description-fade-bottom', maximum - offset > 1 ? '14px' : '0px');
    };
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(text);
    if (text.firstElementChild) observer.observe(text.firstElementChild);
    text.addEventListener('scroll', updateEdges, { passive: true });
    return () => {
      observer.disconnect();
      text.removeEventListener('scroll', updateEdges);
      text.style.removeProperty('--description-fade-top');
      text.style.removeProperty('--description-fade-bottom');
    };
  }, [presentation, summary, href]);
  const props = {
    'data-project-hover-description': '', onClick: onOpen,
    className: 'project-hover-scrollbar block h-full min-h-0 min-w-0 overflow-y-auto overscroll-y-auto whitespace-pre-wrap break-words text-[12px] font-medium leading-[1.45] text-[var(--accent-text)]',
  };
  const text = <FormattedText text={summary} />;
  return <div ref={containerRef} className={`absolute inset-0 bg-[var(--control-rest-surface)] p-3 text-[var(--control-text)] ${className}`}>
    {href ? <Link to={href} tabIndex={-1} {...props}>{text}</Link> : <div {...props}>{text}</div>}
  </div>;
}

/** The same canonical counts, rendered in the card's attached extension. */
export function ProjectPreviewMetrics({ projectId, onOpenComments }: { projectId: Id; onOpenComments?: () => void }) {
  const engagement = useProjectEngagement(projectId);
  const comments = useProjectComments(onOpenComments ? projectId : null);
  const commentCount = comments.phase === 'ready' ? comments.totalCount : null;
  return <PreviewMetrics counts={{ like: engagement.count('like'), save: engagement.count('save'), repost: engagement.count('repost') }} commentCount={commentCount} onOpenComments={onOpenComments} />;
}

export function PreviewMetrics({ counts, commentCount, onOpenComments }: {
  counts: Record<'like' | 'save' | 'repost', number | null>;
  commentCount: number | null;
  onOpenComments?: () => void;
}) {
  return <div data-project-preview-metrics="" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold tabular-nums text-[var(--control-icon)]">
    {METRICS.map(({ kind, label, icon }) => <span key={kind} className="inline-flex items-center gap-1" title={`${formatCount(counts[kind])} ${label}`}>
      <InterfaceIcon icon={icon} size="xs" weight="medium" />
      <span>{formatCount(counts[kind])}</span>
    </span>)}
    {onOpenComments && <button type="button" onClick={(event) => { event.stopPropagation(); onOpenComments(); }} aria-label={`Open comments${commentCount === null ? '' : ` (${commentCount})`}`}
      className="inline-flex items-center gap-1 rounded-[5px] text-[var(--control-icon)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
      <InterfaceIcon icon={MessageCircleIcon} size="xs" weight="medium" />
      <span>{formatCount(commentCount)}</span>
    </button>}
  </div>;
}
