import React from 'react';
import type { Id, ProjectLocation, ProjectView } from '../../types/domain';
import { ProjectPreviewCard } from '../profile/ProjectPreviewCard';

type ProjectFeedCardProps = {
  view: ProjectView;
  onOpenProject: (projectId: Id, location?: ProjectLocation) => void;
  onOpenCreator: (creatorId: Id) => void;
  onWarmCreator?: (creatorId: Id) => void;
  priority?: boolean;
};
export function ProjectFeedCard({ view: { project, creator }, onOpenProject, onOpenCreator, onWarmCreator, priority = false }: ProjectFeedCardProps) {
  const openProject = () => onOpenProject(project.id, { profileId: creator.id, categoryId: project.categoryId });
  return <ProjectPreviewCard project={project} creator={creator} onOpen={openProject} onOpenComments={openProject}
    onOpenCreator={() => onOpenCreator(creator.id)} onWarmCreator={() => onWarmCreator?.(creator.id)}
    label={`Open ${project.title} by ${creator.name}`} priority={priority}
    sizes="(min-width: 1420px) 25vw, (min-width: 940px) 33vw, (min-width: 620px) 40vw, 92vw" />;
}
