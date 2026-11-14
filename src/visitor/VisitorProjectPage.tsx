import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, ListIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, SearchIcon, XIcon } from 'lucide-react';
import type { Profile, Project } from '../types/domain';
import { usePresentation } from '../presentation/usePresentation';
import { ProjectMediaViewer } from '../components/media/ProjectMediaViewer';
import { ProjectPagesPerRowControl } from '../components/media/ProjectPagesPerRowControl';
import { useResizablePanelWidth } from '../components/ui/ResizablePanelHandle';
import { useAssetProcessing } from '../features/media/useAssetProcessing';
import { getTypefaceStack } from '../data/typefaces';
import { panelLayoutDefaults } from '../utils/panelLayoutDefaults';
import { InterfaceIcon } from '../components/ui/InterfaceIcon';
import { LoadingSkeleton } from '../components/ui/StateViews';
import { useElementSize } from '../hooks/useElementSize';
import { allocateProjectPanels, type ProjectPanel } from '../utils/projectPanelLayout';
import { ProjectIndexList } from '../components/profile/ProjectIndexList';
import { MobilePortalProjectToolbar, type MobileProjectSort } from '../components/profile/MobilePortalProjectToolbar';
import { PortalLinkCopyButton } from '../components/profile/PortalLinkCopyButton';
import { sortPortalProjects, type PortalProjectBrowsing } from '../components/profile/portalProjectBrowsing';
import { DEFAULT_PAGES_PER_ROW, normalizePagesPerRow } from '../features/projects/pageLayout';
import '../components/profile/web-reader-spacing.css';
import { projectBelongsToPortal } from '../features/projects/projectPortals';

