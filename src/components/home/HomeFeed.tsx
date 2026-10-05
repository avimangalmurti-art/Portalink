import { WeeklyReadNote } from '../../features/reads/WeeklyReadNote';
import { MobileContextButton, useMobileScreenActions } from '../../presentation/mobile/MobileContextActions';
import { contextActions } from '../../presentation/mobile/contextActions';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFeed } from '../../features/discovery/useFeed';
import { ProjectFeedCard } from './ProjectFeedCard';
import { BentoFeedGrid } from './BentoFeedGrid';
import type { BentoCellItem } from './BentoFeedGrid';
import { JustifiedImageWall } from '../profile/JustifiedImageWall';
import { usePresentation } from '../../presentation/usePresentation';
import { getProjectAspectRatio } from '../../utils/projectPresentation';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';
import type { Id, ProjectLocation } from '../../types/domain';
import { Globe2Icon, RotateCwIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useProfileGridLayout } from '../../features/profile/useProfileGridLayout';
import { useProjectGridDensity } from '../../features/profile/useProjectGridDensity';

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
  /** Shows the mobile Home discovery and refresh entry. */
  showSearchPlaceholder?: boolean;
  onExploreWorld?: () => void;
  onSearchUsers?: () => void;
  firstProjectAction?: () => void;
  emptyAction?: { label: string; onClick: () => void };
  emptySecondaryAction?: { label: string; onClick: () => void };
  emptyTitle?: string;
  emptyDescription?: string;
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
}: HomeFeedProps) {
  const isMobile = usePresentation() === 'mobile';
  const showMobileSearch = isMobile && !locationId && showSearchPlaceholder;
  const feed = useFeed(locationId);
  const { viewerProfileId, isAuthenticated } = useAuth();
  const ownerLayout = useProfileGridLayout(locationId ? null : viewerProfileId);
  const density = useProjectGridDensity(ownerLayout.layout, !locationId && Boolean(viewerProfileId));
  const layoutReady = Boolean(locationId) || !viewerProfileId || ownerLayout.layout?.id === viewerProfileId;
  const autoScrollRef = useRef<HTMLDivElement>(null);
  const [hasReloaded, setHasReloaded] = useState(false);
  const [locationGridWidth, setLocationGridWidth] = useState(0);
  const [locationGridChoice, setLocationGridChoice] = useState<number | null>(null);
  const hasRestoredScrollRef = useRef(false);
  const latestScrollTopRef = useRef(readFeedScroll(scrollMemoryKey));
  const persistFrameRef = useRef(0);

  // City feeds keep their existing responsive reading size. Only Home/Profile
  // use the creator's exact saved density; a city pinch remains local.
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

  const cells: BentoCellItem[] = projects.map((view, index) => ({
    key: view.project.id,
    content: <ProjectFeedCard
      view={view}
      onOpenProject={onOpenProject}
      onOpenCreator={onOpenCreator}
      onWarmCreator={onWarmCreator}
      priority={index < 2}
    />,
  }));

  useLayoutEffect(() => {
    hasRestoredScrollRef.current = false;
  }, [isMobile]);

  // MOBILE uses the document; WEB retains its contained feed. Restore the
  // real scroll surface once its cards exist, so Back lands
  // on the work the viewer left instead of quietly returning them to the top.
  useLayoutEffect(() => {
    if (!layoutReady || hasRestoredScrollRef.current || (feed.status === 'loading' && projects.length === 0)) {
      return undefined;
    }
    hasRestoredScrollRef.current = true;
    const target = latestScrollTopRef.current;
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      const element = isMobile ? document.scrollingElement : autoScrollRef.current;
      if (!element) return;
      element.scrollTop = target;
      if (Math.abs(element.scrollTop - target) < 2 || attempts >= 30) return;
      attempts += 1;
      frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [feed.status, projects.length, layoutReady, isMobile]);

  useLayoutEffect(() => {
    if (!isMobile) return;
    const remember = () => {
      if (!hasRestoredScrollRef.current || autoScrollRef.current?.closest('.screen-exit')) return;
      latestScrollTopRef.current = window.scrollY;
      writeFeedScroll(scrollMemoryKey, window.scrollY);
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [isMobile, scrollMemoryKey]);

  const rememberScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    latestScrollTopRef.current = event.currentTarget.scrollTop;
    if (persistFrameRef.current) return;
    persistFrameRef.current = requestAnimationFrame(() => {
      persistFrameRef.current = 0;
      writeFeedScroll(scrollMemoryKey, latestScrollTopRef.current);
    });
  }, [scrollMemoryKey]);

  useLayoutEffect(() => () => {
    cancelAnimationFrame(persistFrameRef.current);
    writeFeedScroll(scrollMemoryKey, latestScrollTopRef.current);
  }, [scrollMemoryKey]);

  useMobileScreenActions(showSearchPlaceholder ? contextActions('home', { signedIn: isAuthenticated }, { handlers: {
    refresh: !feed.isRefreshing && feed.status !== 'loading' ? () => { setHasReloaded(true); feed.retry(); } : undefined,
  } }) : null, 5);
  if (isMobile && firstProjectAction && projects.length === 0) return <section className="first-project-home" aria-labelledby="first-project-home-title"><h2 id="first-project-home-title">Add your first project</h2><p>Start with something you’ve made.</p><button type="button" data-ui-control="button" data-control-variant="primary" data-control-size="lg" onClick={firstProjectAction}>Choose your work</button></section>;
  return <div data-mobile-home-search={showMobileSearch ? '' : undefined} data-feed-artwork-edge={!locationId && projects.length > 0 && feed.status !== 'error' ? '' : undefined} className="feed-starfield relative flex h-full w-full flex-col">
      <div
        ref={autoScrollRef}
        onScroll={rememberScroll}
        className="feed-edge-fade scrollbar-hidden relative z-10 min-h-0 flex-1 overflow-y-auto px-2 pb-7"
      >
        <div data-feed-scroll-content="" className="relative pt-3">
          {showMobileSearch && <header className="mobile-home-search-header"><div className="mobile-screen-action-row">
              <div className="field-shell text-control-shell flex min-h-11 w-full items-center rounded-[8px]">
                {onExploreWorld && <button type="button" onClick={onExploreWorld} aria-label="Open globe search"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--focus-ring)]">
                  <InterfaceIcon icon={Globe2Icon} size="sm" weight="medium" />
                </button>}
                {onSearchUsers && <button type="button" onClick={onSearchUsers}
                  className="flex min-h-11 min-w-0 flex-1 items-center rounded-[8px] px-1 text-left text-[16px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--focus-ring)]">
                  <span className="truncate">Explore the world</span>
                </button>}
                <button type="button" aria-label="Reload Home content" title="Reload Home content" disabled={feed.isRefreshing || feed.status === 'loading'}
                  aria-busy={feed.isRefreshing} onClick={() => { if (feed.isRefreshing || feed.status === 'loading') return; setHasReloaded(true); feed.retry(); }}
                  className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--focus-ring)]">
                  <InterfaceIcon icon={RotateCwIcon} size="sm" weight="medium" effect="rotate" effectActive={feed.isRefreshing} />
                </button>
              </div>
              <div data-inline-screen-actions=""><MobileContextButton /></div></div>
            <p role="status" className={hasReloaded && feed.refreshError ? 'mt-2 text-[13px] text-[var(--text-secondary)]' : 'sr-only'}>
              {feed.isRefreshing ? 'Refreshing Home content.' : hasReloaded ? feed.refreshError ?? (feed.status === 'error' ? 'Could not refresh Home. Please try again.' : 'Home content refreshed.') : ''}
            </p>
          </header>}
          {!locationId && <WeeklyReadNote />}
          <section aria-labelledby="home-work-title">
            <h1 id="home-work-title" className="sr-only">Home</h1>
            {density.saveError && <p role="status" className="py-2 text-[13px] text-[var(--text-secondary)]">{density.saveError} <button type="button" onClick={() => { void density.retry(); }} className="text-[var(--accent-text)] underline">Retry layout save</button></p>}
            {!layoutReady && (ownerLayout.status === 'error'
              ? <ErrorState title="Your Home layout could not be loaded" description={ownerLayout.error ?? undefined} onRetry={ownerLayout.retry} />
              : <LoadingState label="Loading your Home layout" />)}
            {feed.status === 'loading' && projects.length === 0
              ? <LoadingState label="Loading your Home feed" />
              : null}
            {feed.status === 'error'
              ? <ErrorState
                  title="Your Home feed could not be loaded"
                  description={feed.error ?? undefined}
                  onRetry={feed.retry}
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
              ? <JustifiedImageWall
                  label="Home projects"
                  key={viewerProfileId ?? 'guest'}
                  columns={locationId ? locationColumns : density.columns}
                  onColumnsChange={locationId ? setLocationGridChoice : density.setColumns}
                  items={cells.map((cell, index) => ({
                    key: cell.key,
                    ratio: getProjectAspectRatio(projects[index].project),
                    content: cell.content,
                  }))}
                />
              : <BentoFeedGrid key={viewerProfileId ?? 'guest'} items={cells} columns={locationId ? undefined : density.columns} onColumnsChange={locationId ? undefined : density.setColumns} />
              : null}
            {feed.nextCursor && <div className="flex flex-col items-center gap-2 py-5">
              {feed.loadMoreError && <p role="status" className="text-[13px] text-[var(--text-secondary)]">{feed.loadMoreError}</p>}
              <button type="button" className="min-h-11 rounded-full border border-[var(--border-subtle)] px-6 py-2 text-[var(--text-primary)] disabled:opacity-50"
                disabled={feed.isLoadingMore || feed.isRefreshing} aria-busy={feed.isLoadingMore} onClick={feed.loadMore}>
                {feed.isLoadingMore ? 'Loading…' : feed.loadMoreError ? 'Retry loading more' : 'Load more'}
              </button>
            </div>}
          </section>
        </div>
      </div>
    </div>;
}
