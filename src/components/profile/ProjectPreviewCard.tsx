import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { usePresentation } from '../../presentation/usePresentation';
import type { FeedCreator, Project } from '../../types/domain';
import { useContentPreview } from '../../hooks/useContentPreview';
import { getProjectAspectRatio, getProjectCoverPreview } from '../../utils/projectPresentation';
import { projectContinuityStyle } from '../../utils/projectContinuity';
import { ProjectCover } from '../media/ProjectCover';
import { CreatorAvatar } from './CreatorAvatar';
import { PreviewCreatorName } from './PreviewCreatorName';
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
  showCreator?: boolean;
  metrics?: React.ReactNode;
  footerEnd?: React.ReactNode;
  editor?: React.ReactNode;
  cover?: React.ReactNode;
  aspectRatio?: number;
  sharedCoverFallback?: boolean;
};

/** Artwork stays fixed; each presentation places the extension over the next row. */
export function ProjectPreviewCard({ project, creator, onOpen, onOpenComments, onOpenCreator, onWarmCreator, creatorHref,
  label = `Open ${project.title}`, href, onCollapse, className = '', sizes, priority = false, disabled = false,
  showEngagementMetrics = true, showCreator = true, metrics, footerEnd, editor, cover, aspectRatio, sharedCoverFallback = false }: Props) {
  const isMobile = usePresentation() === 'mobile';
  // On phones artwork opens the work on its first tap. Details have a separate
  // control on cards large enough to contain a comfortable touch target.
  const preview = useContentPreview(disabled, 80, isMobile);
  const reduceMotion = useReducedMotion();
  const [settled, setSettled] = useState(false);
  const extensionRef = useRef<HTMLDivElement>(null);
  const hasExtension = Boolean(showCreator || metrics || showEngagementMetrics || footerEnd);
  useLayoutEffect(() => { if (extensionRef.current) extensionRef.current.inert = !preview.expanded; }, [preview.expanded, hasExtension]);
  useEffect(() => { if (!preview.expanded) onCollapse?.(); }, [preview.expanded, onCollapse]);
  const creatorContent = <>
    <CreatorAvatar name={creator.name} avatar={creator.avatar} shape="compact" className="h-7 w-7 shrink-0 text-[11px]" fallbackClassName="bg-[var(--surface-sunken)] text-[var(--text-secondary)] ring-0" />
    <PreviewCreatorName name={creator.name} active={preview.expanded && showCreator} />
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
    'aria-label': label, 'aria-expanded': isMobile ? undefined : preview.expanded,
    className: 'project-preview-artwork absolute inset-0 block h-full w-full overflow-hidden bg-[var(--surface-sunken)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
  };
  const artwork = <span className="project-preview-image absolute inset-0 block">
    {cover ?? <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} previewSource={getProjectCoverPreview(project)} alt={project.coverAlt} kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} aspectRatio={getProjectAspectRatio(project)} sizes={sizes} priority={priority} fallbackAttachments={sharedCoverFallback ? project.attachments : undefined} />}
  </span>;
  return <article ref={preview.ref} {...preview.events} data-project-preview="" data-mobile-project-card={isMobile ? '' : undefined} data-expanded={preview.expanded} data-has-extension={hasExtension} className={`project-preview-card relative min-w-0 ${className}`}>
    <div data-packing-base="" className="project-card-frame individual-content-outline relative w-full" style={{ aspectRatio: aspectRatio ?? getProjectAspectRatio(project), height: 'var(--project-cover-height, auto)' }}>
      {href ? <Link to={href} {...openProps}>{artwork}</Link> : <button type="button" {...openProps}>{artwork}</button>}
      <ProjectHoverDetails summary={project.summary} href={href} onOpen={(event) => preview.open(event, href ? () => undefined : onOpen)} className="project-preview-description" />
      {isMobile && !disabled && <button type="button" data-keep-color="" className="mobile-preview-details focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        aria-label={`${preview.expanded ? 'Hide' : 'Show'} details for ${project.title}`} aria-expanded={preview.expanded}
        onClick={event => { event.stopPropagation(); preview.toggleDetails(); }}><span aria-hidden="true">i</span></button>}
      {editor}
    </div>
    {hasExtension && <motion.div initial={false} animate={{ height: preview.expanded ? 'auto' : 0, opacity: preview.expanded ? 1 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      onAnimationStart={() => setSettled(false)} onAnimationComplete={() => setSettled(true)}
      aria-hidden={!preview.expanded}
      className="project-preview-extension" style={{ overflow: preview.expanded && (settled || reduceMotion) ? 'visible' : 'hidden' }}>
      <div ref={extensionRef} className="project-preview-extension-content flex min-w-0 flex-col gap-2 p-2">
        {(metrics || showEngagementMetrics || footerEnd) && <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {metrics ?? (showEngagementMetrics && <ProjectPreviewMetrics projectId={project.id} onOpenComments={onOpenComments} />)}
          {footerEnd && <span className="relative ml-auto inline-flex shrink-0">{footerEnd}</span>}
        </div>}
        {showCreator && (onOpenCreator ? <button type="button" {...creatorProps} onClick={onOpenCreator}>{creatorContent}</button>
          : <Link {...creatorProps} to={creatorHref ?? `/p/${creator.id}`}>{creatorContent}</Link>)}
      </div>
    </motion.div>}
  </article>;
}
