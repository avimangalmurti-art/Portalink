import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, ListIcon, XIcon } from 'lucide-react';
import type { Profile, Project } from '../types/domain';
import { usePresentation } from '../presentation/usePresentation';
import { ProjectMediaViewer } from '../components/media/ProjectMediaViewer';
import { useResizablePanelWidth } from '../components/ui/ResizablePanelHandle';
import { useAssetProcessing } from '../features/media/useAssetProcessing';
import { getTypefaceStack } from '../data/typefaces';
import { panelLayoutDefaults } from '../utils/panelLayoutDefaults';
import { InterfaceIcon } from '../components/ui/InterfaceIcon';
import { LoadingSkeleton } from '../components/ui/StateViews';
import { useElementSize } from '../hooks/useElementSize';
import { allocateProjectPanels, type ProjectPanel } from '../utils/projectPanelLayout';
import { ProjectIndexList } from '../components/profile/ProjectIndexList';
import { MobilePortalProjectToolbar } from '../components/profile/MobilePortalProjectToolbar';

/** Uses the canonical media viewer without importing owner workspace/editors. */
export function VisitorProjectPage({ profile, project, categoryId, loading = false, onBack, onBackToProfile, onSelect }: {
  profile: Profile; project: Project | null; categoryId?: string; loading?: boolean; onBack: () => void; onBackToProfile: () => void; onSelect: (id: string) => void;
}) {
  const isMobile = usePresentation() === 'mobile';
  const [indexOpen, setIndexOpen] = useState(!isMobile), [railOpen, setRailOpen] = useState(false);
  const [lastPanel, setLastPanel] = useState<ProjectPanel | null>(null);
  // WEB keeps the category's index mounted when selection changes. Media state
  // belongs to the selected project, including late document callbacks.
  const currentScope = useRef({ profileId: profile.id, projectId: project?.id ?? null });
  if (currentScope.current.profileId !== profile.id || currentScope.current.projectId !== (project?.id ?? null)) {
    currentScope.current = { profileId: profile.id, projectId: project?.id ?? null };
  }
  const readerScope = currentScope.current;
  const defaultPagesPerRow = project?.design?.pagesPerRow ?? 3;
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
  const workspace = useElementSize<HTMLDivElement>();
  const indexOpener = useRef<HTMLButtonElement>(null);
  const attachments = useMemo(() => project?.attachments ?? [], [project?.attachments]);
  const currentCategoryId = project?.categoryId ?? categoryId;
  const category = profile.categories.find(item => item.id === currentCategoryId);
  const categoryProjects = profile.projects.filter(item => item.categoryId === currentCategoryId && item.isPubliclyVisible !== false);
  const visibleProjects = isMobile || !indexQuery.trim() ? categoryProjects
    : categoryProjects.filter(item => item.title.toLocaleLowerCase().includes(indexQuery.trim().toLocaleLowerCase()));
  // Public readers use published metadata, without querying owner job tables.
  const processing = useAssetProcessing([]);
  const rail = useResizablePanelWidth({ id: 'shared-project-details-standard', defaultWidth: panelLayoutDefaults.sharedDetails, minWidth: 240, maxWidth: 440, viewportReserve: 420 });
  const pageCount = useMemo(() => {
    if (project?.pageCount && project.pageCount > 0) return project.pageCount;
    const documents = attachments.filter(item => item.kind === 'document');
    if (documents.length) {
      const counts = documents.map(item => Math.max(item.metadata?.pageCount ?? 0, item.metadata?.renderedPages?.length ?? 0,
        processing.statuses[item.id]?.pageCount ?? 0, resolvedCounts[item.id] ?? 0));
      return counts.every(count => count > 0) ? counts.reduce((sum, count) => sum + count, 0) : null;
    }
    return attachments.length > 0 && attachments.every(item => item.kind === 'image') ? attachments.length : null;
  }, [project?.pageCount, attachments, processing.statuses, resolvedCounts]);
  const resolvePageCount = useCallback((id: string, count: number) => updateReader(current => current.resolvedCounts[id] === count ? current
    : { ...current, resolvedCounts: { ...current.resolvedCounts, [id]: count } }), [updateReader]);
  const changeIndex = (open: boolean) => {
    setIndexOpen(open); setLastPanel(open ? 'index' : null);
    if (!open) requestAnimationFrame(() => indexOpener.current?.focus({ preventScroll: true }));
  };
  const layout = allocateProjectPanels(workspace.width, indexOpen, railOpen, 240, rail.preferredWidth, 240, lastPanel, lastPanel);
  const indexExpanded = isMobile ? indexOpen : layout.indexOpen;
  const index = <aside data-project-index-panel="" data-collapsed={!indexExpanded} data-shared-navigation-panel="" className="ps-panel relative flex h-full min-h-0 shrink-0 flex-col" style={isMobile ? undefined : { width: layout.indexWidth, display: layout.indexWidth === 0 ? 'none' : undefined }}>
    {isMobile && indexExpanded && category ? <MobilePortalProjectToolbar category={category} onBack={onBackToProfile} sharedReadOnly
      layout="list" onLayout={() => undefined} sort="saved" onSort={() => undefined} />
    : <header data-shared-navigation-header="" className={`global-control-header side-panel-control-row shrink-0 ${indexExpanded ? 'px-2' : 'justify-center'}`}>
      {indexExpanded && <span className="min-w-0 flex-1 truncate px-2">{category?.label ?? 'Projects'}</span>}
      <button ref={isMobile ? undefined : indexOpener} data-project-index-toggle="" type="button" data-ui-control="icon" data-control-size="md" data-control-variant="ghost"
        aria-label={indexExpanded ? 'Close project list' : 'Project list'} aria-expanded={indexExpanded} onClick={() => changeIndex(!indexExpanded)}><InterfaceIcon icon={indexExpanded ? XIcon : ListIcon} /></button>
    </header>}
    {indexExpanded && !isMobile && <div className="project-index-search side-panel-control-stack side-panel-content-inset shrink-0">
      <div className="text-control-shell side-panel-primary-control flex items-center px-3"><input type="search" value={indexQuery} onChange={event => setIndexQuery(event.target.value)}
        placeholder="Search projects" aria-label={`Search projects in ${category?.label ?? 'this portal'}`} className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" /></div>
    </div>}
    {indexExpanded && <nav data-project-index-list="" aria-label={`${category?.label ?? 'Project'} index`} className="side-panel-content-inset scrollbar-hidden min-h-0 flex-1 overflow-y-auto pb-4">
      <ProjectIndexList profileId={profile.id} projects={visibleProjects} typefaceStacks={Object.fromEntries(categoryProjects.map(item => [item.id, getTypefaceStack(item.design?.typefaceId ?? 'default')]))}
        typefaceIds={{}} hiddenIds={[]} pinnedIds={categoryProjects.filter(item => item.isPinned).map(item => item.id)} activeProjectId={project?.id ?? null} isOwner={false} sharedReadOnly
        onReorder={() => undefined} onToggleHidden={() => undefined} onTogglePinned={() => undefined}
        onSelect={id => { if (isMobile) changeIndex(false); onSelect(id); }} />
      {!visibleProjects.length && <p className="px-2.5 py-6 text-[13px] text-[var(--text-secondary)]">{categoryProjects.length ? `No projects match “${indexQuery.trim()}”.` : 'No published projects in this portal.'}</p>}
    </nav>}
  </aside>;
  return <div className="relative flex h-full min-h-0 w-full flex-col" data-shared-project-reader="" data-mobile-project-view={isMobile ? '' : undefined}>
    {!isMobile && <header className="global-control-header side-panel-control-row px-2"><button type="button" className="side-panel-primary-control px-3" onClick={onBack}>Back</button><span className="min-w-0 truncate px-2">{project?.title ?? category?.label ?? 'Projects'}</span></header>}
    {isMobile && !indexOpen && !focused && <>
      <button type="button" className="mobile-project-back" aria-label="Go back" onClick={onBack}><InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl /></button>
    </>}
    <div ref={workspace.ref} className="relative flex min-h-0 flex-1">
      {!isMobile && index}
      <section className="flex min-h-0 min-w-0 flex-1" style={{ display: !isMobile && layout.singlePanel === 'index' ? 'none' : undefined }} aria-label={project ? `${project.title} files` : `${category?.label ?? 'Portal'} work`}>
      {project ? <ProjectMediaViewer key={project.id} creator={profile} projectId={project.id} projectTitle={project.title} projectSummary={project.summary}
        publishedAt={project.publishedAt} credits={project.credits} attachments={attachments} pageCount={pageCount} onDocumentPageCountResolved={resolvePageCount}
        contentTypefaceStack={getTypefaceStack(project.design?.typefaceId ?? 'default')} pagesPerRow={pagesPerRow} onPagesPerRowChange={setPagesPerRow} onPageFocusModeChange={setFocused}
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
