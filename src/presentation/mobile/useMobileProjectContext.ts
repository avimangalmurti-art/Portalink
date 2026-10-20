import { PUBLIC_ORIGIN } from '../../features/citations/publicOrigin';
import { useState } from 'react';
import { isPublicSharePath } from '../../features/sharing/shareModel';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProjectEngagement } from '../../features/engagement/useProjectEngagement';
import type { Project } from '../../types/domain';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { buildPath } from '../../app/routes';
import { useMobileContextPress } from './MobileContextActions';
import { contextActions, type ContextTarget } from './contextActions';
import { useInternalContentShare } from '../../features/sharing/InternalContentShare';

export function useMobileProjectContext(project: Project, creatorId: string | undefined, contextHandlers?: ContextTarget['handlers'], disabled = false) {
  const sendContent = useInternalContentShare();
  const auth = useAuth(), location = useLocation(), navigate = useNavigate();
  const [contextRequested, setContextRequested] = useState(false);
  // Resolve engagement only after the hold; grid boot does not gain one read per tile.
  const engagement = useProjectEngagement(contextRequested ? project.id : null);
  const isShared = isPublicSharePath(location.pathname);
  const owner = !isShared && auth.viewerProfileId === creatorId;
  const url = new URL(buildPath('sharedProject', { profileId: creatorId ?? '', categoryId: project.categoryId, projectId: project.id }), PUBLIC_ORIGIN).href;
  const model = contextActions(isShared ? 'shared' : 'project', { signedIn: auth.isAuthenticated, owner }, { title: project.title, handlers: {
    reads: owner ? () => navigate(`/insights?project=${encodeURIComponent(project.id)}`) : undefined,
    startHere: owner && project.isPubliclyVisible !== false ? () => navigate(`/p/${creatorId}?startHere=${encodeURIComponent(project.id)}`) : undefined,
    thenNow: owner && project.isPubliclyVisible !== false ? () => navigate(`/p/${creatorId}?journeyPair=${encodeURIComponent(project.id)}`) : undefined,
    ...contextHandlers,
    share: () => sendContent({url,title:project.title}), copy: () => copyPublicLink(url),
    saveProject: contextRequested && engagement.record && !engagement.isResolving && !engagement.resolveError && !engagement.isPending('save') ? () => engagement.toggle('save') : undefined,
    signIn: () => auth.requestAuthenticatedDestination({kind:'route',path:location.pathname + location.search,label:'return to this shared view'}, 'signIn'),
    createAccount: () => auth.requestAuthenticatedDestination({kind:'route',path:location.pathname + location.search,label:'return to this shared view'}, 'signUp'),
  }, labels: { saveProject: engagement.isEngaged('save') ? 'Unsave project' : 'Save project' } });
  return useMobileContextPress(disabled || !creatorId ? null : model, false, () => setContextRequested(true));
}
