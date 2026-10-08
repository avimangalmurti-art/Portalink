import { ProjectPopupEngagement } from './ProjectPopupEngagement';
import { useMobileActions } from '../../presentation/mobile/MobileContextActions';

import { contextActions, type ContextTarget } from '../../presentation/mobile/contextActions';

import React, { useEffect, useState } from 'react';

import { useNavigate, useLocation } from 'react-router-dom';

import { useServices } from '../../contexts/ServicesContext';

import { useAuth } from '../../contexts/AuthContext';

import { useProjectEngagement } from '../../features/engagement/useProjectEngagement';



import { CreatorAvatar } from '../profile/CreatorAvatar';

import { MobileProjectDescriptionSheet } from './MobileProjectDescriptionSheet';



import { buildPath } from '../../app/routes';

import { isPublicSharePath } from '../../features/sharing/shareModel';

import type { Project } from '../../types/domain';

import type { VideoCreator } from './MobileVideoFrame';



/** Mount only on request, so project grids do not fetch engagement per tile. */

export function MobileProjectPopup({ project, creator: suppliedCreator, creatorId, onClose, onOpenComments, onOptions, contextHandlers, onEditDescription }: {

 project: Project; creator?: VideoCreator; creatorId?: string; onClose: () => void;

 onOpenComments?: () => void; onOptions?: () => void; onEditDescription?: () => void; contextHandlers?: ContextTarget['handlers'];

}) {


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

 const owner = !shared && auth.viewerProfileId === (creator?.id ?? creatorId);
 const options = onOptions ?? (contextHandlers ? () => mobileActions?.open(contextActions(shared ? 'shared' : 'project',{signedIn:auth.isAuthenticated,owner:!shared && auth.viewerProfileId === (creator?.id ?? creatorId)}, {title:project.title,handlers:contextHandlers})) : undefined);

 return <MobileProjectDescriptionSheet projectId={project.id} projectTitle={project.title} description={project.summary} ownerActions={owner ? <ProjectPopupOwnerActions onOptions={options} onEditTitle={contextHandlers?.edit ?? onOptions} onEditDescription={onEditDescription ?? contextHandlers?.edit ?? onOptions} onDelete={contextHandlers?.delete} onClose={onClose} /> : undefined} onClose={onClose} creatorHeader={creator ? <button type="button" className="project-popup-creator" onClick={() => { if(creator.id) { onClose(); navigate(buildPath(shared ? 'sharedProfile' : 'profile',{profileId:creator.id})); } }} disabled={!creator.id}><CreatorAvatar name={creator.name} avatar={creator.avatar} shape="squircle" className="h-12 w-12" priority /><span>{creator.name}</span></button> : <p role="status">{creatorError ? 'Creator details could not be loaded.' : 'Loading creator…'}</p>} details={<>

  <ProjectPopupEngagement projectId={project.id} projectTitle={project.title} url={url} engagement={engagement} onRequireAccount={requireAccount} onOpenComments={onOpenComments ? () => { onClose(); onOpenComments(); } : undefined} />







  {!owner && options && <button type="button" className="project-popup-comments" onClick={() => { onClose(); options(); }}>Project options</button>}

 </>} />;

}


export function ProjectPopupOwnerActions({ onOptions, onEditTitle, onEditDescription, onDelete, onClose }: { onOptions?: () => unknown; onEditTitle?: () => unknown; onEditDescription?: () => unknown; onDelete?: () => unknown; onClose: () => void }) {
 return <div className="project-popup-owner-actions">
  {([['Project options', onOptions], ['Edit title', onEditTitle], ['Edit description', onEditDescription], ['Delete project', onDelete]] as const).map(([label, run]) => run && <button key={label} type="button" className="project-popup-owner-button" data-destructive={label === 'Delete project' || undefined} onClick={() => { onClose(); void run(); }}>{label}</button>)}
 </div>;
}
