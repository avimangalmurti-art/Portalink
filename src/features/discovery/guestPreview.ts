import type { ProjectView } from '../../types/domain';

export const GUEST_HOME_PROJECT_LIMIT = 12;

export function guestPreviewProjects(projects: readonly ProjectView[]): ProjectView[] {
  return Array.from(new Map(projects.map(view => [view.project.id, view])).values()).slice(0, GUEST_HOME_PROJECT_LIMIT);
}
