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
import { useElementSize } from '../hooks/useElementSize';
import { allocateProjectPanels, type ProjectPanel } from '../utils/projectPanelLayout';
import { ProjectIndexList } from '../components/profile/ProjectIndexList';
import { MobilePortalProjectToolbar } from '../components/profile/MobilePortalProjectToolbar';

/** Uses the canonical media viewer without importing owner workspace/editors. */
export function VisitorProjectPage({ profile, project, onBack, onBackToProfile, onSelect }: {
  profile: Profile; project: Project; onBack: () => void; onBackToProfile: () => void; onSelect: (id: string) => void;
}) {
  const isMobile = usePresentation() === 'mobile';
  const [indexOpen, setIndexOpen] = useState(false), [railOpen, setRailOpen] = useState(false);
  const [lastPanel, setLastPanel] = useState<ProjectPanel | null>(null);
  const [focused, setFocused] = useState(false);
  const [resolvedCounts, setResolvedCounts] = useState<Record<string, number>>({});
  const [indexQuery, setIndexQuery] = useState('');
  const workspace = useElementSize<HTMLDivElement>();
  const indexOpener = useRef<HTMLButtonElement>(null);
  const attachments = useMemo(() => project.attachments ?? [], [project.attachments]);
  const category = profile.categories.find(item => item.id === project.categoryId);
  const categoryProjects = profile.projects.filter(item => item.categoryId === project.categoryId);
  const visibleProjects = isMobile || !indexQuery.trim() ? categoryProjects
    : categoryProjects.filter(item => item.title.toLocaleLowerCase().includes(indexQuery.trim().toLocaleLowerCase()));
  const processing = useAssetProcessing(attachments);
  const rail = useResizablePanelWidth({ id: 'shared-project-details-standard', defaultWidth: panelLayoutDefaults.sharedDetails, minWidth: 240, maxWidth: 440, viewportReserve: 420 });
  const pageCount = useMemo(() => {
    if (project.pageCount && project.pageCount > 0) return project.pageCount;
    const documents = attachments.filter(item => item.kind === 'document');
    if (documents.length) {
      const counts = documents.map(item => Math.max(item.metadata?.pageCount ?? 0, item.metadata?.renderedPages?.length ?? 0,
        processing.statuses[item.id]?.pageCount ?? 0, resolvedCounts[item.id] ?? 0));
      return counts.every(count => count > 0) ? counts.reduce((sum, count) => sum + count, 0) : null;
    }
    return attachments.length > 0 && attachments.every(item => item.kind === 'image') ? attachments.length : null;
  }, [project.pageCount, attachments, processing.statuses, resolvedCounts]);
  const resolvePageCount = useCallback((id: string, count: number) => setResolvedCounts(current => current[id] === count ? current : { ...current, [id]: count }), []);
  const changeIndex = (open: boolean) => {
    setIndexOpen(open); setLastPanel(open ? 'index' : null);
    if (!open) requestAnimationFrame(() => indexOpener.current?.focus({ preventScroll: true }));
  };
  const layout = allocateProjectPanels(workspace.width, indexOpen, railOpen, 240, rail.preferredWidth, 240, lastPanel, lastPanel);
  const indexExpanded = isMobile ? indexOpen : layout.indexOpen;
  const index = <aside data-project-index-panel="" data-collapsed={!indexExpanded} data-shared-navigation-panel="" className="ps-panel relative flex h-full min-h-0 shrink-0 flex-col" style={isMobile ? undefined : { width: layout.indexWidth, display: layout.indexWidth === 0 ? 'none' : undefined }}>
    {isMobile && indexExpanded && category ? <MobilePortalProjectToolbar category={category} onBack={onBackToProfile} sharedReadOnly
      layout="list" onLayout={() => undefined} sort="saved" onSort={() => undefined} pagesPerRow={project.design?.pagesPerRow ?? 3}
      canAdjustPages={false} savingPages={false} onPagesChange={() => undefined} onPagesCommit={() => undefined} />
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
        typefaceIds={{}} hiddenIds={[]} pinnedIds={categoryProjects.filter(item => item.isPinned).map(item => item.id)} activeProjectId={project.id} isOwner={false} sharedReadOnly
        onReorder={() => undefined} onToggleHidden={() => undefined} onTogglePinned={() => undefined}
        onSelect={id => { changeIndex(false); onSelect(id); }} />
      {!visibleProjects.length && <p className="px-2.5 py-6 text-[13px] text-[var(--text-secondary)]">No projects match “{indexQuery.trim()}”.</p>}
    </nav>}
  </aside>;
  return <div className="relative flex h-full min-h-0 w-full flex-col" data-shared-project-reader="" data-mobile-project-view={isMobile ? '' : undefined}>
    {!isMobile && <header className="global-control-header side-panel-control-row px-2"><button type="button" className="side-panel-primary-control px-3" onClick={onBack}>Back</button><span className="min-w-0 truncate px-2">{project.title}</span></header>}
    {isMobile && !indexOpen && !focused && <>
      <button type="button" className="mobile-project-back" aria-label="Go back" onClick={onBack}><InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl /></button>
      <button ref={indexOpener} type="button" data-project-index-toggle="" className="mobile-project-back mobile-project-portal-preview" aria-label="Project list" aria-expanded={false} onClick={() => changeIndex(true)}><InterfaceIcon icon={ListIcon} size="lg" /></button>
    </>}
    <div ref={workspace.ref} className="relative flex min-h-0 flex-1">
      {!isMobile && index}
      <section className="flex min-h-0 min-w-0 flex-1" style={{ display: !isMobile && layout.singlePanel === 'index' ? 'none' : undefined }} aria-label={`${project.title} files`}>
      <ProjectMediaViewer key={project.id} creator={profile} projectId={project.id} projectTitle={project.title} projectSummary={project.summary}
        publishedAt={project.publishedAt} credits={project.credits} attachments={attachments} pageCount={pageCount} onDocumentPageCountResolved={resolvePageCount}
        contentTypefaceStack={getTypefaceStack(project.design?.typefaceId ?? 'default')} pagesPerRow={project.design?.pagesPerRow ?? 3} onPageFocusModeChange={setFocused}
        processing={processing} responseRailWidth={{ ...rail, width: isMobile ? rail.width : layout.responseWidth }} singlePanel={isMobile ? null : layout.singlePanel}
        isRailOpen={isMobile ? railOpen : layout.responseOpen} onRailOpenChange={open => { setRailOpen(open); setLastPanel(open ? 'response' : null); }} readOnlyShare onClose={onBack}
        mobileNavigation={isMobile ? { index, isIndexOpen: indexOpen, onOpenIndex: () => changeIndex(true), onCloseIndex: () => changeIndex(false), onBack } : undefined} />
      </section>
    </div>
  </div>;
}
