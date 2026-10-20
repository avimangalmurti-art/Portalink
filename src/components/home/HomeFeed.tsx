import { DensitySeparator } from '../ui/DensitySeparator';
import { ExploreCategories } from './ExploreCategories';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildPath } from '../../app/routes';
import { Globe2Icon, HomeIcon, CircleUserRoundIcon, LayoutGridIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { useHomePullRefresh } from './useHomePullRefresh';
import { WeeklyReadNote } from '../../features/reads/WeeklyReadNote';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFeed } from '../../features/discovery/useFeed';
import { useMobileFeedRecovery } from '../../features/discovery/useMobileFeedRecovery';
import { ProjectFeedCard } from './ProjectFeedCard';
import { BentoFeedGrid } from './BentoFeedGrid';
import type { BentoCellItem } from './BentoFeedGrid';
import { JustifiedImageWall } from '../profile/JustifiedImageWall';
import { usePresentation } from '../../presentation/usePresentation';
import { useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';
import { getProjectAspectRatio } from '../../utils/projectPresentation';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';
import type { Id, ProjectLocation } from '../../types/domain';
import { useAuth } from '../../contexts/AuthContext';
import { useProfileGridLayout } from '../../features/profile/useProfileGridLayout';
import { useProjectGridDensity } from '../../features/profile/useProjectGridDensity';
import { useProjectManagement } from '../../features/projects/useProjectManagement';
import { DeferredDialog } from '../ui/DeferredDialog';
import { useHomeStartupReadiness } from './useHomeStartupReadiness';
import { useMobileFeedResume } from '../../presentation/mobile/useMobileFeedResume';

const ProjectEditorDialog = React.lazy(() => import('../../features/projects/ProjectEditorDialog').then(module => ({ default: module.ProjectEditorDialog })));
const DeleteProjectDialog = React.lazy(() => import('../../features/projects/ProjectEditorDialog').then(module => ({ default: module.DeleteProjectDialog })));

type HomeFeedProps = {
  /** Retained as part of the shell contract; the grid measures its real width. */
  isSidebarCollapsed: boolean;
  /** Navigation is by stable id: no project record is ever handed upward. */
  onOpenProject: (projectId: Id, location?: ProjectLocation) => void;
  onOpenCreator: (creatorId: Id) => void;
  /** Warms the creator record before navigation when pointer or focus shows intent. */
  onWarmCreator?: (creatorId: Id) => void;
  /** Separates Home, city, and any future feed scroll memories. */
  scrollMemoryKey?: string;
  /** Present only for a Portalink city surface; switches to location placement. */
  locationId?: Id;
  /** Marks Home for its contextual navigation and pull-to-refresh. */
  showSearchPlaceholder?: boolean;
  onExploreWorld?: () => void;
  onSearchUsers?: () => void;
  firstProjectAction?: () => void;
  emptyAction?: { label: string; onClick: () => void };
  emptySecondaryAction?: { label: string; onClick: () => void };
  emptyTitle?: string;
  emptyDescription?: string;
  startupPending?: boolean;
  startupAttempt?: number;
  onStartupReady?: (ready: boolean) => void;
};

const FEED_SCROLL_PREFIX = 'portalink.feedScroll.';

function readFeedScroll(key: string): number {
  try {
    const value = Number(window.sessionStorage.getItem(`${FEED_SCROLL_PREFIX}${key}`));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeFeedScroll(key: string, value: number): void {
  try {
    window.sessionStorage.setItem(`${FEED_SCROLL_PREFIX}${key}`, String(Math.max(0, Math.round(value))));
  } catch {
    // The current in-memory DOM position still works when storage is unavailable.
  }
}

/**
 * The signed-in viewer's relationship feed.
 *
 * Global discovery lives at `/portalink`; Home has one predictable job:
 * show every published project owned by the viewer or by a creator they follow.
 * The service decides eligibility. This component only deduplicates the
 * featured/project overlap in the response and presents the canonical records.
 */
export function HomeFeed({
  onOpenProject,
  onOpenCreator,
  onWarmCreator,
  scrollMemoryKey = 'home',
  locationId,
  showSearchPlaceholder = false,
  onExploreWorld,
  onSearchUsers,
  firstProjectAction,
  emptyAction,
  emptySecondaryAction,
  emptyTitle = 'Your Home feed is ready',
  emptyDescription = 'Public work from creators across Portalink will appear here.',
  startupPending = false,
  startupAttempt = 0,
  onStartupReady,
}: HomeFeedProps) {
  const isMobile = usePresentation() === 'mobile';
  const screenActive = useMobileScreenActive();
  // Retained screens must not move the active route's shared document.
  const canOwnScroll = !isMobile || screenActive;
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const showMobileSearch = isMobile && !locationId && showSearchPlaceholder;
  const feed = useFeed(locationId, { preserveSnapshotAcrossRevision: isMobile });
  const { viewerProfileId, isAuthenticated, user } = useAuth();
  const management = useProjectManagement(isAuthenticated ? viewerProfileId : null);
  const ownerLayout = useProfileGridLayout(locationId ? null : viewerProfileId);
  const density = useProjectGridDensity(ownerLayout.layout, !locationId && Boolean(viewerProfileId), 'home');
  const layoutReady = Boolean(locationId) || !viewerProfileId || ownerLayout.layout?.id === viewerProfileId;
  const layoutFailed = !layoutReady && (ownerLayout.status === 'error' || ownerLayout.status === 'ready');
  const loadFailed = layoutFailed || feed.status === 'error';
  const autoScrollRef = useRef<HTMLDivElement>(null);
  const [categoriesOpen,setCategoriesOpen]=useState(false);
  const [hasReloaded, setHasReloaded] = useState(false);
  const [locationGridWidth, setLocationGridWidth] = useState(0);
  const [locationGridChoice, setLocationGridChoice] = useState<number | null>(null);
  const hasRestoredScrollRef = useRef(false);
  const [scrollRestored, setScrollRestored] = useState(false);
  const [noteReadiness, setNoteReadiness] = useState<{ account: string | null; attempt: number; settled: boolean } | null>(null);
  const account = user?.id ?? null;
  const recoveryIdentity = useMemo(() => ({ account, locationId }), [account, locationId]);
  const cancelRecovery = useMobileFeedRecovery({ enabled: isMobile && screenActive && !categoriesOpen, identity: recoveryIdentity, feed });
  const { retry: requestFeedRetry, loadMore: requestMore } = feed;
  const retryFeed = useCallback(() => { cancelRecovery(); requestFeedRetry(); }, [cancelRecovery, requestFeedRetry]);
  const loadMoreFeed = useCallback(() => { cancelRecovery(); requestMore(); }, [cancelRecovery, requestMore]);
  const reportNoteReadiness = useCallback((settled: boolean) => setNoteReadiness(current => current?.account === account && current.attempt === startupAttempt && current.settled === settled ? current : { account, attempt: startupAttempt, settled }), [account, startupAttempt]);
  const previousStartupAttempt = useRef(startupAttempt);
  const latestScrollTopRef = useRef(readFeedScroll(scrollMemoryKey));
  const persistFrameRef = useRef(0);

  // City keeps its existing measured responsive baseline. Home fits in the wall itself.
  useLayoutEffect(() => {
    if (!isMobile || !locationId) return;
    const content = autoScrollRef.current?.querySelector<HTMLElement>('[data-feed-scroll-content]');
    if (!content) return;
    const measure = () => setLocationGridWidth(content.clientWidth);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(content);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [isMobile, locationId]);
  const locationColumns = locationGridChoice ?? (locationGridWidth > 0
    ? Math.max(2, Math.min(3, Math.floor((locationGridWidth + 4) / 154)))
    : 3);

  const projects = useMemo(() => {
    const ordered = feed.featured ? [feed.featured, ...feed.projects] : feed.projects;
    return Array.from(new Map(ordered.map((view) => [view.project.id, view])).values());
  }, [feed.featured, feed.projects]);
  const documentProjects = useMemo(() => new Set(projects.filter(view => view.project.cover && view.project.coverKind === 'document' && !view.project.coverThumbnail).map(view => view.project.id)), [projects]);
  const projectIds = useMemo(() => projects.map(view => view.project.id), [projects]);
  const feedPath = locationId ? `/portalink/${encodeURIComponent(locationId)}` : '/';
  const coldResume = useMobileFeedResume({ enabled: isMobile && canOwnScroll && !categoriesOpen && routeLocation.pathname === feedPath && !routeLocation.search && !routeLocation.hash,
    accountId: isAuthenticated ? user?.id ?? null : null, path: feedPath, host: autoScrollRef, projectIds, ready: feed.status === 'success' && layoutReady, saveReady: scrollRestored,
    failed: Boolean(feed.error || feed.refreshError || feed.loadMoreError), busy: feed.isLoadingMore || feed.isRefreshing, nextCursor: feed.nextCursor, loadMore: requestMore });
  const firstProjectHome = isMobile && Boolean(firstProjectAction) && projects.length === 0;
  const retryLayout = ownerLayout.retry;
  useEffect(() => {
    if (startupPending && !locationId && previousStartupAttempt.current !== startupAttempt) {
      retryFeed(); retryLayout();
    }
    previousStartupAttempt.current = startupAttempt;
  }, [startupPending, startupAttempt, locationId, retryFeed, retryLayout]);
  useHomeStartupReadiness({
    enabled: startupPending && !locationId,
    attempt: startupAttempt,
    ref: autoScrollRef,
    settled: (firstProjectHome && feed.status === 'success') || (feed.status === 'success' && layoutReady && scrollRestored && noteReadiness?.account === account && noteReadiness.attempt === startupAttempt && noteReadiness.settled),
    terminalError: feed.status === 'error' || (!firstProjectHome && layoutFailed),
    projectCount: firstProjectHome ? 0 : projects.length,
    documentProjects,
    onReady: onStartupReady,
  });

  const cells: BentoCellItem[] = projects.map((view, index) => ({
    key: view.project.id,
    content: <ProjectFeedCard
      view={view}
      management={isAuthenticated && viewerProfileId === view.creator.id ? management : undefined}
      onOpenProject={onOpenProject}
      onOpenCreator={onOpenCreator}
      onWarmCreator={onWarmCreator}
      priority={startupPending && !locationId ? scrollRestored ? 'viewport' : false : index < 2}
    />,
  }));

  useLayoutEffect(() => {
    hasRestoredScrollRef.current = false;
    setScrollRestored(false);
  }, [isMobile]);

  // MOBILE uses the document; WEB retains its contained feed. Restore the
  // real scroll surface once its cards exist, so Back lands
  // on the work the viewer left instead of quietly returning them to the top.
  useLayoutEffect(() => {
    if (isMobile && coldResume.handled) {
      hasRestoredScrollRef.current = !coldResume.restoring;
      setScrollRestored(!coldResume.restoring);
      return;
    }
    if (!canOwnScroll || !layoutReady || hasRestoredScrollRef.current || ((feed.status === 'idle' || feed.status === 'loading') && projects.length === 0)) {
      return undefined;
    }
    hasRestoredScrollRef.current = true;
    const target = latestScrollTopRef.current;
    let frame = 0;
    let attempts = 0;
    let completed = false;
    const restore = () => {
      const element = isMobile ? document.scrollingElement : autoScrollRef.current;
      if (!element) return;
      element.scrollTop = target;
      if (Math.abs(element.scrollTop - target) < 2 || attempts >= 30) { completed = true; setScrollRestored(true); return; }
      attempts += 1;
      frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    return () => { cancelAnimationFrame(frame); if (!completed) hasRestoredScrollRef.current = false; };
  }, [feed.status, projects.length, layoutReady, isMobile, canOwnScroll, coldResume.handled, coldResume.restoring]);

  useLayoutEffect(() => {
    if (!isMobile || !canOwnScroll) return;
    const remember = () => {
      if (!hasRestoredScrollRef.current || autoScrollRef.current?.closest('.screen-exit')) return;
      latestScrollTopRef.current = window.scrollY;
      writeFeedScroll(scrollMemoryKey, window.scrollY);
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [isMobile, scrollMemoryKey, canOwnScroll]);

  const rememberScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (!canOwnScroll) return;
    latestScrollTopRef.current = event.currentTarget.scrollTop;
    if (persistFrameRef.current) return;
    persistFrameRef.current = requestAnimationFrame(() => {
      persistFrameRef.current = 0;
      writeFeedScroll(scrollMemoryKey, latestScrollTopRef.current);
    });
  }, [scrollMemoryKey, canOwnScroll]);

  useLayoutEffect(() => () => {
    cancelAnimationFrame(persistFrameRef.current);
    writeFeedScroll(scrollMemoryKey, latestScrollTopRef.current);
  }, [scrollMemoryKey]);

  const {isRefreshing,status:feedStatus}=feed;
  const refreshHome=useCallback(()=>{if(isRefreshing||feedStatus==='loading')return;setHasReloaded(true);retryFeed();},[isRefreshing,feedStatus,retryFeed]);
  const pullLabel=useHomePullRefresh(autoScrollRef,showMobileSearch && !categoriesOpen && !(firstProjectAction && projects.length===0),feed.isRefreshing||feed.status==='loading',refreshHome);
  if(isMobile && categoriesOpen)return <ExploreCategories onBack={()=>setCategoriesOpen(false)}/>;
  if (isMobile && firstProjectAction && projects.length === 0) return <section className="first-project-home" aria-labelledby="first-project-home-title"><h2 id="first-project-home-title">Add your first project</h2><p>Start with something you’ve made.</p><button type="button" data-ui-control="button" data-control-variant="primary" data-control-size="lg" onClick={firstProjectAction}>Choose your work</button></section>;
  return <div data-mobile-home-search={showMobileSearch ? '' : undefined} data-feed-artwork-edge={!locationId && projects.length > 0 && feed.status !== 'error' ? '' : undefined} className="feed-starfield relative flex h-full w-full flex-col">
      <div
        ref={autoScrollRef}
        onScroll={rememberScroll}
        className="feed-edge-fade scrollbar-hidden relative z-10 min-h-0 flex-1 overflow-y-auto px-2 pb-7"
      >
        <div data-feed-scroll-content="" className="relative pt-3">
          {showMobileSearch && <header className="mobile-home-search-header"><div className="mobile-screen-action-row">
              {onExploreWorld && <button type="button" onClick={onExploreWorld} aria-label="Open globe search" className="mobile-home-header-button"><InterfaceIcon icon={Globe2Icon} weight="medium" /></button>}
              <button type="button" aria-label="Home" aria-current="page" data-selected="true" className="mobile-home-header-button" onClick={() => { navigate(buildPath('home')); window.scrollTo({top: 0}); autoScrollRef.current?.scrollTo({top: 0}); }}><InterfaceIcon icon={HomeIcon} weight="medium" /></button>
              {onSearchUsers && <button type="button" aria-label="Search accounts" title="Search accounts" className="mobile-home-header-button" onClick={onSearchUsers}><InterfaceIcon icon={CircleUserRoundIcon} weight="medium" /></button>}
              <button type="button" aria-label="Explore categories" className="mobile-home-header-button" onClick={()=>setCategoriesOpen(true)}><InterfaceIcon icon={LayoutGridIcon} weight="medium" /></button>
            </div>
            {(pullLabel || feed.isRefreshing) && <p data-home-pull-feedback="" role="status" className="flex items-center justify-center py-2 text-[13px] text-[var(--text-secondary)]">
              <span className="premium-media-loading-mark" aria-hidden="true" />
              <span className="sr-only">{feed.isRefreshing ? 'Refreshing Home content.' : pullLabel}</span>
            </p>}
            <p role="status" className={hasReloaded && (feed.isRefreshing || feed.refreshError) ? 'py-2 text-[13px] text-[var(--text-secondary)]' : 'sr-only'}>
              {feed.isRefreshing ? 'Refreshing Home content.' : hasReloaded ? feed.refreshError ?? (feed.status === 'error' ? 'Could not refresh Home. Please try again.' : 'Home content refreshed.') : ''}
            </p>
            {layoutReady && <DensitySeparator columns={density.columns} onChange={density.setColumns} onPreview={density.previewColumns} label="Home content per row" />}
          </header>}
          {!locationId && <WeeklyReadNote startupPending={startupPending} startupAttempt={startupAttempt} onStartupSettled={startupPending ? reportNoteReadiness : undefined} />}
          <section aria-labelledby="home-work-title">
            <h1 id="home-work-title" className="sr-only">Home</h1>
            {density.saveError && <p role="status" className="py-2 text-[13px] text-[var(--text-secondary)]">{density.saveError} <button type="button" onClick={() => { void density.retry(); }} className="text-[var(--accent-text)] underline">Retry layout save</button></p>}
            {!layoutReady && (layoutFailed
              ? <ErrorState title="Your Home layout could not be loaded" description={ownerLayout.error ?? undefined} onRetry={ownerLayout.retry} />
              : !loadFailed ? <LoadingState kind="grid" columns={density.columns} label="Loading your Home layout" /> : null)}
            {!loadFailed && feed.status === 'loading' && projects.length === 0
              ? <LoadingState kind="grid" columns={density.columns} label="Loading your Home feed" />
              : null}
            {feed.status === 'error'
              ? <ErrorState
                  title="Your Home feed could not be loaded"
                  description={feed.error ?? undefined}
                  onRetry={retryFeed}
                />
              : null}
            {feed.isEmpty
              ? <EmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                  action={emptyAction}
                  secondaryAction={emptySecondaryAction}
                />
              : null}
            {layoutReady && projects.length > 0 ? isMobile
              // Consecutive rows share Profile's sizing and preserve reading
              // order without repacking measured cards when this screen mounts.
              ? locationId ? <JustifiedImageWall
                  label="Home projects"
                  key={viewerProfileId ?? 'guest'}
                  columns={locationId ? locationColumns : density.columns}
                  onColumnsChange={locationId ? setLocationGridChoice : density.setColumns}
                  items={cells.map((cell, index) => ({
                    key: cell.key,
                    ratio: getProjectAspectRatio(projects[index].project),
                    content: cell.content,
                  }))}
                /> : <div data-home-grid="" className="min-w-0 px-2"><JustifiedImageWall
                  label="Home projects"
                  key={viewerProfileId ?? 'guest'}
                  columns={locationId ? locationColumns : density.columns}
                  onColumnsChange={locationId ? setLocationGridChoice : density.setColumns}
                  items={cells.map((cell, index) => ({
                    key: cell.key,
                    ratio: getProjectAspectRatio(projects[index].project),
                    content: cell.content,
                  }))}
                /></div>
              : <BentoFeedGrid key={viewerProfileId ?? 'guest'} items={cells} columns={locationId ? undefined : density.columns} onColumnsChange={locationId ? undefined : density.setColumns} />
              : null}
            {feed.nextCursor && <div className="flex flex-col items-center gap-2 py-5">
              {feed.loadMoreError && <p role="status" className="text-[13px] text-[var(--text-secondary)]">{feed.loadMoreError}</p>}
              <button type="button" className="min-h-11 rounded-full border border-[var(--border-subtle)] px-6 py-2 text-[var(--text-primary)] disabled:opacity-50"
                disabled={feed.isLoadingMore || feed.isRefreshing} aria-busy={feed.isLoadingMore} onClick={loadMoreFeed}>
                {feed.isLoadingMore ? 'Loading…' : feed.loadMoreError ? 'Retry loading more' : 'Load more'}
              </button>
            </div>}
          </section>
        </div>
      </div>
      {isAuthenticated && viewerProfileId && <DeferredDialog active={Boolean(management.editor.projectId)} onClose={management.editor.close}><ProjectEditorDialog management={management} /></DeferredDialog>}
      {isAuthenticated && viewerProfileId && management.deletion.projectId && <DeferredDialog active onClose={management.deletion.cancel}><DeleteProjectDialog management={management}
        projectTitle={projects.find(view => view.project.id === management.deletion.projectId)?.project.title ?? 'Project'}
        onDeleted={management.deletion.cancel} /></DeferredDialog>}
    </div>;
}
