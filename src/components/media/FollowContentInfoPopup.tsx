import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkIcon, MessageCircleIcon, MoreHorizontalIcon, Repeat2Icon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useProjectComments } from '../../features/comments/useProjectComments';
import { EngagementFeedback } from '../../features/engagement/EngagementBar';
import type { ProjectEngagementLifecycle } from '../../features/engagement/useProjectEngagement';
import { FormattedText } from '../text/FormattedText';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import './follow-content-info.css';

/** Reading-only presentation: the existing viewer retains page, zoom and scroll state. */
export function FollowContentInfoPopup({ projectId, title, description, creatorHeader, engagement, onOptions, onComments, onRequireAccount, onClose }: {
  projectId: string; title: string; description?: string; creatorHeader: React.ReactNode;
  engagement: ProjectEngagementLifecycle; onOptions: () => void; onComments: () => void;
  onRequireAccount?: () => void; onClose: () => void;
}) {
  const viewport = useDialogViewport();
  const panel = useRef<HTMLElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [closing, setClosing] = useState(false);
  const comments = useProjectComments(projectId);
  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  };
  useModalFocus(true, panel, dismiss, true);
  useEffect(() => () => clearTimeout(timer.current), []);
  const host = document.fullscreenElement ?? document.querySelector('.app-shell') ?? document.body;
  useLayoutEffect(() => {
    // Only the mounted reader becomes inert; existing nested actions sheets stay available.
    const siblings = Array.from(host.querySelectorAll<HTMLElement>('[data-premium-project-viewer]'));
    const previous = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    return () => siblings.forEach((node, index) => { node.inert = previous[index]; });
  }, [host]);
  return createPortal(<div ref={layer} data-presentation="mobile" data-follow-info-layer="">
    <div ref={viewport} className="follow-info-overlay" data-closing={closing || undefined}
      style={{ top: 'var(--dialog-viewport-top, 0px)', height: 'var(--dialog-viewport-height, 100dvh)' }}
      onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) dismiss(); }}>
      <section ref={panel} id="mobile-project-popup" className="follow-info-panel" role="dialog" aria-modal="true" aria-labelledby="follow-info-title" tabIndex={-1}>
        <header className="follow-info-header">{creatorHeader}<button type="button" aria-label="Content options" className="follow-info-options" onClick={onOptions}><InterfaceIcon icon={MoreHorizontalIcon} /></button></header>
        <h2 id="follow-info-title">{title}</h2>
        <div className="follow-info-description scrollbar-overlay" tabIndex={0} aria-label="Content description"><FormattedText text={description || 'This project has no description.'} /></div>
        <footer className="follow-info-engagement">
          <div role="group" aria-label={`Engagement for ${title}`}>
            <button type="button" aria-label={`Comments: ${title}`} onClick={onComments}><InterfaceIcon icon={MessageCircleIcon} />{comments.phase === 'ready' && <span>{comments.totalCount}</span>}</button>
            {(['save', 'repost'] as const).map(kind => <button key={kind} type="button" aria-label={`${kind === 'save' ? 'Bookmark' : 'Repost'}: ${title}`} aria-pressed={engagement.isEngaged(kind)}
              disabled={!onRequireAccount && (engagement.isPending(kind) || engagement.isResolving || engagement.resolveError !== null)} onClick={() => onRequireAccount ? onRequireAccount() : engagement.toggle(kind)}>
              <InterfaceIcon icon={kind === 'save' ? BookmarkIcon : Repeat2Icon} fill={engagement.isEngaged(kind) ? 'currentColor' : 'none'} />{engagement.count(kind) !== null && <span>{engagement.count(kind)}</span>}
            </button>)}
          </div>
          <EngagementFeedback engagement={engagement} />
        </footer>
      </section>
    </div>
  </div>, host);
}



