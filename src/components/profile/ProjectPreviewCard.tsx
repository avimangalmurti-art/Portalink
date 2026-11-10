import { MobileProjectPopup } from '../media/MobileProjectPopup';
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
import { useInlineProjectPages } from './ProjectPageBrowsingContext';
import { getCataloguePagePosition, rememberCataloguePagePosition } from '../../features/profile/cataloguePagePosition';
import { withCataloguePageTarget } from '../../features/profile/cataloguePageNavigation';
import { useInlineProjectContent } from '../../features/profile/useInlineProjectContent';
import { inlinePositionMatches, normalizeInlineProjectPosition } from './inlineProjectPageModel';
import './project-preview-actions.css';

const InlineProjectPages = lazy(() => import('./InlineProjectPages').then(module => ({ default: module.InlineProjectPages })));
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
  showCoverLoading?: boolean;
  /** Home can wait for an actual preview before resolving hidden detail data. */
  deferDesktopDetails?: boolean;
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
  label = `Open ${project.title}`, contentTypeLabel, href, onCollapse, className = '', sizes, priority = false, showCoverLoading, deferDesktopDetails = false, disabled = false,
  showEngagementMetrics = true, showCreator = true, metrics, footerEnd, editor, cover, aspectRatio, sharedCoverFallback = false, allowPdfFallback = true, allowVideoFallback = true }: Props) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [selection, setSelection] = useState({ projectId: project.id, position: getCataloguePagePosition(project.id) });
  useEffect(() => { if (!active) setPopupOpen(false); }, [active]);
  const isMobile = usePresentation() === 'mobile';
  // Explicit saved-page/custom artwork keeps its own navigation contract.
  const inlinePages = useInlineProjectPages() && !cover && !disabled;
  // On phones artwork opens the work on its first tap. Details have a separate
  // control at every mobile grid density.
  const preview = useContentPreview(disabled, isMobile || inlinePages ? 0 : 80, isMobile || inlinePages);
  const content = useInlineProjectContent({ project, creatorId: creator.id, enabled: inlinePages, active, hostRef: preview.ref });
  const remembered = selection.projectId === project.id ? selection.position : getCataloguePagePosition(project.id);
  const position = normalizeInlineProjectPosition(content.project, remembered, content.metadataComplete);
  useEffect(() => {
    if (!position || !remembered || inlinePositionMatches(position, remembered)) return;
    rememberCataloguePagePosition(project.id, position);
    setSelection({ projectId: project.id, position });
  }, [project.id, position, remembered]);
  const targetHref = href && !cover ? withCataloguePageTarget(href, project.id, position, isMobile ? 'scroll' : 'focused') : href;
  const hasExtension = Boolean(showCreator || metrics || showEngagementMetrics || footerEnd);
  useEffect(() => { if (!preview.expanded) onCollapse?.(); }, [preview.expanded, onCollapse]);
  const openProps = {
    'data-preview-open': '', 'data-project-continuity-surface': '', 'data-project-continuity-id': project.id,
    'data-project-continuity-owner': isMobile ? creator.id : undefined,
    'data-project-continuity-artwork': isMobile && !cover ? getProjectContinuityArtwork(project, sharedCoverFallback) : undefined,
    style: projectContinuityStyle(project.id), onPointerEnter: onWarmCreator, onFocus: onWarmCreator,
    onClick: (event: React.MouseEvent<HTMLElement>) => preview.open(event, () => {
      if (!cover && position) rememberCataloguePagePosition(project.id, position);
      if (isMobile) {
        if (!href || (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)) {
          beginProjectContinuity(project.id, 'open', event.currentTarget);
        }
        warmProjectDocumentRenderer(project);
      }
      if (!href || (inlinePages && event.currentTarget.tagName !== 'A')) onOpen();
    }),
    'aria-label': label, 'aria-expanded': isMobile ? undefined : preview.expanded,
    className: 'project-preview-artwork absolute inset-0 block h-full w-full overflow-hidden bg-[var(--surface-sunken)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
  };
  const artwork = <span className="project-preview-image absolute inset-0 block">
    {cover ?? <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} previewSource={getProjectCoverPreview(project)} alt={project.coverAlt} kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} aspectRatio={getProjectAspectRatio(project)} sizes={sizes} priority={priority} showLoadingIndicator={showCoverLoading} allowPdfFallback={allowPdfFallback} allowVideoFallback={allowVideoFallback} fallbackAttachments={sharedCoverFallback ? project.attachments : undefined} />}
  </span>;
  return <article ref={preview.ref} {...preview.events} data-project-preview="" data-inline-project-pages={inlinePages || undefined} data-mobile-project-card={isMobile ? '' : undefined} data-expanded={inlinePages ? false : preview.expanded} data-has-extension={hasExtension} className={`project-preview-card relative min-w-0 ${className}`}>
    <div data-packing-base="" className="project-card-frame individual-content-outline relative w-full" style={{ aspectRatio: aspectRatio ?? getProjectAspectRatio(project), height: 'var(--project-cover-height, auto)' }}>
      {inlinePages && content.metadataComplete ? <Suspense fallback={targetHref ? <Link to={targetHref} {...openProps}>{artwork}</Link> : <button type="button" {...openProps}>{artwork}</button>}>
        <InlineProjectPages project={content.project} metadataComplete={content.metadataComplete} ownerId={creator.id} active={active} cover={artwork} position={position} href={targetHref} label={label}
          onSelect={next => { rememberCataloguePagePosition(project.id, next); setSelection({ projectId: project.id, position: next }); }}
          onOpen={event => event ? openProps.onClick(event) : onOpen()} />
      </Suspense> : targetHref ? <Link to={targetHref} {...openProps}>{artwork}</Link> : <button type="button" {...openProps}>{artwork}</button>}
      {inlinePages && content.error && <button type="button" data-ui-shape="capsule" className="inline-project-retry" onClick={event => { event.preventDefault(); event.stopPropagation(); content.retry(); }}>Retry loading pages</button>}
      {!inlinePages && <ProjectHoverDetails summary={project.summary} href={targetHref} onOpen={(event) => { if(isMobile) { event.preventDefault(); event.stopPropagation(); setPopupOpen(true); } else preview.open(event, href ? () => undefined : onOpen); }} className="project-preview-description" />}
      {!disabled && <button type="button" data-ui-shape={inlinePages ? 'capsule' : undefined} data-keep-color="" className="mobile-preview-details focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        aria-label={`Show details for ${project.title}`} aria-haspopup="dialog" aria-expanded={popupOpen}
        onClick={event => { event.preventDefault(); event.stopPropagation(); setPopupOpen(true); }}><InterfaceIcon icon={MoreHorizontalIcon} size="sm" weight="medium" keepColor /></button>}
      {isMobile && contentTypeLabel && <span className="mobile-feed-content-type">{contentTypeLabel}</span>}
      {editor}
    </div>
    {active && popupOpen && <MobileProjectPopup project={project} creator={creator} onEditDescription={onEditDescription} contextHandlers={contextHandlers} onClose={() => setPopupOpen(false)} onOpenComments={onOpenComments} />}
    {!isMobile && !inlinePages && hasExtension && <Suspense fallback={null}><ProjectPreviewExtension expanded={preview.expanded} creator={creator}
      projectId={project.id} creatorHref={creatorHref} onOpenCreator={onOpenCreator} onWarmCreator={onWarmCreator}
      onOpenComments={onOpenComments} showCreator={showCreator} showEngagementMetrics={showEngagementMetrics}
      metrics={metrics} footerEnd={footerEnd} deferUntilExpanded={deferDesktopDetails} /></Suspense>}
  </article>;
}