/** Uses the canonical media viewer without importing owner workspace/editors. */
export function VisitorProjectPage({ profile, project, categoryId, loading = false, pendingProjectId, onBack, onBackToProfile, onSelect, browsing, desktopNavigationStyle }: {
  profile: Profile; project: Project | null; categoryId?: string; loading?: boolean; pendingProjectId?: string; onBack: () => void; onBackToProfile: () => void; onSelect: (id: string) => void; browsing?: PortalProjectBrowsing;
  desktopNavigationStyle?: React.CSSProperties;
}) {
  const isMobile = usePresentation() === 'mobile';
  // WEB may keep confirmed index metadata while the selected media is loading.
  // It never becomes reader media or supplies unconfirmed attachment counts.
  const pendingProject = !isMobile && !profile.isPrivate && loading && !project && pendingProjectId && categoryId
    ? profile.projects.find(item => item.id === pendingProjectId && projectBelongsToPortal(item, categoryId) && item.isPubliclyVisible !== false) : undefined;
  const selectedProjectId = project?.id ?? pendingProject?.id ?? null;
  const [indexOpen, setIndexOpen] = useState(!isMobile), [railOpen, setRailOpen] = useState(false);
  const [lastPanel, setLastPanel] = useState<ProjectPanel | null>(null);
  // WEB keeps the category's index mounted when selection changes. Media state
  // belongs to the selected project, including late document callbacks.
  const currentScope = useRef({ profileId: profile.id, projectId: selectedProjectId });
  if (currentScope.current.profileId !== profile.id || currentScope.current.projectId !== selectedProjectId) {
    currentScope.current = { profileId: profile.id, projectId: selectedProjectId };
  }
  const readerScope = currentScope.current;
  const defaultPagesPerRow = normalizePagesPerRow((project ?? pendingProject)?.design?.pagesPerRow ?? DEFAULT_PAGES_PER_ROW);
  type ReaderState = { scope: typeof readerScope; focused: boolean; pagesPerRow: number; resolvedCounts: Record<string, number> };
  const [readerState, setReaderState] = useState<ReaderState>({ scope: readerScope, focused: false, pagesPerRow: defaultPagesPerRow, resolvedCounts: {} });
  const { focused, pagesPerRow, resolvedCounts } = readerState.scope === readerScope ? readerState
    : { focused: false, pagesPerRow: defaultPagesPerRow, resolvedCounts: {} as Record<string, number> };
  const updateReader = useCallback((update: (state: ReaderState) => ReaderState) => {
    setReaderState(current => currentScope.current !== readerScope ? current : update(current.scope === readerScope ? current
      : { scope: readerScope, focused: false, pagesPerRow: defaultPagesPerRow, resolvedCounts: {} }));
  }, [readerScope, defaultPagesPerRow]);
  const setFocused = useCallback((value: boolean) => updateReader(current => ({ ...current, focused: value })), [updateReader]);
  const setPagesPerRow = useCallback((value: number) => updateReader(current => ({ ...current, pagesPerRow: value })), [updateReader]);
  const [indexQuery, setIndexQuery] = useState('');
  const [localLayout, setLocalLayout] = useState<'list' | 'grid'>('list');
  const [localSort, setLocalSort] = useState<MobileProjectSort>('recent');
  const { layout: mobileLayout, sort: mobileSort, onLayout, onSort } = browsing ?? { layout: localLayout, sort: localSort, onLayout: setLocalLayout, onSort: setLocalSort };
  const workspace = useElementSize<HTMLDivElement>();
  const indexOpener = useRef<HTMLButtonElement>(null);
  const attachments = useMemo(() => project?.attachments ?? [], [project?.attachments]);
  const currentCategoryId = categoryId ?? project?.categoryId;
  const category = profile.categories.find(item => item.id === currentCategoryId);
  const categoryProjects = profile.projects.filter(item => projectBelongsToPortal(item, currentCategoryId) && item.isPubliclyVisible !== false);
  const visibleProjects = isMobile ? sortPortalProjects(categoryProjects, mobileSort) : !indexQuery.trim() ? categoryProjects
    : categoryProjects.filter(item => item.title.toLocaleLowerCase().includes(indexQuery.trim().toLocaleLowerCase()));
  // Public readers use published metadata, without querying owner job tables.
  const processing = useAssetProcessing([]);
  const rail = useResizablePanelWidth({ id: 'shared-project-details-standard', defaultWidth: panelLayoutDefaults.sharedDetails, minWidth: 240, maxWidth: 440, viewportReserve: 420 });
  const pageCount = useMemo(() => {
    if (pendingProject) {
      const count = pendingProject.pageCount;
      return typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : null;
    }
    if (project?.pageCount && project.pageCount > 0) return project.pageCount;
    const documents = attachments.filter(item => item.kind === 'document');
    if (documents.length) {
      const counts = documents.map(item => Math.max(item.metadata?.pageCount ?? 0, item.metadata?.renderedPages?.length ?? 0,
        processing.statuses[item.id]?.pageCount ?? 0, resolvedCounts[item.id] ?? 0));
      return counts.every(count => count > 0) ? counts.reduce((sum, count) => sum + count, 0) : null;
    }
    return attachments.length > 0 && attachments.every(item => item.kind === 'image') ? attachments.length : null;
  }, [project?.pageCount, pendingProject, attachments, processing.statuses, resolvedCounts]);
  const resolvePageCount = useCallback((id: string, count: number) => updateReader(current => current.resolvedCounts[id] === count ? current
    : { ...current, resolvedCounts: { ...current.resolvedCounts, [id]: count } }), [updateReader]);
  const changeIndex = (open: boolean) => {
    setIndexOpen(open); setLastPanel(open ? 'index' : null);
    if (!open) requestAnimationFrame(() => indexOpener.current?.focus({ preventScroll: true }));
  };
  const layout = allocateProjectPanels(workspace.width, indexOpen, railOpen, 240, rail.preferredWidth, 240, lastPanel, lastPanel);
  const indexExpanded = isMobile ? indexOpen : layout.indexOpen;
  const webBack = <button type="button" data-ui-control="icon" data-control-size="md" data-control-variant="ghost"
    className="side-panel-header-control side-panel-header-icon" aria-label="Back" title="Back" onClick={onBack}>
    <InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl />
  </button>;
  const index = <aside data-project-index-panel="" data-collapsed={!indexExpanded} data-shared-navigation-panel="" className="ps-panel relative flex h-full min-h-0 shrink-0 flex-col" style={isMobile ? undefined : { ...desktopNavigationStyle, width: layout.indexWidth, display: layout.indexWidth === 0 ? 'none' : undefined }}>
    {!isMobile ? <header data-shared-navigation-header="" className="ps-panel-toolbar global-control-header shrink-0">
      <div data-project-index-toolbar="" data-shared-navigation-row="" className={`side-panel-control-row h-full min-w-0 flex-1 ${indexExpanded ? 'side-panel-content-inset' : 'justify-center'}`}>
        {indexExpanded && webBack}
        <button ref={indexOpener} data-project-index-toggle="" data-structural-toggle="" data-ui-control="icon" data-control-size="md" data-control-variant="ghost"
          className="side-panel-header-control side-panel-header-icon" type="button"
          aria-label={indexExpanded ? 'Close project list' : 'Project list'} aria-expanded={indexExpanded} onClick={() => changeIndex(!indexExpanded)}>
          <InterfaceIcon icon={indexExpanded ? PanelLeftCloseIcon : PanelLeftOpenIcon} mirroredInRtl />
        </button>
        {indexExpanded && <span aria-hidden="true" className="min-w-0 flex-1" />}
        {indexExpanded && pageCount !== null && pageCount > 1 && <ProjectPagesPerRowControl value={pagesPerRow} onChange={setPagesPerRow} />}
      </div>
    </header> : indexExpanded && category ? <MobilePortalProjectToolbar category={category} onBack={onBackToProfile} sharedReadOnly browsingControls
      layout={mobileLayout} onLayout={onLayout} sort={mobileSort} onSort={onSort} publicProfileId={profile.isPrivate ? undefined : profile.id} />
    : <header data-shared-navigation-header="" className={`global-control-header side-panel-control-row shrink-0 ${indexExpanded ? 'px-2' : 'justify-center'}`}>
      {indexExpanded && <span className="min-w-0 flex-1 truncate px-2">{category?.label ?? 'Projects'}</span>}
      <button data-project-index-toggle="" type="button" data-ui-control="icon" data-control-size="md" data-control-variant="ghost"
        aria-label={indexExpanded ? 'Close project list' : 'Project list'} aria-expanded={indexExpanded} onClick={() => changeIndex(!indexExpanded)}><InterfaceIcon icon={indexExpanded ? XIcon : ListIcon} /></button>
    </header>}
    {!isMobile && !indexExpanded && <div data-project-index-back="" className="side-panel-control-row shrink-0 justify-center">{webBack}</div>}
    {indexExpanded && !isMobile && <div className="project-index-search side-panel-control-stack side-panel-content-inset shrink-0">
      <div className="flex min-w-0 items-center gap-2">
        <div data-ui-shape="field" className="text-control-shell side-panel-primary-control group flex min-w-0 flex-1 items-center gap-2.5 px-3">
          <InterfaceIcon icon={SearchIcon} size="sm" weight="medium" className="text-[var(--text-tertiary)]" />
          <input type="search" value={indexQuery} onChange={event => setIndexQuery(event.target.value)}
            placeholder="Search projects" aria-label={`Search projects in ${category?.label ?? 'this portal'}`} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] leading-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
        </div>
        {category && !profile.isPrivate && <PortalLinkCopyButton key={`${profile.id}:${category.id}`} profileId={profile.id} categoryId={category.id} compact />}
      </div>
    </div>}
    {indexExpanded && <nav data-project-index-list="" aria-label={`${category?.label ?? 'Project'} index`} className="side-panel-content-inset scrollbar-hidden min-h-0 flex-1 overflow-y-auto pb-4">
      <ProjectIndexList profileId={profile.id} projects={visibleProjects} mobileLayout={mobileLayout} typefaceStacks={Object.fromEntries(categoryProjects.map(item => [item.id, getTypefaceStack(item.design?.typefaceId ?? 'default')]))}
        typefaceIds={{}} hiddenIds={[]} pinnedIds={categoryProjects.filter(item => item.categoryId === currentCategoryId && item.isPinned).map(item => item.id)} activeProjectId={selectedProjectId} isOwner={false} sharedReadOnly
        onReorder={() => undefined} onToggleHidden={() => undefined} onTogglePinned={() => undefined}
        onSelect={id => { if (isMobile) changeIndex(false); onSelect(id); }} />
      {!visibleProjects.length && <p className="px-2.5 py-6 text-[13px] text-[var(--text-secondary)]">{categoryProjects.length ? `No projects match “${indexQuery.trim()}”.` : 'No published projects in this portal.'}</p>}
    </nav>}
  </aside>;
  return <div className="relative flex h-full min-h-0 w-full flex-col" data-shared-project-reader="" data-web-reader-spacing={!isMobile ? '' : undefined} data-mobile-project-view={isMobile ? '' : undefined}>
    {isMobile && !indexOpen && !focused && <>
      <button type="button" className="mobile-project-back" aria-label="Go back" onClick={onBack}><InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl /></button>
    </>}
    <div ref={workspace.ref} className="relative flex min-h-0 flex-1">
      {!isMobile && index}
      <section className="flex min-h-0 min-w-0 flex-1" style={{ display: !isMobile && layout.singlePanel === 'index' ? 'none' : undefined }} aria-label={project ? `${project.title} files` : `${category?.label ?? 'Portal'} work`}>
      {project ? <ProjectMediaViewer key={project.id} creator={profile} projectId={project.id} primaryPortalId={project.categoryId} projectTitle={project.title} projectSummary={project.summary}
        publishedAt={project.publishedAt} credits={project.credits} attachments={attachments} pageCount={pageCount} onDocumentPageCountResolved={resolvePageCount}
        contentTypefaceStack={getTypefaceStack(project.design?.typefaceId ?? 'default')} pagesPerRow={pagesPerRow} onPagesPerRowChange={setPagesPerRow} onPageFocusModeChange={setFocused}
        sharedDesktopRailStyle={isMobile ? undefined : desktopNavigationStyle}
        processing={processing} responseRailWidth={{ ...rail, width: isMobile ? rail.width : layout.responseWidth }} singlePanel={isMobile ? null : layout.singlePanel}
        isRailOpen={isMobile ? railOpen : layout.responseOpen} onRailOpenChange={open => { setRailOpen(open); setLastPanel(open ? 'response' : null); }} isOwner={false} readOnlyShare onClose={onBack}
        mobileNavigation={isMobile ? { indexOpener, index, isIndexOpen: indexOpen, onOpenIndex: () => changeIndex(true), onCloseIndex: () => changeIndex(false), onBack } : undefined} />
        : loading ? <LoadingSkeleton kind="reader" label="Opening shared project…" />
        : <div className="flex min-w-0 flex-1 items-center justify-center px-6 text-center"><div className="max-w-[420px]">
          <h2 className="text-[17px] font-semibold leading-snug text-[var(--text-primary)]">No projects in {category?.label ?? 'this portal'}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">No work has been published in this portal.</p>
        </div></div>}
      </section>
    </div>
  </div>;
}
