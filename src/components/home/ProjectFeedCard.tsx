import React from 'react';
import type { Id, ProjectLocation, ProjectView } from '../../types/domain';
import { ProjectPreviewCard } from '../profile/ProjectPreviewCard';
import type { ProjectManagement } from '../../features/projects/useProjectManagement';

type ProjectFeedCardProps = {
  view: ProjectView;
  onOpenProject: (projectId: Id, location?: ProjectLocation) => void;
  onOpenCreator: (creatorId: Id) => void;
  onWarmCreator?: (creatorId: Id) => void;
  priority?: boolean;
  management?: ProjectManagement;
};
export function ProjectFeedCard({ view: { project, creator }, onOpenProject, onOpenCreator, onWarmCreator, priority = false, management }: ProjectFeedCardProps) {
  const openProject = () => onOpenProject(project.id, { profileId: creator.id, categoryId: project.categoryId });
  return <ProjectPreviewCard project={project} creator={creator} onOpen={openProject} onOpenComments={openProject}
    onEditDescription={management ? () => management.editor.open(project.id, 'description') : undefined}
    contextHandlers={management ? {
      edit: () => management.editor.open(project.id),
      cover: () => management.editor.open(project.id, 'cover'),
      delete: () => management.deletion.request(project.id),
    } : undefined}
    onOpenCreator={() => onOpenCreator(creator.id)} onWarmCreator={() => onWarmCreator?.(creator.id)}
    label={`Open ${project.title} by ${creator.name}`} priority={priority}
    sizes="(min-width: 1420px) 25vw, (min-width: 940px) 33vw, (min-width: 620px) 40vw, 92vw" />;
}
