import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFeed } from '../../features/discovery/useFeed';
import { ProjectFeedCard } from './ProjectFeedCard';
import { BentoFeedGrid } from './BentoFeedGrid';
import type { BentoCellItem } from './BentoFeedGrid';
import { JustifiedImageWall } from '../profile/JustifiedImageWall';
import { usePresentation } from '../../presentation/usePresentation';
import { getProjectAspectRatio, resolveFeedSpan } from '../../utils/projectPresentation';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';
import type { Id, ProjectLocation } from '../../types/domain';
import { SearchIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';

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
  /** Reserved for future search on the mobile Home route. */
  showSearchPlaceholder?: boolean;
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
 * Search and global discovery live at `/search`; Home has one predictable job:
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
  emptyTitle = 'Your Home feed is ready',
  emptyDescription = 'Your published work and new work from creators you follow will appear here.',
}: HomeFeedProps) {
  const isMobile = usePresentation() === 'mobile';
  const showMobileSearch = isMobile && !locationId && showSearchPlaceholder;
  const feed = useFeed(locationId);
  const autoScrollRef = useRef<HTMLDivElement>(null);
  const [mobileCapacityWidth, setMobileCapacityWidth] = useState<number>();
  const hasRestoredScrollRef = useRef(false);
  const latestScrollTopRef = useRef(readFeedScroll(scrollMemoryKey));
  const persistFrameRef = useRef(0);

  // Choose Home's columns from the full phone canvas. Floating navigation never
  // changes this capacity or the content width measured by the wall.
  useLayoutEffect(() => {
    if (!isMobile || locationId) { setMobileCapacityWidth(undefined); return; }
    const scroller = autoScrollRef.current;
    const canvas = scroller?.closest<HTMLElement>('[data-presentation="mobile"]');
    if (!scroller || !canvas) return;
    const measure = () => {
      const style = getComputedStyle(scroller);
      const inset = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      setMobileCapacityWidth(Math.max(0, canvas.clientWidth - inset));
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(canvas);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [isMobile, locationId]);

  const projects = useMemo(() => {
    const ordered = feed.featured ? [feed.featured, ...feed.projects] : feed.projects;
    return Array.from(new Map(ordered.map((view) => [view.project.id, view])).values());
  }, [feed.featured, feed.projects]);

  const cells: BentoCellItem[] = projects.map((view, index) => ({
    key: view.project.id,
    span: (columns) => resolveFeedSpan({
      aspectRatio: getProjectAspectRatio(view.project),
    }, columns),
    content: <ProjectFeedCard
      view={view}
      onOpenProject={onOpenProject}
      onOpenCreator={onOpenCreator}
      onWarmCreator={onWarmCreator}
      priority={index < 2}
    />,
  }));

  // Home and location feeds scroll inside the screen rather than through the
  // shell. Restore that real scroll surface once its cards exist, so Back lands
  // on the work the viewer left instead of quietly returning them to the top.
  useLayoutEffect(() => {
    if (hasRestoredScrollRef.current || (feed.status === 'loading' && projects.length === 0)) {
      return undefined;
    }
    hasRestoredScrollRef.current = true;
    const target = latestScrollTopRef.current;
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      const element = autoScrollRef.current;
      if (!element) return;
      element.scrollTop = target;
      if (Math.abs(element.scrollTop - target) < 2 || attempts >= 30) return;
      attempts += 1;
      frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [feed.status, projects.length]);

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

  return <div data-mobile-home-search={showMobileSearch ? '' : undefined} data-feed-artwork-edge={!locationId && projects.length > 0 && feed.status !== 'error' ? '' : undefined} className="feed-starfield relative flex h-full w-full flex-col">
      <div
        ref={autoScrollRef}
        onScroll={rememberScroll}
        className="feed-edge-fade scrollbar-hidden relative z-10 min-h-0 flex-1 overflow-y-auto px-2 pb-7"
      >
        <div data-feed-scroll-content="" className="relative pt-3">
          {showMobileSearch && <div className="text-control-shell mb-3 flex h-11 w-full items-center gap-2.5 px-3" title="Search is coming soon">
            <InterfaceIcon icon={SearchIcon} size="sm" weight="medium" className="text-[var(--text-tertiary)]" />
            <input type="search" disabled placeholder="Search" aria-label="Search (coming soon)" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] text-[var(--text-secondary)]" />
          </div>}
          <section aria-labelledby="home-work-title">
            <h1 id="home-work-title" className="sr-only">Home</h1>
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
                />
              : null}
            {projects.length > 0 ? isMobile
              // Consecutive rows share Profile's sizing and preserve reading
              // order without repacking measured cards when this screen mounts.
              ? <JustifiedImageWall
                  label="Home projects"
                  columns={3}
                  columnCapacityWidth={!locationId ? mobileCapacityWidth : undefined}
                  items={cells.map((cell, index) => ({
                    key: cell.key,
                    ratio: getProjectAspectRatio(projects[index].project),
                    content: cell.content,
                  }))}
                />
              : <BentoFeedGrid items={cells} />
              : null}
          </section>
        </div>
      </div>
    </div>;
}
