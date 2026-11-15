import { useEffect, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { Id } from '../../types/domain';

/** The viewer can rank its already-visible projects using the owner's saved order. */
export function useSavedPortalOrder(profileId: Id, portalId: Id | undefined, enabled: boolean): Id[] | undefined {
  const { projects } = useServices();
  const scope = enabled && portalId ? `${profileId}:${portalId}` : null;
  const [saved, setSaved] = useState<{ scope: string; order: Id[] | undefined }>();

  useEffect(() => {
    if (!scope || !portalId) return;
    let active = true;
    projects.getProjectArrangement(profileId, portalId).then(arrangement => {
      if (active) setSaved({ scope, order: arrangement.supportsFeaturedOrder ? arrangement.projectOrder : undefined });
    }).catch(() => {
      if (active) setSaved({ scope, order: undefined });
    });
    return () => { active = false; };
  }, [scope, profileId, portalId, projects]);

  return saved?.scope === scope ? saved.order : undefined;
}
