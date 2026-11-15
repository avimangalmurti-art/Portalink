import { useEffect, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { Id } from '../../types/domain';

/** Rank already-visible projects. Null means loading, undefined means no saved order is available. */
export function useSavedPortalOrder(profileId: Id, portalId: Id | undefined, enabled: boolean): Id[] | null | undefined {
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

  if (!scope) return undefined;
  return saved?.scope === scope ? saved.order : null;
}
