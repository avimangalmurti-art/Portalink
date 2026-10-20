import { MobileProjectPopup } from '../media/MobileProjectPopup';
import { useMobileProjectContext } from '../../presentation/mobile/useMobileProjectContext';
import type { ContextTarget } from '../../presentation/mobile/contextActions';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontalIcon } from 'lucide-react';
import { usePresentation } from '../../presentation/usePresentation';
import type { FeedCreator, Project } from '../../types/domain';
import { useContentPreview } from '../../hooks/useContentPreview';
import { getProjectAspectRatio, getProjectCoverPreview } from '../../utils/projectPresentation';
import { beginProjectContinuity, getProjectContinuityArtwork, projectContinuityStyle } from '../../utils/projectContinuity';
import { ProjectCover } from '../media/ProjectCover';
import { ProjectHoverDetails } from './ProjectHoverDetails';
import type { ImagePriority } from '../ui/ResponsiveImage';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { warmProjectDocumentRenderer } from '../media/warmDocumentRenderer';

const ProjectPreviewExtension = lazy(() => import('./ProjectPreviewExtension').then(module => ({ default: module.ProjectPreviewExtension })));

type Props = {
  /** Retained catalogues keep their layout/state but cannot own body popups. */
  active?: boolean;
  onEditDescription?: () => void;
  contextHandlers?: ContextTarget['handlers'];
  project: Project;
  creator: Pick<FeedCreator, 'id' | 'name' | 'avatar'>;
  onOpen: () => void;
  onOpenComments?: () => void;
  onOpenCreator?: () => void;
  onWarmCreator?: () => void;
  creatorHref?: string;
  label?: string;
  contentTypeLabel?: string;
  href?: string;
  onCollapse?: () => void;
  className?: string;
  sizes?: string;
  priority?: ImagePriority;
  allowPdfFallback?: boolean;
  allowVideoFallback?: boolean;
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
export function ProjectPreviewCard({ active = true, contextHandlers, onEditDescription, project, creator, onOpen, onOpenComments, onOpenCreator, onWarmCreator, creatorHref,
  label = `Open ${project.title}`, contentTypeLabel, href, onCollapse, className = '', sizes, priority = false, disabled = false,
  showEngagementMetrics = true, showCreator = true, metrics, footerEnd, editor, cover, aspectRatio, sharedCoverFallback = false, allowPdfFallback = true, allowVideoFallback = true }: Props) {
  const [popupOpen, setPopupOpen] = useState(false);
  useEffect(() => { if (!active) setPopupOpen(false); }, [active]);
  const isMobile = usePresentation() === 'mobile';
  const press = useMobileProjectContext(project, creator.id, contextHandlers, disabled);
  // On phones artwork opens the work on its first tap. Details have a separate
  // control at every mobile grid density.
  const preview = useContentPreview(disabled, isMobile ? 0 : 80, isMobile);
  const hasExtension = Boolean(showCreator || metrics || showEngagementMetrics || footerEnd);
  useEffect(() => { if (!preview.expanded) onCollapse?.(); }, [preview.expanded, onCollapse]);
  const openProps = {
    'data-preview-open': '', 'data-project-continuity-surface': '', 'data-project-continuity-id': project.id,
    'data-project-continuity-owner': isMobile ? creator.id : undefined,
    'data-project-continuity-artwork': isMobile && !cover ? getProjectContinuityArtwork(project, sharedCoverFallback) : undefined,
    style: projectContinuityStyle(project.id), onPointerEnter: onWarmCreator, onFocus: onWarmCreator,
    onClick: (event: React.MouseEvent<HTMLElement>) => preview.open(event, () => {
      if (isMobile) {
        if (!href || (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)) {
          beginProjectContinuity(project.id, 'open', event.currentTarget);
        }
        warmProjectDocumentRenderer(project);
      }
      if (!href) onOpen();
    }),
    'aria-label': label, 'aria-expanded': isMobile ? undefined : preview.expanded,
    className: 'project-preview-artwork absolute inset-0 block h-full w-full overflow-hidden bg-[var(--surface-sunken)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
  };
  const artwork = <span className="project-preview-image absolute inset-0 block">
    {cover ?? <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} previewSource={getProjectCoverPreview(project)} alt={project.coverAlt} kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} aspectRatio={getProjectAspectRatio(project)} sizes={sizes} priority={priority} allowPdfFallback={allowPdfFallback} allowVideoFallback={allowVideoFallback} fallbackAttachments={sharedCoverFallback ? project.attachments : undefined} />}
  </span>;
  return <article ref={preview.ref} {...preview.events} {...press}
    onPointerDownCapture={event => { preview.events.onPointerDownCapture(event); press.onPointerDownCapture?.(event); }}
    onPointerMoveCapture={event => { preview.events.onPointerMoveCapture(event); press.onPointerMoveCapture?.(event); }}
    onPointerUpCapture={() => { preview.events.onPointerUpCapture(); press.onPointerUpCapture?.(); }}
    onPointerCancel={() => { preview.events.onPointerCancel(); press.onPointerCancel?.(); }} data-project-preview="" data-mobile-project-card={isMobile ? '' : undefined} data-expanded={preview.expanded} data-has-extension={hasExtension} className={`project-preview-card relative min-w-0 ${className}`}>
    <div data-packing-base="" className="project-card-frame individual-content-outline relative w-full" style={{ aspectRatio: aspectRatio ?? getProjectAspectRatio(project), height: 'var(--project-cover-height, auto)' }}>
      {href ? <Link to={href} {...openProps}>{artwork}</Link> : <button type="button" {...openProps}>{artwork}</button>}
      <ProjectHoverDetails summary={project.summary} href={href} onOpen={(event) => { if(isMobile) { event.preventDefault(); event.stopPropagation(); setPopupOpen(true); } else preview.open(event, href ? () => undefined : onOpen); }} className="project-preview-description" />
      {isMobile && !disabled && <button type="button" data-keep-color="" className="mobile-preview-details focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        aria-label={`Show details for ${project.title}`} aria-haspopup="dialog" aria-expanded={popupOpen}
        onClick={event => { event.stopPropagation(); setPopupOpen(true); }}><InterfaceIcon icon={MoreHorizontalIcon} size="sm" weight="medium" keepColor /></button>}
      {isMobile && contentTypeLabel && <span className="mobile-feed-content-type">{contentTypeLabel}</span>}
      {editor}
    </div>
    {active && isMobile && popupOpen && <MobileProjectPopup project={project} creator={creator} onEditDescription={onEditDescription} contextHandlers={contextHandlers} onClose={() => setPopupOpen(false)} onOpenComments={onOpenComments} />}
    {!isMobile && hasExtension && <Suspense fallback={null}><ProjectPreviewExtension expanded={preview.expanded} creator={creator}
      projectId={project.id} creatorHref={creatorHref} onOpenCreator={onOpenCreator} onWarmCreator={onWarmCreator}
      onOpenComments={onOpenComments} showCreator={showCreator} showEngagementMetrics={showEngagementMetrics}
      metrics={metrics} footerEnd={footerEnd} /></Suspense>}
  </article>;
}
