import type { Project } from '../../types/domain';

/** Extra Portal placements keep the project's original category and identity. */
export function projectBelongsToPortal(
  project: Pick<Project, 'categoryId' | 'additionalPortalIds'>,
  portalId: string | null | undefined,
): boolean {
  return Boolean(portalId && (project.categoryId === portalId || project.additionalPortalIds?.includes(portalId)));
}
