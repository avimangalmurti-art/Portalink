import { motionSeconds, motionCurve } from '../../presentation/motion/motion';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import type { FeedCreator, Id } from '../../types/domain';
import { CreatorAvatar } from './CreatorAvatar';
import { PreviewCreatorName } from './PreviewCreatorName';
import { ProjectPreviewMetrics } from './ProjectHoverDetails';

/** Cards without attribution or actions never load this animated extension. */
export function ProjectPreviewExtension({ expanded, creator, projectId, creatorHref, onOpenCreator, onWarmCreator,
  onOpenComments, showCreator, showEngagementMetrics, metrics, footerEnd }: {
  expanded: boolean;
  creator: Pick<FeedCreator, 'id' | 'name' | 'avatar'>;
  projectId: Id;
  creatorHref?: string;
  onOpenCreator?: () => void;
  onWarmCreator?: () => void;
  onOpenComments?: () => void;
  showCreator: boolean;
  showEngagementMetrics: boolean;
  metrics?: React.ReactNode;
  footerEnd?: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const [settled, setSettled] = useState(false);
  const extensionRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (extensionRef.current) extensionRef.current.inert = !expanded; }, [expanded]);
  const creatorContent = <>
    <CreatorAvatar name={creator.name} avatar={creator.avatar} shape="squircle" className="h-7 w-7 shrink-0 text-[11px]" fallbackClassName="bg-[var(--surface-sunken)] text-[var(--text-secondary)] ring-0" />
    <PreviewCreatorName name={creator.name} active={expanded && showCreator} />
  </>;
  const creatorProps = {
    className: 'project-preview-creator flex min-w-0 items-center gap-2 text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
    'aria-label': `Open ${creator.name}'s profile`,
    onPointerEnter: onWarmCreator,
    onFocus: onWarmCreator,
  };
  return <motion.div initial={false} animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
    transition={{ duration: reduceMotion ? 0 : motionSeconds('base'), ease: motionCurve() }}
    onAnimationStart={() => setSettled(false)} onAnimationComplete={() => setSettled(true)}
    aria-hidden={!expanded}
    className="project-preview-extension" style={{ overflow: expanded && (settled || reduceMotion) ? 'visible' : 'hidden' }}>
    <div ref={extensionRef} className="project-preview-extension-content flex min-w-0 flex-col gap-2 p-2">
      {(metrics || showEngagementMetrics || footerEnd) && <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {metrics ?? (showEngagementMetrics && <ProjectPreviewMetrics projectId={projectId} onOpenComments={onOpenComments} />)}
        {footerEnd && <span className="relative ml-auto inline-flex shrink-0">{footerEnd}</span>}
      </div>}
      {showCreator && (onOpenCreator ? <button type="button" {...creatorProps} onClick={onOpenCreator}>{creatorContent}</button>
        : <Link {...creatorProps} to={creatorHref ?? `/p/${creator.id}`}>{creatorContent}</Link>)}
    </div>
  </motion.div>;
}
