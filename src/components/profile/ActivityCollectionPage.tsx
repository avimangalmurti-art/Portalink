import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import React from 'react';
import { ProjectPreviewCard } from './ProjectPreviewCard';
import { ArrowLeftIcon, BookmarkIcon, HeartIcon, Repeat2Icon } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';
import { EngagementBar } from '../../features/engagement/EngagementBar';
import { useActivityCollection } from '../../features/engagement/useActivityCollection';
import { useProjectEngagement } from '../../features/engagement/useProjectEngagement';
import { describeActivityCollection } from '../../types/engagement';
import type { EngagementKind } from '../../types/engagement';
import type { ProjectLocation, ProjectView } from '../../types/domain';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { usePresentation } from '../../presentation/usePresentation';
import { buildPath } from '../../app/routes';

/**
 * One activity collection: Likes, Saved, or Reposts.
 *
 * **Activity is private.** It belongs to the account that owns the profile and is
 * never published to visitors — the engagement service is viewer-scoped and has no
 * way to answer "what did somebody else like", so offering another creator's
 * collection would mean either inventing it or rendering an empty page that reads
 * as "they have liked nothing". A visitor is told the collection is private
 * instead, which is the truth.
 *
 * Cards reuse the canonical project presentation and the shared
 * `useProjectEngagement` state, so withdrawing an engagement here removes the
 * entry through canonical state rather than a reload.
 */
const ICONS: Record<EngagementKind, typeof HeartIcon> = {
  like: HeartIcon,
  save: BookmarkIcon,
  repost: Repeat2Icon
};
type ActivityCollectionProps = {
  kind: EngagementKind;
  profileName: string;
  isViewerOwnCollection: boolean;
  onBack: () => void;
  onOpenProject: (projectId: string, location?: ProjectLocation) => void;
  embedded?: boolean;
};

export function ActivityCollectionPage(props: ActivityCollectionProps) {
  const { user, isAuthenticated } = useAuth();
  return <ActivityCollectionContent key={user?.id ?? 'guest'} {...props} isViewerOwnCollection={isAuthenticated && props.isViewerOwnCollection} />;
}

function ActivityCollectionContent({
  kind,
  profileName,
  isViewerOwnCollection,
  onBack,
  onOpenProject,
  embedded = false







}: ActivityCollectionProps) {
  const isMobile = usePresentation() === 'mobile';
  const collection = useActivityCollection(kind, isViewerOwnCollection);
  const labels = describeActivityCollection(kind);
  const Icon = ICONS[kind];
  return <section aria-label={`${profileName} — ${labels.title}`} className="w-full">
      {!embedded && <header className="ps-panel-toolbar global-control-header side-panel-content-inset">
        <ScreenBack><button type="button" onClick={onBack} className="side-panel-primary-control side-panel-control-row px-2 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={ArrowLeftIcon} weight="medium" mirroredInRtl />
          Back to work
        </button></ScreenBack>
        <h2 className="text-medium font-semibold text-[var(--text-primary)]">{labels.title}</h2>
      </header>}

      <div className={embedded ? '' : 'px-[var(--content-gutter)] py-8'}>
        {!embedded && <p className="text-[13px] text-[var(--text-secondary)]">
          {isViewerOwnCollection ? 'Only you can view this collection.' : `${labels.title} are private.`}
        </p>}

        <div className={embedded ? '' : 'mt-8'}>
        {/* Somebody else's collection: stated as private, never as empty. */}
        {!isViewerOwnCollection ? <EmptyState title={`${labels.title} are private`} description="Only the creator can view this collection." /> : collection.phase === 'loading' ? <LoadingState label={`Loading ${labels.title.toLowerCase()}…`} /> : collection.phase === 'error' ? <ErrorState title={`Unable to load ${labels.title.toLowerCase()}`} description={collection.error ?? 'Check the connection, then try again.'} onRetry={collection.retry} /> : collection.isEmpty ? <div className="flex flex-col items-center gap-3 rounded-[14px] border border-[var(--border-subtle)] px-6 py-14 text-center">
            <InterfaceIcon icon={Icon} size="xl" weight="medium" className="text-[var(--text-tertiary)]" />
            <p className="text-[14px] font-medium text-[var(--text-primary)]">{labels.emptyTitle}</p>
            <p className="max-w-[380px] text-[13px] text-[var(--text-secondary)]">{labels.emptyDescription}</p>
            {isMobile && kind === 'save' && <Link to={buildPath('portalink')} className="side-panel-primary-control mt-1 inline-flex min-h-11 items-center rounded-[8px] border border-[var(--hairline-strong)] px-4 text-[14px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Explore the world</Link>}
          </div> : <ul role="list" aria-label={labels.title} className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {/* The collection holds resolved projects, so each row already knows
             its work's canonical address and opens it directly there. */}
            {collection.items.map((item) => <ActivityCard key={item.project.id} item={item} onOpen={() => onOpenProject(item.project.id, {
          profileId: item.creator.id,
          categoryId: item.project.categoryId
        })} />)}
          </ul>}
        </div>
      </div>
    </section>;
}

/**
 * One canonical project. Every field comes from the resolved record — nothing is
 * carried on the engagement — so a card can never describe work that has changed
 * or been removed.
 */
function ActivityCard({
  item,
  onOpen



}: {item: ProjectView;onOpen: () => void;}) {
  const engagement = useProjectEngagement(item.project.id);
  return <li className="min-w-0 self-start">
    <ProjectPreviewCard project={item.project} creator={item.creator} onOpen={onOpen}
      sizes="(min-width: 1280px) 30vw, (min-width: 640px) 46vw, 92vw"
      aspectRatio={item.project.coverFrame?.aspectRatio ?? 4 / 3}
      metrics={<EngagementBar engagement={engagement} projectTitle={item.project.title} size="compact" showCounts />} />
  </li>;
}
