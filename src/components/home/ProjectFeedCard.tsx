import React from 'react';
import type { Id, ProjectLocation, ProjectView } from '../../types/domain';
import { ProjectPreviewCard } from '../profile/ProjectPreviewCard';
import type { ProjectManagement } from '../../features/projects/useProjectManagement';
import type { ImagePriority } from '../ui/ResponsiveImage';

type ProjectFeedCardProps = {
  view: ProjectView;
  onOpenProject: (projectId: Id, location?: ProjectLocation) => void;
  onOpenCreator: (creatorId: Id) => void;
  onWarmCreator?: (creatorId: Id) => void;
  priority?: ImagePriority;
  management?: ProjectManagement;
};
export function ProjectFeedCard({ view: { project, creator }, onOpenProject, onOpenCreator, onWarmCreator, priority = false, management }: ProjectFeedCardProps) {
  const types = [...new Set(project.attachments?.map(asset => ({ image: 'Image', video: 'Video', audio: 'Audio', document: asset.typeLabel || 'Document', model3d: '3D model', unknown: asset.typeLabel || 'File' })[asset.kind]).filter(Boolean) ?? [])];
  const contentTypeLabel = types.length > 1 ? 'Mixed media' : types[0] ?? (project.coverKind === 'document' ? 'PDF' : project.coverKind === 'video' ? 'Video' : 'Image');
  const openProject = () => onOpenProject(project.id, { profileId: creator.id, categoryId: project.categoryId });
  return <ProjectPreviewCard className="explore-feed-card" contentTypeLabel={contentTypeLabel} project={project} creator={creator} onOpen={openProject} onOpenComments={openProject}
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
