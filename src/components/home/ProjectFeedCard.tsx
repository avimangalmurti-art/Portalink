import React from 'react';
import { getProjectAspectRatio } from '../../utils/projectPresentation';
import type { Id, ProjectLocation, ProjectView } from '../../types/domain';
import { ProjectCover } from '../media/ProjectCover';
import { ProjectHoverDetails } from '../profile/ProjectHoverDetails';
import { CreatorAvatar } from '../profile/CreatorAvatar';
import { projectContinuityStyle } from '../../utils/projectContinuity';
type ProjectFeedCardProps = {
  /** The canonical project and its resolved attribution. */
  view: ProjectView;
  /**
   * The card already holds the project's canonical address, so it passes it
   * along: discovery opens the work in the same viewer its portfolio does,
   * without the shell having to resolve the record again first.
  */
  onOpenProject: (projectId: Id, location?: ProjectLocation) => void;
  onOpenCreator: (creatorId: Id) => void;
  onWarmCreator?: (creatorId: Id) => void;
  priority?: boolean;
};
export function ProjectFeedCard({
  view,
  onOpenProject,
  onOpenCreator,
  onWarmCreator,
  priority = false,
}: ProjectFeedCardProps) {
  const {
    project,
    creator
  } = view;
  const projectLocation = {
    profileId: creator.id,
    categoryId: project.categoryId
  };
  const openProject = () => onOpenProject(project.id, projectLocation);
  return (
    // The card shell remains stable; only the cover frame exchanges artwork for
    // the same hover details used by a creator's profile wall.
    <article className="feed-card individual-content-outline group relative min-w-0 overflow-hidden">
      <button type="button" onPointerEnter={() => onWarmCreator?.(creator.id)} onPointerDown={() => onWarmCreator?.(creator.id)} onFocus={() => onWarmCreator?.(creator.id)} onClick={openProject} aria-label={`Open ${project.title} by ${creator.name}`} className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
        {/* Real source imagery, shown at the ratio the file itself implies. */}
        <span data-project-continuity-surface="" data-project-continuity-id={project.id} className="feed-card__preview relative block w-full overflow-hidden" style={{
          aspectRatio: getProjectAspectRatio(project),
          ...projectContinuityStyle(project.id)
        }}>
          <span className="feed-card__cover-transition absolute inset-0 block transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0 motion-reduce:transition-none">
            <ProjectCover source={project.cover} alt={project.coverAlt} kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} aspectRatio={getProjectAspectRatio(project)} sizes="(min-width: 1420px) 25vw, (min-width: 940px) 33vw, (min-width: 620px) 40vw, 92vw" priority={priority} />
          </span>
        </span>
      </button>
      {/* Keep the social controls outside the cover button so the comment
          action is its own valid, keyboard-accessible target. */}
      <ProjectHoverDetails
        projectId={project.id}
        summary={project.summary}
        bottomInset={60}
        onOpen={openProject}
        onOpenComments={openProject}
        className="feed-card__details-transition pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
      />
      <button
        type="button"
        data-creator-link=""
        data-hover-attribution=""
        onPointerEnter={() => onWarmCreator?.(creator.id)}
        onPointerDown={() => onWarmCreator?.(creator.id)}
        onFocus={() => onWarmCreator?.(creator.id)}
        onClick={() => onOpenCreator(creator.id)}
        aria-label={`Open ${creator.name}'s profile`}
        title={creator.name}
        className="feed-card__creator-attribution absolute bottom-0 left-0 right-0 z-30 flex items-center gap-2 p-1 pr-2.5 text-[var(--text-primary)] opacity-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
      >
        <CreatorAvatar name={creator.name} avatar={creator.avatar} shape="compact" className="feed-card__creator-avatar h-10 w-10 text-[13px]" fallbackClassName="bg-[var(--surface-sunken)] text-[var(--text-secondary)] ring-0" />
        <span className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold leading-none">{creator.name}</span>
      </button>
    </article>);

}
