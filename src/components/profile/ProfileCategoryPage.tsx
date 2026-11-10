import { RouteError } from '../ui/RouteError';
import { useMobileScreenActions } from '../../presentation/mobile/MobileContextActions';
import { contextActions } from '../../presentation/mobile/contextActions';
import { SavedChangeNotice } from '../ui/SavedChangeNotice';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { MobileProjectGestureHint } from '../../presentation/mobile/MobileProjectGestureHint';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircleIcon, ChevronLeftIcon, FilePlusIcon, Grid2X2Icon, ImagePlusIcon, Maximize2Icon, Minimize2Icon, PanelLeftCloseIcon, PanelLeftOpenIcon, SearchIcon, SquareIcon } from 'lucide-react';
// Canonical domain models, not the seed module's parallel copies.
import type { Profile, PortfolioCategory as ProfileCategory } from '../../types/domain';
import { ProjectIndexList } from './ProjectIndexList';
import { MobilePortalProjectToolbar, type MobileProjectSort } from './MobilePortalProjectToolbar';
import { sortPortalProjects } from './portalProjectBrowsing';
import { getTypefaceStack } from '../../data/typefaces';
import { useElementSize } from '../../hooks/useElementSize';
import { allocateProjectPanels, projectPanelGeometry, type ProjectPanel } from '../../utils/projectPanelLayout';
import { ProjectMediaViewer } from '../media/ProjectMediaViewer';
import { ProjectPagesPerRowControl } from '../media/ProjectPagesPerRowControl';
import { MobileProjectIndexPortal } from '../media/MobileProjectIndexPortal';
import { resolveProjectAttachments } from '../../features/media/projectAttachments';
import { canAuthor, type ViewerRole } from '../../types/viewer';
import { useProjectArrangement } from '../../features/profile/useProjectArrangement';
import { useProjectTypography } from '../../features/projects/useProjectTypography';
import { normalizePagesPerRow } from '../../features/projects/pageLayout';
import { useProjectManagement } from '../../features/projects/useProjectManagement';
import { DeleteProjectDialog, ProjectEditorDialog } from '../../features/projects/ProjectEditorDialog';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { useAssetProcessing } from '../../features/media/useAssetProcessing';
import { preloadProjectMedia } from '../../features/media/preloadProjectMedia';
import { ResizablePanelHandle, useResizablePanelWidth } from '../ui/ResizablePanelHandle';
import { panelLayoutDefaults, PANEL_LAYOUT_RESET_EVENT } from '../../utils/panelLayoutDefaults';
import { usePresentation } from '../../presentation/usePresentation';
import { useAppRoute } from '../../app/useAppRoute';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';
import './web-reader-spacing.css';
type ProfileCategoryPageProps = {
  profile: Profile;
  category: ProfileCategory;
  /**
   * The viewer's relationship to this profile, and the ONLY permission input this
   * component takes. Published work reads the same for all three roles; only the
   * owner gets arrangement, typography, and publishing.
   */
  viewerRole: ViewerRole;
  activeProjectId: string | null;
  /** WEB keeps its confirmed index while selected project media is fetched. */
  readerLoading?: boolean;
  /** Returns to the screen used to enter this portal. */
  onBack: () => void;
  /** Leaves this portal for the viewed creator's portal collection. */
  onBackToPortals: () => void;
  /** Keeps the existing profile identity visible only while MOBILE navigation is open. */
  onMobileIndexOpenChange?: (open: boolean) => void;
  /**
   * Changes which project the portal is showing. `replace` is used for the
   * WEB's automatic first-project selection on entry, so that lands in place of the
   * bare category rather than as its own history entry.
   */
  onSelectProject: (projectId: string | null, replace?: boolean) => void;
  /** Owner-only. Absent for visitors and signed-out viewers. */
  onCreateProject?: () => void;
  /** Panel visibility belongs to the browsing session, not an individual portal. */
  isIndexCollapsed: boolean;
  onIndexCollapsedChange: (collapsed: boolean) => void;
  isEngagementOpen: boolean;
  onEngagementOpenChange: (open: boolean) => void;
  /** Public shared links preserve Portal browsing but remove social and authoring controls. */
  sharedReadOnly?: boolean;
  /**
   * Returns to the discovery surface this project was opened from. Present ONLY
   * when the viewer arrived that way — reaching a portal through the sidebar
   * leaves it absent, because there would be no browse to return to. Applies
   * equally to the viewer's own portal and anyone else's.
   */
  onReturnToDiscovery?: () => void;
};
export function ProfileCategoryPage({
  profile,
  category,
  viewerRole,
  activeProjectId,
  readerLoading = false,
  onBack,
  onBackToPortals,
  onMobileIndexOpenChange,
  onSelectProject: selectProject,
  onCreateProject,
  isIndexCollapsed: preferredIndexCollapsed,
  onIndexCollapsedChange: changeIndexPreference,
  isEngagementOpen: responseWanted,
  onEngagementOpenChange: changeResponsePreference,
  sharedReadOnly = false,
  onReturnToDiscovery
}: ProfileCategoryPageProps) {
  // Mobile panels are local to the portal and independent of WEB preferences.
  const isMobile = usePresentation() === 'mobile';
  const isReaderLoading = !isMobile && readerLoading;
  const mobileIndexOnly = isMobile && activeProjectId === null;
  const [mobilePanel, setMobilePanel] = useState<ProjectPanel | null>(null);
  useEffect(() => { setMobilePanel(null); }, [category.id, isMobile]);
  const projectIndexWidth = useResizablePanelWidth({
    // Public copies keep a separate preference from the signed-in workspace.
    id: sharedReadOnly ? 'shared-project-index-standard' : 'project-index',
    defaultWidth: panelLayoutDefaults.projectIndex,
    minWidth: 220,
    maxWidth: 420,
    viewportReserve: 360
  });
  const responseRailWidth = useResizablePanelWidth({
    id: sharedReadOnly ? 'shared-project-details-standard' : 'project-response',
    defaultWidth: sharedReadOnly ? panelLayoutDefaults.sharedDetails : panelLayoutDefaults.engagement,
    minWidth: sharedReadOnly ? 240 : 304, maxWidth: 440, viewportReserve: 420
  });
  const workspace = useElementSize<HTMLDivElement>();
  const projectPresentationRef = workspace.ref;
  const projectIndexRef = useRef<HTMLDivElement>(null);
  const [lastOpened, setLastOpened] = useState<ProjectPanel | null>(null);
  const [compactPanel, setCompactPanel] = useState<ProjectPanel | null>(null);
  useEffect(() => {
    const reset = () => {
      setCompactPanel(null);
      setLastOpened(null);
    };
    window.addEventListener(PANEL_LAYOUT_RESET_EVENT, reset);
    return () => window.removeEventListener(PANEL_LAYOUT_RESET_EVENT, reset);
  }, []);
  const onSelectProject = useCallback((id: string | null, replace?: boolean) => {
    setCompactPanel(null);
    selectProject(id, replace);
    if (compactPanel) requestAnimationFrame(() => projectPresentationRef.current?.querySelector<HTMLButtonElement>('[data-project-index-toggle]')?.focus());
  }, [selectProject, compactPanel, projectPresentationRef]);
  const openPanel = useCallback((panel: ProjectPanel) => {
    setLastOpened(panel);
    const minimum = panel === 'index' ? 220 : sharedReadOnly ? 240 : 304;
    setCompactPanel(workspace.width < projectPanelGeometry.workMinimum + projectPanelGeometry.rail + minimum ? panel : null);
  }, [workspace.width, sharedReadOnly]);
  useEffect(() => {
    if (!compactPanel) return;
    const minimum = compactPanel === 'index' ? 220 : sharedReadOnly ? 240 : 304;
    if (workspace.width >= projectPanelGeometry.workMinimum + projectPanelGeometry.rail + minimum) setCompactPanel(null);
  }, [compactPanel, workspace.width, sharedReadOnly]);
  const [query, setQuery] = useState('');
  // WEB search stays intact, but cannot invisibly filter the mobile popup.
  const indexQuery = isMobile ? '' : query;
  const [mobileSort, setMobileSort] = useState<MobileProjectSort>('recent');
  const [mobileLayout, setMobileLayout] = useState<'list' | 'grid'>('list');
  /*
   * Arriving from discovery, the index starts closed: the viewer chose one piece
   * of work, not a portal to browse, so the work opens with the full width and
   * the creator's index is there to be opened rather than opened for them.
   * `onReturnToDiscovery` is present exactly in that case, which is why it is
   * the condition. Reaching the portal any other way opens the index as before.
   */
  // Transient confirmation for owner actions, so no control is a dead end.
  /**
   * Authoring belongs to the owner alone, and the owner is resolved upstream from
   * the authenticated profile id. A guest and a signed-in visitor both read the
   * published work; neither can arrange or hide it.
   *
   * This governs what is OFFERED, not what is permitted. Withholding a control
   * here is not access control — the service must refuse an unauthorised write on
   * its own, because nothing in this component can be trusted by a backend.
   */
  const showsOwnerTools = canAuthor(viewerRole);
  const categoryProjects = useMemo(() => profile.projects.filter((project) => project.categoryId === category.id), [profile, category]);
  /**
   * Order and the hidden set come from the service, not from this component.
   * Work the owner has hidden is withheld from everyone else — and withheld
   * silently, because announcing "there is something here you cannot see" would
   * leak the existence of unpublished work. That filtering is presentation only:
   * a real implementation must carry visibility on the record and filter
   * server-side, where a client cannot reach it.
   */
  const arrangement = useProjectArrangement(profile.id, category.id, showsOwnerTools, categoryProjects.map(project => project.id));
  /**
   * The owner lifecycle of already-published work. Presentation calls no service:
   * the rows request an edit or a deletion, and this boundary owns loading,
   * validation, pending, failure, retry, and the canonical invalidation.
   */
  const management = useProjectManagement(profile.id);
  const deletingProject = categoryProjects.find((project) => project.id === management.deletion.projectId) ?? null;
  const projects = useMemo(() => arrangement.arrange(categoryProjects, showsOwnerTools), [arrangement, categoryProjects, showsOwnerTools]);
  const visibleProjects = useMemo(() => {
    const normalized = indexQuery.trim().toLowerCase();
    const filtered = normalized ? projects.filter(project => `${project.title} ${project.summary}`.toLowerCase().includes(normalized)) : projects;
    return isMobile ? sortPortalProjects(filtered, mobileSort) : filtered;
  }, [projects, indexQuery, isMobile, mobileSort]);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  useMobileScreenActions(activeProject && !sharedReadOnly ? contextActions('project', { signedIn: viewerRole !== 'guest', owner: showsOwnerTools }, { title: activeProject.title, handlers: {
    edit: () => management.editor.open(activeProject.id),
    cover: () => management.editor.open(activeProject.id, 'files'),
    visibility: !arrangement.isLoading && !arrangement.loadError && !arrangement.isSaving ? () => arrangement.toggleHidden(activeProject.id) : undefined,
    delete: () => management.deletion.request(activeProject.id),
  }, labels: { visibility: arrangement.hiddenIds.includes(activeProject.id) ? 'Show in portal' : 'Hide from portal' } }) : null, 18);
  const mobileProjectView = isMobile && activeProject !== null;
  useEffect(() => {
    if (management.editor.mode === 'description' && management.editor.projectId && management.editor.projectId !== activeProjectId && !management.editor.isSaving) void management.editor.close();
  }, [activeProjectId, management.editor]);
  const onIndexCollapsedChange = useCallback((collapsed: boolean) => {
    if (mobileProjectView) {
      setMobilePanel(collapsed ? null : 'index');
      requestAnimationFrame(() => (collapsed ? projectPresentationRef.current : projectIndexRef.current)?.querySelector<HTMLButtonElement>('[data-project-index-toggle]')?.focus());
      return;
    }
    if (!collapsed) openPanel('index');
    else setCompactPanel(null);
    changeIndexPreference(collapsed);
    requestAnimationFrame(() => projectPresentationRef.current?.querySelector<HTMLButtonElement>('[data-project-index-toggle]')?.focus());
  }, [changeIndexPreference, openPanel, projectPresentationRef, mobileProjectView]);
  const onEngagementOpenChange = (open: boolean) => {
    if (mobileProjectView) { setMobilePanel(open ? 'response' : null); return; }
    if (open) openPanel('response');
    else setCompactPanel(null);
    changeResponsePreference(open);
  };
  /**
   * Each project's own face, resolved from the record through the service rather
   * than from a map held above this page. Read for every project in the category,
   * because the index renders each row in the face of the work it points at.
   */
  const typography = useProjectTypography(useMemo(() => categoryProjects.map((project) => project.id), [categoryProjects]));
  // The open project's own face. The overview belongs to the category rather
  // than to any one project, so it stays in the interface face.
  const activeTypefaceId = typography.resolveTypefaceId(activeProject?.id ?? null);
  const activePagesPerRow = typography.resolvePagesPerRow(
    activeProject?.id ?? null,
    activeProject?.design?.pagesPerRow ?? 3
  );
  const activeAttachments = useMemo(() => activeProject && !isReaderLoading ? resolveProjectAttachments(activeProject, category) : [], [activeProject, category, isReaderLoading]);
  // Use the same authorized/visibility-filtered portal order as its index.
  // Scrolling never fetches another creator or exposes hidden projects.
  const portalVideos = useMemo(() => isMobile ? projects.filter(project => Boolean(project.attachments?.length)).flatMap(project => resolveProjectAttachments(project, category)
    .filter(attachment => attachment.kind === 'video')
    .map(attachment => ({ projectId: project.id, projectTitle: project.title, attachment }))) : [], [isMobile, projects, category]);
  useEffect(() => {
    if (!activeProject || isReaderLoading) return undefined;
    const activeIndex = projects.findIndex((project) => project.id === activeProject.id);
    const adjacentProjects = [projects[activeIndex - 1], projects[activeIndex + 1]]
      .filter((project): project is typeof activeProject => Boolean(project));
    const timer = window.setTimeout(() => {
      for (const project of adjacentProjects) {
        if (!project.attachments?.length) continue;
        preloadProjectMedia(resolveProjectAttachments(project, category), 3);
      }
    }, 160);
    return () => window.clearTimeout(timer);
  }, [activeProject, category, projects, isReaderLoading]);
  const processing = useAssetProcessing(activeAttachments);
  const [resolvedDocumentPageCounts, setResolvedDocumentPageCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    setResolvedDocumentPageCounts({});
  }, [activeProject?.id]);
  const handleDocumentPageCountResolved = useCallback((attachmentId: string, pageCount: number) => {
    const normalizedCount = Math.max(1, Math.floor(pageCount));
    setResolvedDocumentPageCounts((current) => current[attachmentId] === normalizedCount
      ? current
      : { ...current, [attachmentId]: normalizedCount });
  }, []);
  const activePageCount = useMemo(() => {
    if (!activeProject) {
      return null;
    }
    // Prefer the project's canonical count when publishing supplied one.
    if (typeof activeProject.pageCount === 'number' && activeProject.pageCount > 0) {
      return Math.max(1, Math.floor(activeProject.pageCount));
    }
    const documents = activeAttachments.filter((attachment) => attachment.kind === 'document');
    if (documents.length > 0) {
      const counts = documents.map((attachment) => Math.max(
        attachment.metadata?.renderedPages?.length ?? 0,
        attachment.metadata?.pageCount ?? 0,
        processing.statuses[attachment.id]?.pageCount ?? 0,
        resolvedDocumentPageCounts[attachment.id] ?? 0
      ));
      // A partial sum would look authoritative while omitting an unknown file.
      return counts.every((count) => count > 0)
        ? counts.reduce((total, count) => total + count, 0)
        : null;
    }
    // A pure image project reads as a sequence of pages. Images accompanying
    // audio, video, or models are artwork and must not be counted as pages.
    const hasNonPageMedia = activeAttachments.some((attachment) => attachment.kind !== 'image');
    if (!hasNonPageMedia) {
      const imageCount = activeAttachments.filter((attachment) => attachment.kind === 'image').length;
      return imageCount > 0 ? imageCount : null;
    }
    return null;
  }, [activeAttachments, activeProject, processing.statuses, resolvedDocumentPageCounts]);
  const [pageViewToggleRequest, setPageViewToggleRequest] = useState(0);
  const [isPageFocused, setIsPageFocused] = useState(false);
  const [isProjectFullscreen, setIsProjectFullscreen] = useState(false);
  const [pageLayoutDraft, setPageLayoutDraft] = useState(() => normalizePagesPerRow(activePagesPerRow));
  const [pendingPageLayoutSave, setPendingPageLayoutSave] = useState<{ projectId: string; pagesPerRow: number } | null>(null);
  // Confirmed values are keyed by project. A save for one project can therefore
  // never resolve after navigation and become the comparison value for another.
  const confirmedPagesPerRow = useRef(new Map<string, number>());
  useEffect(() => {
    const stored = normalizePagesPerRow(activePagesPerRow);
    setPageLayoutDraft(stored);
    if (activeProject && typography.savingProjectId !== activeProject.id) {
      confirmedPagesPerRow.current.set(activeProject.id, stored);
    }
  }, [activePagesPerRow, activeProject, typography.savingProjectId]);
  const commitPageLayout = useCallback((value: number) => {
    const next = normalizePagesPerRow(value);
    setPageLayoutDraft(next);
    // A public viewer controls only this local draft. Persisting the creator's
    // authored default remains an owner-only operation.
    if (!showsOwnerTools || !activeProject) {
      return;
    }
    if (confirmedPagesPerRow.current.get(activeProject.id) === next) {
      return;
    }
    // A pinch can finish while a previous design write is still in flight. Queue
    // the final value instead of dropping it; the effect below serializes it once
    // the project-design service is available again.
    setPendingPageLayoutSave({ projectId: activeProject.id, pagesPerRow: next });
  }, [activeProject, showsOwnerTools]);
  useEffect(() => {
    if (!pendingPageLayoutSave) {
      return;
    }
    if (!showsOwnerTools || activeProject?.id !== pendingPageLayoutSave.projectId) {
      setPendingPageLayoutSave(null);
      return;
    }
    if (typography.savingProjectId !== null) {
      return;
    }
    if (confirmedPagesPerRow.current.get(pendingPageLayoutSave.projectId) === pendingPageLayoutSave.pagesPerRow) {
      setPendingPageLayoutSave(null);
      return;
    }
    const pending = pendingPageLayoutSave;
    setPendingPageLayoutSave(null);
    void typography.setPagesPerRow(pending.projectId, pending.pagesPerRow);
  }, [activeProject?.id, pendingPageLayoutSave, showsOwnerTools, typography.savingProjectId, typography.setPagesPerRow]);
  const projectTypefaceStack = getTypefaceStack(activeTypefaceId);
  // A row reads in the face of the project it points at.
  const projectTypefaceIds = useMemo(() => Object.fromEntries(categoryProjects.map((project) => [project.id, typography.resolveTypefaceId(project.id)])), [categoryProjects, typography]);
  const projectTypefaceStacks = useMemo(() => Object.fromEntries(categoryProjects.map((project) => [project.id, getTypefaceStack(projectTypefaceIds[project.id])])), [categoryProjects, projectTypefaceIds]);
  /**
   * WEB opens its first project in saved order. MOBILE keeps the unselected
   * portal popup open until the viewer chooses a project.
   *
   * Deliberately narrow: it fires only when nothing is selected, so a URL naming a
   * project that this category does not hold still reports that plainly instead of
   * being quietly corrected to different work.
   */
  const firstProjectId = projects[0]?.id ?? null;
  const currentRoute = useAppRoute();
  // Outgoing transition layers can retain an unselected category snapshot.
  // Only the live category destination may choose its initial project.
  const isCurrentCategory = (currentRoute.kind === 'category' || currentRoute.kind === 'sharedCategory')
    && currentRoute.profileId === profile.id && currentRoute.categoryId === category.id;
  useEffect(() => {
    if (!isMobile && isCurrentCategory && activeProjectId === null && firstProjectId) {
      onSelectProject(firstProjectId, true);
    }
    // Keyed to the category through its resolved order, so switching portals
    // re-initialises rather than carrying the previous portal's selection.
  }, [isCurrentCategory, isMobile, activeProjectId, firstProjectId, onSelectProject]);
  // Only the search box is local to this view now; the arrangement reloads
  // itself when the category changes.
  useEffect(() => {
    setQuery('');
    setMobileSort('recent');
    setMobileLayout('list');
  }, [category.id]);
  useEffect(() => {
    const syncFullscreenState = () => {
      setIsProjectFullscreen(document.fullscreenElement === projectPresentationRef.current);
    };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, [projectPresentationRef]);
  const togglePageView = useCallback(() => {
    if (!sharedReadOnly && isPageFocused && activePageCount && activePageCount > 1) {
      setPageLayoutDraft(Math.min(4, activePageCount));
    }
    setPageViewToggleRequest((request) => request + 1);
  }, [activePageCount, isPageFocused, sharedReadOnly]);
  const toggleProjectFullscreen = useCallback(async () => {
    const presentation = projectPresentationRef.current;
    if (!presentation) return;
    try {
      if (document.fullscreenElement === presentation) {
        await document.exitFullscreen();
      } else if (presentation.requestFullscreen) {
        await presentation.requestFullscreen();
      }
    } catch {
      // Fullscreen permission is controlled by the browser. The fitted viewer
      // remains fully usable when a browser declines the presentation request.
    }
  }, [projectPresentationRef]);
  // A selection that names something this category does not hold. Deliberately
  // NOT auto-corrected: this page used to open `projects[0]` whenever the
  // selection was empty or unresolvable, which meant closing a project
  // immediately reopened another one and a deleted or wrong-category id silently
  // presented different work under the requested one. The category shows what
  // happened and the viewer chooses.
  const panelLayout = mobileProjectView ? {
    indexWidth: 320, responseWidth: mobilePanel === 'response' ? 320 : 52,
    indexOpen: mobilePanel === 'index', responseOpen: mobilePanel === 'response', singlePanel: null,
  } : allocateProjectPanels(workspace.width, !preferredIndexCollapsed, responseWanted,
    projectIndexWidth.preferredWidth, responseRailWidth.preferredWidth, sharedReadOnly ? 240 : 304,
    lastOpened, compactPanel, Boolean(activeProject), mobileIndexOnly);
  const isIndexCollapsed = !panelLayout.indexOpen;
  useEffect(() => {
    onMobileIndexOpenChange?.(mobileProjectView && !isIndexCollapsed);
    return () => onMobileIndexOpenChange?.(false);
  }, [mobileProjectView, isIndexCollapsed, onMobileIndexOpenChange]);
  const isEngagementOpen = panelLayout.responseOpen;
  const isMissingSelection = activeProjectId !== null && activeProject === null;
  const projectIndexPanel = <div ref={projectIndexRef} data-resizable-panel="" data-project-index-panel="" data-collapsed={isIndexCollapsed} data-shared-navigation-panel={sharedReadOnly ? '' : undefined} style={{ width: `${panelLayout.indexWidth}px`, display: panelLayout.indexWidth === 0 ? 'none' : undefined }} className={`ps-panel relative flex h-full shrink-0 flex-col border-r border-[var(--hairline)] bg-transparent transition-[width] duration-[var(--m-base)] ease-[var(--m-enter)] ${isIndexCollapsed ? 'w-[52px]' : ''}`}>
        {/* A collapsed document rail keeps its expander in the global header.
           The open rail puts its complete toolbar there instead of reserving an
           empty, darker band above the controls. */}
        {onReturnToDiscovery && isIndexCollapsed ? <div data-shared-navigation-header={sharedReadOnly ? '' : undefined} className="global-control-header shrink-0 justify-center px-1.5">
            <button data-project-index-toggle="" data-structural-toggle="" data-borderless-control="" type="button" onClick={() => onIndexCollapsedChange(false)} aria-label="Expand document list" aria-expanded={false} className="side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] bg-transparent text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-transparent hover:text-[var(--control-hover-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:bg-transparent">
              <PanelLeftOpenIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div> : null}
        {/* The way back to the home surface this project was chosen from. It sits above
           the portal's own title because it leaves the portal entirely, rather
           than changing anything inside it — and it is absent unless the viewer
           actually arrived from the home surface. */}
        {onReturnToDiscovery && !mobileProjectView && <ScreenBack><div data-project-index-back="" className={`flex shrink-0 items-center pt-2 ${isIndexCollapsed ? 'justify-center px-1.5' : 'side-panel-content-inset'}`}>
            <button data-ui-shape={isIndexCollapsed ? "icon" : "action"} data-control-size={isIndexCollapsed ? "sm" : "md"} type="button" onClick={onReturnToDiscovery} aria-label="Back to home" title="Back to home" className={`side-panel-primary-control flex items-center text-[13px] font-semibold text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--control-hover-surface)] hover:text-[var(--control-hover-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isIndexCollapsed ? 'w-10 justify-center' : 'gap-1.5 pl-1.5 pr-2.5'}`}>
              <InterfaceIcon icon={ChevronLeftIcon} weight="medium" mirroredInRtl />
              {!isIndexCollapsed && 'Back to home'}
            </button>
          </div></ScreenBack>}

        {isIndexCollapsed ? !onReturnToDiscovery && <div data-shared-navigation-header={sharedReadOnly ? '' : undefined} className="global-control-header shrink-0 justify-center px-1.5">
            <button data-project-index-toggle="" data-structural-toggle="" data-borderless-control="" type="button" onClick={() => onIndexCollapsedChange(false)} aria-label="Expand document list" aria-expanded={false} className="side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] bg-transparent text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-transparent hover:text-[var(--control-hover-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:bg-transparent">
              <PanelLeftOpenIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div> : isMobile ? <MobilePortalProjectToolbar category={category} onBack={onBackToPortals} onCreate={showsOwnerTools ? onCreateProject : undefined} sharedReadOnly={sharedReadOnly} browsingControls
            layout={mobileLayout} onLayout={setMobileLayout} sort={mobileSort} onSort={setMobileSort} /> : <header data-shared-navigation-header={sharedReadOnly ? '' : undefined} className="ps-panel-toolbar global-control-header order-first shrink-0">
            {mobileProjectView && <div className="mobile-portal-projects-back side-panel-control-row side-panel-content-inset">
              <button data-ui-shape="icon" data-control-size="sm" type="button" onClick={onBackToPortals} aria-label={sharedReadOnly ? 'Back to profile' : 'Back to portals'} title={sharedReadOnly ? 'Back to profile' : 'Back to portals'} className="side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--control-hover-surface)] hover:text-[var(--control-hover-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
                <InterfaceIcon icon={ChevronLeftIcon} weight="medium" mirroredInRtl />
              </button>
              <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{category.label}</h2>
            </div>}
            <div data-project-index-toolbar="" data-viewer-page-layout={!sharedReadOnly && !showsOwnerTools ? '' : undefined} data-shared-navigation-row={sharedReadOnly ? '' : undefined} className="side-panel-control-row side-panel-content-inset h-full min-w-0 flex-1">
              {mobileIndexOnly ? <>
                <button data-ui-shape="icon" data-control-size="sm" type="button" onClick={onBackToPortals} aria-label={sharedReadOnly ? 'Back to profile' : 'Back to portals'} title={sharedReadOnly ? 'Back to profile' : 'Back to portals'} className="side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--control-hover-surface)] hover:text-[var(--control-hover-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  <InterfaceIcon icon={ChevronLeftIcon} weight="medium" mirroredInRtl />
                </button>
                <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{category.label}</h1>
              </> : <button data-project-index-toggle="" data-structural-toggle="" data-borderless-control="" type="button" onClick={() => onIndexCollapsedChange(true)} aria-label="Collapse document list" aria-expanded={true} className="side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] bg-transparent text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-transparent hover:text-[var(--control-hover-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:bg-transparent">
                {mobileProjectView ? <InterfaceIcon icon={PanelLeftCloseIcon} weight="medium" mirroredInRtl /> : <PanelLeftCloseIcon className="h-[18px] w-[18px]" aria-hidden="true" />}
              </button>}
              {/* Page totals belong in project information, not the toolbar.
                 Keep the remaining controls aligned with the adjacent rails. */}
              {!mobileIndexOnly && <span aria-hidden="true" className="min-w-0 flex-1" />}
              {!sharedReadOnly && activePageCount !== null && activePageCount > 1 && <ProjectPagesPerRowControl value={pageLayoutDraft}
                onChange={setPageLayoutDraft} onCommit={showsOwnerTools ? commitPageLayout : undefined}
                saving={showsOwnerTools && typography.savingProjectId === activeProject?.id} />}
              {sharedReadOnly && activePageCount !== null && activePageCount > 1 && <button data-shared-viewer-control="overview" data-borderless-control="" type="button" onClick={togglePageView} aria-label={isPageFocused ? 'Open page overview' : 'Return to selected page'} className="side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] bg-transparent text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-transparent hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:bg-transparent">
                  <InterfaceIcon icon={isPageFocused ? Grid2X2Icon : SquareIcon} weight="medium" />
                </button>}
              {sharedReadOnly && <button data-shared-viewer-control="fullscreen" data-borderless-control="" type="button" onClick={() => void toggleProjectFullscreen()} aria-label={isProjectFullscreen ? 'Exit fullscreen presentation' : 'Open fullscreen presentation'} aria-pressed={isProjectFullscreen} className="side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] bg-transparent text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-transparent hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:bg-transparent">
                  <InterfaceIcon icon={isProjectFullscreen ? Minimize2Icon : Maximize2Icon} weight="medium" />
                </button>}
              {showsOwnerTools && onCreateProject && <button data-ui-shape="icon" data-control-size="sm" type="button" onClick={onCreateProject} aria-label={`Add a new project to ${category.label}`} title="New project" className="side-panel-header-control side-panel-header-icon flex shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--control-hover-surface)] hover:text-[var(--control-hover-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  <InterfaceIcon icon={FilePlusIcon} size="lg" />
                </button>}
            </div>
          </header>}

        {/* The notice surface is gone with the controls that fed it: every owner
           action here now reports its own real outcome. */}

        {/* Arrangement states are owner-only, because only the owner can arrange.
           A reader is never shown machinery for something they cannot do. */}
        {!isIndexCollapsed && showsOwnerTools && arrangement.loadError && <div role="alert" className="mx-2 mb-2 rounded-[10px] border border-[var(--status-danger)]/40 bg-[var(--surface-sunken)] px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-small text-[var(--text-primary)]">
              <AlertCircleIcon className="h-3.5 w-3.5 shrink-0 text-[var(--status-danger)]" aria-hidden="true" />
              <span>{arrangement.loadError} Showing this category in its own order.</span>
            </p>
            <button data-ui-shape="action" data-control-size="md" type="button" onClick={arrangement.reload} className="mt-1.5 w-full rounded-[8px] border border-[var(--border-default)] text-small font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              Try again
            </button>
          </div>}

        {/* A rejected change has already been rolled back, so the index shows the
           arrangement that actually holds. */}
        {!isIndexCollapsed && showsOwnerTools && arrangement.saveError && <div role="alert" className="mx-2 mb-2 rounded-[10px] border border-[var(--status-danger)]/40 bg-[var(--surface-sunken)] px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-small text-[var(--text-primary)]">
              <AlertCircleIcon className="h-3.5 w-3.5 shrink-0 text-[var(--status-danger)]" aria-hidden="true" />
              <span>{arrangement.saveError}</span>
            </p>
            <div className="mt-1.5 flex gap-1.5">
              {arrangement.retrySave && <button data-ui-shape="action" data-control-size="md" type="button" onClick={arrangement.retrySave} className="flex-1 rounded-[8px] border border-[var(--border-default)] text-small font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  Try again
                </button>}
              <button data-ui-shape="action" data-control-size="md" type="button" onClick={arrangement.dismissSaveError} className="flex-1 rounded-[8px] border border-[var(--border-default)] text-small font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                Dismiss
              </button>
            </div>
          </div>}

        {/* Typography states are owner-only for the same reason: only the owner
           can set a project's face. A failed read is reported because the index
           and the open project are then reading in the interface face rather
           than the face the work was published in. */}
        {!isIndexCollapsed && showsOwnerTools && typography.loadError && <div role="alert" className="mx-2 mb-2 rounded-[10px] border border-[var(--status-danger)]/40 bg-[var(--surface-sunken)] px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-small text-[var(--text-primary)]">
              <AlertCircleIcon className="h-3.5 w-3.5 shrink-0 text-[var(--status-danger)]" aria-hidden="true" />
              <span>{typography.loadError} Showing this work in the interface face.</span>
            </p>
            <button data-ui-shape="action" data-control-size="md" type="button" onClick={typography.reload} className="mt-1.5 w-full rounded-[8px] border border-[var(--border-default)] text-small font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              Try again
            </button>
          </div>}

        {/* A refused face has already been restored to the last one the store
           confirmed, so what is on screen is what actually holds. */}
        {!isIndexCollapsed && showsOwnerTools && typography.saveError && <div role="alert" className="mx-2 mb-2 rounded-[10px] border border-[var(--status-danger)]/40 bg-[var(--surface-sunken)] px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-small text-[var(--text-primary)]">
              <AlertCircleIcon className="h-3.5 w-3.5 shrink-0 text-[var(--status-danger)]" aria-hidden="true" />
              <span>{typography.saveError}</span>
            </p>
            <div className="mt-1.5 flex gap-1.5">
              {typography.retrySave && <button data-ui-shape="action" data-control-size="md" type="button" onClick={typography.retrySave} className="flex-1 rounded-[8px] border border-[var(--border-default)] text-small font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  Try again
                </button>}
              <button data-ui-shape="action" data-control-size="md" type="button" onClick={typography.dismissSaveError} className="flex-1 rounded-[8px] border border-[var(--border-default)] text-small font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                Dismiss
              </button>
            </div>
          </div>}

        {/* Filters the index that is already loaded. It reaches no service, so it
           cannot disagree with what the rows show. */}
        {!isIndexCollapsed && !isMobile && <div className="project-index-search side-panel-control-stack side-panel-content-inset shrink-0">
            <div data-ui-shape="field" className="text-control-shell side-panel-primary-control group flex items-center gap-2.5 px-3">
              <InterfaceIcon icon={SearchIcon} size="sm" weight="medium" className="text-[var(--text-tertiary)]" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" aria-label={`Search projects in ${category.label}`} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] leading-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
            </div>
          </div>}

        {!isIndexCollapsed && <nav data-project-index-list="" aria-label={`${category.label} index`} className="side-panel-content-inset scrollbar-hidden min-h-0 flex-1 overflow-y-auto pb-4">
            {showsOwnerTools && <SavedChangeNotice history={arrangement.history} />}
            {mobileIndexOnly && !showsOwnerTools && (arrangement.isLoading || arrangement.loadError) && (
              arrangement.isLoading ? <LoadingState label="Loading projects…" />
                : <ErrorState title="Projects could not be loaded" description={arrangement.loadError ?? undefined} onRetry={arrangement.reload} />
            )}
            <ProjectIndexList arrangementWriteDisabled={arrangement.isLoading || Boolean(arrangement.loadError) || arrangement.isSaving} onChangeCover={showsOwnerTools ? projectId => management.editor.open(projectId, 'files') : undefined} profileId={profile.id} sharedReadOnly={sharedReadOnly} mobileLayout={mobileLayout} mobileReorderFromMenu={isMobile} projects={visibleProjects} typefaceStacks={projectTypefaceStacks} typefaceIds={projectTypefaceIds} hiddenIds={showsOwnerTools ? arrangement.hiddenIds : []} pinnedIds={arrangement.pinnedIds} isOwner={showsOwnerTools} mobileReorderDisabled={arrangement.isLoading || Boolean(arrangement.loadError) || arrangement.isSaving || Boolean(indexQuery.trim()) || (isMobile && mobileSort !== 'saved')} activeProjectId={activeProjectId} onReorder={(reordered) => arrangement.reorder(reordered.map((project) => project.id))} onToggleHidden={arrangement.toggleHidden} onTogglePinned={arrangement.togglePinned} onSelect={onSelectProject} onEdit={showsOwnerTools ? management.editor.open : undefined} onTypefaceChange={showsOwnerTools ? (projectId, typefaceId) => void typography.setTypeface(projectId, typefaceId) : undefined} onDelete={showsOwnerTools ? management.deletion.request : undefined} />
            {/* Nothing matched, said plainly rather than leaving an empty column. */}
            {mobileIndexOnly && !arrangement.isLoading && !arrangement.loadError && projects.length === 0 && !indexQuery.trim() && <EmptyState title={`No projects in ${category.label}`} description={showsOwnerTools ? 'Choose Add project to publish the first one.' : 'No work has been published in this category.'} />}
            {!arrangement.isLoading && !arrangement.loadError && indexQuery.trim() && visibleProjects.length === 0 && <p className="px-2.5 py-6 text-[13px] leading-relaxed text-[var(--text-secondary)]">No work in {category.label} matches “{query.trim()}”.</p>}

          </nav>}
        {!sharedReadOnly && !mobileProjectView && !isIndexCollapsed && !panelLayout.singlePanel && <ResizablePanelHandle side="right" value={panelLayout.indexWidth} min={220} max={420} onResize={(width) => { setLastOpened('index'); projectIndexWidth.updateWidth(width); }} onResizeEnd={projectIndexWidth.commitWidth} onReset={projectIndexWidth.resetWidth} label="Resize project navigation. Double-click to restore the default width." />}
      </div>;

  return <div ref={projectPresentationRef} data-saved-change-scope="" data-project-presentation="" data-web-reader-spacing={!isMobile && !sharedReadOnly ? '' : undefined} data-mobile-project-view={mobileProjectView ? '' : undefined} className="relative flex h-full w-full bg-transparent">
      {!sharedReadOnly && mobileProjectView && isIndexCollapsed && !isPageFocused && activeAttachments.some(attachment => attachment.kind === 'image' || attachment.kind === 'document') && <MobileProjectGestureHint />}
      {mobileProjectView && isIndexCollapsed && !isPageFocused && <>
        <button type="button" onClick={onBack} aria-label="Go back" title="Go back" className="mobile-project-back">
          <InterfaceIcon icon={ChevronLeftIcon} weight="medium" mirroredInRtl />
        </button>

      </>}
      {mobileIndexOnly ? <MobileProjectIndexPortal anchorRef={projectPresentationRef}>
        <button type="button" aria-label="Close project list" className="mobile-project-index-dismiss" onClick={onBackToPortals} />
        {projectIndexPanel}
      </MobileProjectIndexPortal> : (!mobileProjectView || !activeProject) && projectIndexPanel}

            {/* Owner-only surfaces. They act on the canonical record through the
             management boundary; the service refuses an unauthorised write on
             its own, because nothing offered here can be trusted by a backend. */}
            {showsOwnerTools && !(isMobile && management.editor.mode === 'description') && <ProjectEditorDialog management={management} />}
            {showsOwnerTools && deletingProject && <DeleteProjectDialog management={management} projectTitle={deletingProject.title} onDeleted={() => {
          // The record is gone, so this leaves the deleted project's URL and
          // returns to its category rather than rendering stale work.
          management.deletion.cancel();
          onSelectProject(null);
        }} />}
      {isReaderLoading ? <section data-project-reader-loading="" style={{ display: panelLayout.singlePanel === 'index' ? 'none' : undefined }} className="flex min-w-0 flex-1 items-center justify-center bg-transparent px-4" role="status" aria-live="polite" aria-label="Loading project">
        <span className="premium-media-loading-mark" aria-hidden="true" />
      </section> : !mobileIndexOnly && !showsOwnerTools && (arrangement.isLoading || arrangement.loadError) ? <section className="flex min-w-0 flex-1 items-center justify-center px-4" aria-label="Loading project">
        {arrangement.isLoading ? <LoadingState label="Loading projects…" /> : <RouteError kind="network" creatorHandle={profile.handle} onBack={onBack} onHome={() => window.location.assign('/')} onCreator={() => window.location.assign(`${sharedReadOnly ? '/share' : '/p'}/${encodeURIComponent(profile.id)}`)} />}
      </section> : activeProject ? <section style={{ display: panelLayout.singlePanel === 'index' ? 'none' : undefined }} className="flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent" aria-label={`${activeProject.title} files`}>
          {/* Presentation follows each file's own media kind, never this
           category's format. */}
          {/* Closing clears the selection, which the entry rule immediately
           resolves back to the portal's first project — the main area always
           shows work, and the index is what changes which. */}
          <ProjectMediaViewer creator={profile} videoSequence={mobileProjectView ? { scope: `${sharedReadOnly ? 'shared' : 'workspace'}:${profile.id}:${category.id}`, entries: portalVideos, onSelectProject: id => onSelectProject(id, true) } : undefined} mobileNavigation={mobileProjectView ? { index: projectIndexPanel, isIndexOpen: !isIndexCollapsed, onOpenIndex: () => onIndexCollapsedChange(false), onCloseIndex: () => onIndexCollapsedChange(true), onBack } : undefined} responseRailWidth={{ ...responseRailWidth, width: panelLayout.responseWidth, updateWidth: (width) => { setLastOpened('response'); responseRailWidth.updateWidth(width); } }} singlePanel={panelLayout.singlePanel} projectId={activeProject.id} projectTitle={activeProject.title} projectSummary={activeProject.summary} onDeleteProject={showsOwnerTools && !sharedReadOnly ? () => management.deletion.request(activeProject.id) : undefined} descriptionEditor={showsOwnerTools && !sharedReadOnly ? management.editor : undefined} publishedAt={activeProject.publishedAt} credits={activeProject.credits} pageCount={activePageCount} attachments={activeAttachments} contentTypefaceStack={projectTypefaceStack} pagesPerRow={pageLayoutDraft} savingPageLayout={showsOwnerTools && typography.savingProjectId === activeProject.id} onPagesPerRowChange={sharedReadOnly ? undefined : setPageLayoutDraft} onPagesPerRowCommit={showsOwnerTools ? commitPageLayout : undefined} pageViewToggleRequest={pageViewToggleRequest} onPageFocusModeChange={setIsPageFocused} processing={processing} onDocumentPageCountResolved={handleDocumentPageCountResolved} isRailOpen={isEngagementOpen} onRailOpenChange={onEngagementOpenChange} isOwner={showsOwnerTools} readOnlyShare={sharedReadOnly} onClose={() => onSelectProject(null)} />
        </section> : isMissingSelection ? <section style={{ display: panelLayout.singlePanel === 'index' ? 'none' : undefined }} className="flex min-w-0 flex-1 items-center justify-center bg-transparent px-6" aria-label="Project not found">
          <RouteError kind="not-found" creatorHandle={profile.handle} onBack={onBack} onHome={() => window.location.assign('/')} onCreator={() => window.location.assign(`${sharedReadOnly ? '/share' : '/p'}/${encodeURIComponent(profile.id)}`)} />
        </section> : <section style={{ display: panelLayout.singlePanel === 'index' ? 'none' : undefined }} className="flex min-w-0 flex-1 items-center justify-center bg-transparent px-6" aria-label={`${category.label} work`}>
          {/* A portal with no work yet. This is the only thing the main area shows
           besides a project — it is a statement, not a second way to pick one.
           While the first project is being resolved there is nothing to say, so
           nothing is shown rather than a flash of "nothing here yet". */}
          {projects.length === 0 && <div className="max-w-[420px] text-center">
              <h3 className="text-[17px] font-semibold leading-snug text-[var(--text-primary)]">No projects in {category.label}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                {showsOwnerTools ? 'Choose Add project to publish the first one.' : 'No work has been published in this category.'}
              </p>
              {showsOwnerTools && onCreateProject && <button data-ui-shape="action" data-control-size="md" type="button" onClick={onCreateProject} className="mt-4 flex h-9 items-center gap-1.5 rounded-full border border-[var(--hairline-strong)] px-3.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  <InterfaceIcon icon={ImagePlusIcon} size="md" />
                  Add project
                </button>}
            </div>}
        </section>}
    </div>;
}
/*
 * `CategoryOverview` and `OwnerCategoryControls` used to live here and rendered the
 * project grid in the main area. They were a SECOND navigation system for the same
 * choice the index already owns, so they are removed rather than hidden — a portal
 * shows one project, and the index picks it.
 */
