import React, { useMemo, useRef } from 'react';
import { useFeed } from '../../features/discovery/useFeed';
import { ProjectFeedCard } from './ProjectFeedCard';
import { BentoFeedGrid } from './BentoFeedGrid';
import type { BentoCellItem } from './BentoFeedGrid';
import { getProjectAspectRatio, resolveFeedSpan } from '../../utils/projectPresentation';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';
import type { Id, ProjectLocation } from '../../types/domain';

type HomeFeedProps = {
  /** Retained as part of the shell contract; the grid measures its real width. */
  isSidebarCollapsed: boolean;
  /** Navigation is by stable id: no project record is ever handed upward. */
  onOpenProject: (projectId: Id, location?: ProjectLocation) => void;
  onOpenCreator: (creatorId: Id) => void;
};

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
}: HomeFeedProps) {
  const feed = useFeed();
  const autoScrollRef = useRef<HTMLDivElement>(null);

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
      priority={index < 2}
    />,
  }));

  return <div className="feed-starfield relative flex h-full w-full flex-col">
      <div
        ref={autoScrollRef}
        className="feed-edge-fade scrollbar-hidden relative z-10 min-h-0 flex-1 overflow-y-auto px-2 pb-7"
      >
        <div className="relative pt-3">
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
                  title="Your Home feed is ready"
                  description="Your published work and new work from creators you follow will appear here."
                />
              : null}
            {projects.length > 0 ? <BentoFeedGrid items={cells} /> : null}
          </section>
        </div>
      </div>
    </div>;
}
