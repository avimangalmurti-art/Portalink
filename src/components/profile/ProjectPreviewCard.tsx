import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import type { FeedCreator, Project } from '../../types/domain';
import { useContentPreview } from '../../hooks/useContentPreview';
import { getProjectAspectRatio } from '../../utils/projectPresentation';
import { projectContinuityStyle } from '../../utils/projectContinuity';
import { ProjectCover } from '../media/ProjectCover';
import { CreatorAvatar } from './CreatorAvatar';
import { ProjectHoverDetails, ProjectPreviewMetrics } from './ProjectHoverDetails';

type Props = {
  project: Project;
  creator: Pick<FeedCreator, 'id' | 'name' | 'avatar'>;
  onOpen: () => void;
  onOpenComments?: () => void;
  onOpenCreator?: () => void;
  onWarmCreator?: () => void;
  creatorHref?: string;
  label?: string;
  href?: string;
  onCollapse?: () => void;
  className?: string;
  sizes?: string;
  priority?: boolean;
  disabled?: boolean;
  showEngagementMetrics?: boolean;
  metrics?: React.ReactNode;
  footerEnd?: React.ReactNode;
  editor?: React.ReactNode;
  cover?: React.ReactNode;
  aspectRatio?: number;
};

/** Artwork stays fixed; the extension overlays on WEB and grows the MOBILE row. */
export function ProjectPreviewCard({ project, creator, onOpen, onOpenComments, onOpenCreator, onWarmCreator, creatorHref,
  label = `Open ${project.title}`, href, onCollapse, className = '', sizes, priority = false, disabled = false,
  showEngagementMetrics = true, metrics, footerEnd, editor, cover, aspectRatio }: Props) {
  const preview = useContentPreview(disabled);
  const reduceMotion = useReducedMotion();
  const [settled, setSettled] = useState(false);
  const extensionRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (extensionRef.current) extensionRef.current.inert = !preview.expanded; }, [preview.expanded]);
  useEffect(() => { if (!preview.expanded) onCollapse?.(); }, [preview.expanded, onCollapse]);
  const creatorContent = <>
    <CreatorAvatar name={creator.name} avatar={creator.avatar} shape="compact" className="h-7 w-7 shrink-0 text-[11px]" fallbackClassName="bg-[var(--surface-sunken)] text-[var(--text-secondary)] ring-0" />
    <span className="min-w-0 truncate text-left text-[11px] font-semibold">{creator.name}</span>
  </>;
  const creatorProps = {
    className: 'project-preview-creator flex min-w-0 items-center gap-2 text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
    'aria-label': `Open ${creator.name}'s profile`,
    onPointerEnter: onWarmCreator,
    onFocus: onWarmCreator,
  };
  const openProps = {
    'data-preview-open': '', 'data-project-continuity-surface': '', 'data-project-continuity-id': project.id,
    style: projectContinuityStyle(project.id), onPointerEnter: onWarmCreator, onFocus: onWarmCreator,
    onClick: (event: React.MouseEvent<HTMLElement>) => preview.open(event, href ? () => undefined : onOpen),
    'aria-label': label, 'aria-expanded': preview.expanded,
    className: 'project-preview-artwork absolute inset-0 block h-full w-full overflow-hidden bg-[var(--surface-sunken)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
  };
  const artwork = <span className="project-preview-image absolute inset-0 block">
    {cover ?? <ProjectCover source={project.cover} alt={project.coverAlt} kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} aspectRatio={getProjectAspectRatio(project)} sizes={sizes} priority={priority} />}
  </span>;
  return <article ref={preview.ref} {...preview.events} data-project-preview="" data-expanded={preview.expanded} className={`project-preview-card relative min-w-0 ${className}`}>
    <div data-packing-base="" className="project-card-frame individual-content-outline relative w-full" style={{ aspectRatio: aspectRatio ?? getProjectAspectRatio(project), height: 'var(--project-cover-height, auto)' }}>
      {href ? <Link to={href} {...openProps}>{artwork}</Link> : <button type="button" {...openProps}>{artwork}</button>}
      <ProjectHoverDetails summary={project.summary} href={href} onOpen={(event) => preview.open(event, href ? () => undefined : onOpen)} className="project-preview-description" />
      {editor}
    </div>
    <motion.div initial={false} animate={{ height: preview.expanded ? 'auto' : 0, opacity: preview.expanded ? 1 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      onAnimationStart={() => setSettled(false)} onAnimationComplete={() => setSettled(true)}
      aria-hidden={!preview.expanded}
      className="project-preview-extension" style={{ overflow: preview.expanded && (settled || reduceMotion) ? 'visible' : 'hidden' }}>
      <div ref={extensionRef} className="project-preview-extension-content flex min-w-0 flex-col gap-2 p-2">
        {(metrics || showEngagementMetrics || footerEnd) && <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {metrics ?? (showEngagementMetrics && <ProjectPreviewMetrics projectId={project.id} onOpenComments={onOpenComments} />)}
          {footerEnd && <span className="relative ml-auto inline-flex shrink-0">{footerEnd}</span>}
        </div>}
        {onOpenCreator ? <button type="button" {...creatorProps} onClick={onOpenCreator}>{creatorContent}</button>
          : <Link {...creatorProps} to={creatorHref ?? `/p/${creator.id}`}>{creatorContent}</Link>}
      </div>
    </motion.div>
  </article>;
}
