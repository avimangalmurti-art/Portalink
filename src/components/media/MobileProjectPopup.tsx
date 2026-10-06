import { useMobileActions } from '../../presentation/mobile/MobileContextActions';

import { contextActions, type ContextTarget } from '../../presentation/mobile/contextActions';

import React, { useEffect, useState } from 'react';

import { useNavigate, useLocation } from 'react-router-dom';

import { useServices } from '../../contexts/ServicesContext';

import { useAuth } from '../../contexts/AuthContext';

import { useProjectEngagement } from '../../features/engagement/useProjectEngagement';

import { EngagementBar } from '../../features/engagement/EngagementBar';

import { CreatorAvatar } from '../profile/CreatorAvatar';

import { MobileProjectDescriptionSheet } from './MobileProjectDescriptionSheet';

import { useInternalContentShare } from '../../features/sharing/InternalContentShare';

import { buildPath } from '../../app/routes';

import { isPublicSharePath } from '../../features/sharing/shareModel';

import type { Project } from '../../types/domain';

import type { VideoCreator } from './MobileVideoFrame';



/** Mount only on request, so project grids do not fetch engagement per tile. */

export function MobileProjectPopup({ project, creator: suppliedCreator, creatorId, onClose, onOpenComments, onOptions, contextHandlers }: {

 project: Project; creator?: VideoCreator; creatorId?: string; onClose: () => void;

 onOpenComments?: () => void; onOptions?: () => void; contextHandlers?: ContextTarget['handlers'];

}) {

 const sendContent = useInternalContentShare();
 const mobileActions = useMobileActions();

 const services = useServices(), auth = useAuth(), navigate = useNavigate(), location = useLocation();

 const [loadedCreator, setLoadedCreator] = useState<VideoCreator>();

 const [creatorError, setCreatorError] = useState(false);

 const creator = suppliedCreator ?? loadedCreator;

 const engagement = useProjectEngagement(project.id);

 const shared = isPublicSharePath(location.pathname);

 useEffect(() => {

  if (suppliedCreator || !creatorId) return;

  let active = true;

  services.profiles.getProfile(creatorId).then(profile => { if(active) setLoadedCreator(profile); }).catch(() => { if(active) setCreatorError(true); });

  return () => { active = false; };

 }, [services, suppliedCreator, creatorId]);

 const requireAccount = shared && !auth.isAuthenticated ? () => auth.requestAuthenticatedDestination({kind:'route',path:location.pathname + location.search,label:'engage with this project'},'signUp') : undefined;

 const url = new URL(buildPath('sharedProject', {profileId: creator?.id ?? creatorId ?? '',categoryId:project.categoryId,projectId:project.id}),window.location.origin).href;

 const options = onOptions ?? (contextHandlers ? () => mobileActions?.open(contextActions(shared ? 'shared' : 'project',{signedIn:auth.isAuthenticated,owner:!shared && auth.viewerProfileId === (creator?.id ?? creatorId)}, {title:project.title,handlers:contextHandlers})) : undefined);

 return <MobileProjectDescriptionSheet projectId={project.id} projectTitle={project.title} description={project.summary} onClose={onClose} details={<>

  <EngagementBar engagement={engagement} projectTitle={project.title} showCounts variant="panel" onRequireAccount={requireAccount} onShare={() => sendContent({url,title:project.title})} />

  {onOpenComments && <button type="button" className="project-popup-comments" onClick={() => { onClose(); onOpenComments(); }}>Comments</button>}

  {creator ? <button type="button" className="project-popup-creator" onClick={() => { if(creator.id) { onClose(); navigate(buildPath(shared ? 'sharedProfile' : 'profile',{profileId:creator.id})); } }} disabled={!creator.id}><CreatorAvatar name={creator.name} avatar={creator.avatar} shape="squircle" /><span>{creator.name}</span></button> : <p role="status">{creatorError ? 'Creator details could not be loaded.' : 'Loading creator…'}</p>}

  {options && <button type="button" className="project-popup-comments" onClick={() => { onClose(); options(); }}>Project options</button>}

 </>} />;

}

