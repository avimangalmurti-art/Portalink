import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkIcon, MessageCircleIcon, MoreHorizontalIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useSheetMotion } from '../../presentation/motion/useSheetMotion';
import { reducedMotion } from '../../presentation/motion/motion';
import { useProjectComments } from '../../features/comments/useProjectComments';
import { EngagementFeedback } from '../../features/engagement/EngagementBar';
import type { ProjectEngagementLifecycle } from '../../features/engagement/useProjectEngagement';
import { FormattedText } from '../text/FormattedText';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import './follow-content-info.css';

/** Reading-only presentation: the existing viewer retains page, zoom and scroll state. */
export function FollowContentInfoPopup({ projectId, title, description, creatorHeader, engagement, onOptions, onComments, onRequireAccount, onClose, engagementContent, optionsContent, showEngagement = true }: {
  projectId: string; title: string; description?: string; creatorHeader: React.ReactNode;
  engagement: ProjectEngagementLifecycle; onOptions?: () => void; onComments?: () => void;
  onRequireAccount?: () => void; onClose: () => void; engagementContent?: React.ReactNode; optionsContent?: React.ReactNode; showEngagement?: boolean;
}) {
  const viewport = useDialogViewport();
  const panel = useRef<HTMLElement>(null);
  const motion = useSheetMotion(onClose, 'base');
  const closing = motion.closing;
  const [optionsOpen, setOptionsOpen] = useState(false);
  const comments = useProjectComments(!showEngagement || engagementContent ? null : projectId);
  const dismiss = () => {
    if (closing) return;
    // A close during entrance starts at the currently painted opacity/position.
    for (const element of [viewport.current, panel.current]) {
      if (!element) continue;
      const style = getComputedStyle(element);
      element.style.setProperty('--follow-info-exit-opacity', style.opacity);
      if (element === panel.current) element.style.setProperty('--follow-info-exit-transform', style.transform);
    }
    motion.close();
  };
  // The fade is decorative: the reader can receive the very next native input.
  useModalFocus(!closing, panel, dismiss, true);
  useEffect(() => {
    window.addEventListener('popstate', motion.finish, true);
    return () => window.removeEventListener('popstate', motion.finish, true);
  }, [motion.finish]);
  const host = document.fullscreenElement ?? document.querySelector('.app-shell') ?? document.body;
  useLayoutEffect(() => {
    if (closing) return;
    // Only the mounted reader becomes inert; existing nested actions sheets stay available.
    const siblings = Array.from(host.querySelectorAll<HTMLElement>('[data-premium-project-viewer]'));
    const previous = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    return () => siblings.forEach((node, index) => { node.inert = previous[index]; });
  }, [host, closing]);
  return createPortal(<div ref={element => { if (element) element.inert = closing; }} data-presentation="mobile" data-follow-info-layer="" data-closing={closing || undefined} data-reduce-motion={reducedMotion() || undefined} aria-hidden={closing || undefined}>
    <div ref={viewport} className="follow-info-overlay" data-closing={closing || undefined}
      style={{ top: 'var(--dialog-viewport-top, 0px)', height: 'var(--dialog-viewport-height, 100dvh)' }}
      onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) dismiss(); }}>
      <section data-ui-surface="popup" ref={panel} id="mobile-project-popup" className="follow-info-panel" role="dialog" aria-modal="true" aria-labelledby="follow-info-title" tabIndex={-1}>
        <header className="follow-info-header">
          {creatorHeader}
          <div className="follow-info-header-actions">
            {(optionsContent || onOptions) && <button type="button" aria-label="Content options"
              data-ui-control="icon" data-control-size="md" data-control-variant="secondary"
              className="follow-info-options" aria-expanded={optionsContent ? optionsOpen : undefined}
              onClick={() => optionsContent ? setOptionsOpen(open => !open) : onOptions?.()}>
              <InterfaceIcon icon={MoreHorizontalIcon} />
            </button>}
            <button type="button" className="follow-info-minimize" aria-label="Minimize project information" onClick={dismiss}>
              <span aria-hidden="true" />
            </button>
          </div>
          {optionsContent && optionsOpen && <div className="follow-info-owner-menu">{optionsContent}</div>}
        </header>
        <h2 id="follow-info-title">{title}</h2>
        <div className="follow-info-description scrollbar-overlay" tabIndex={0} aria-label="Content description"><FormattedText text={description || 'This project has no description.'} /></div>
        {showEngagement && <footer className="follow-info-engagement">
          {engagementContent ?? <><div role="group" aria-label={`Engagement for ${title}`}>
            <button type="button" data-ui-shape="action" aria-label={`Comments: ${title}`} onClick={onComments}><InterfaceIcon icon={MessageCircleIcon} />{comments.phase === 'ready' && <span>{comments.totalCount}</span>}</button>
            <button type="button" data-ui-shape="action" aria-label={`Bookmark: ${title}`} aria-pressed={engagement.isEngaged('save')}
              disabled={!onRequireAccount && (engagement.isPending('save') || engagement.isResolving || engagement.resolveError !== null)} onClick={() => onRequireAccount ? onRequireAccount() : engagement.toggle('save')}>
              <InterfaceIcon icon={BookmarkIcon} fill={engagement.isEngaged('save') ? 'currentColor' : 'none'} />{engagement.count('save') !== null && <span>{engagement.count('save')}</span>}
            </button>
          </div>
          <EngagementFeedback engagement={engagement} /></>}
        </footer>}
      </section>
    </div>
  </div>, host);
}



