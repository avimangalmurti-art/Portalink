import { PUBLIC_ORIGIN } from '../../features/citations/publicOrigin';
import { ProjectPopupEngagement } from './ProjectPopupEngagement';
import type { ContextTarget } from '../../presentation/mobile/contextActions';

import React, { useEffect, useState } from 'react';

import { useNavigate, useLocation } from 'react-router-dom';

import { useServices } from '../../contexts/ServicesContext';

import { useAuth } from '../../contexts/AuthContext';

import { useProjectEngagement } from '../../features/engagement/useProjectEngagement';



import { CreatorAvatar } from '../profile/CreatorAvatar';

import { FollowContentInfoPopup } from './FollowContentInfoPopup';
import { ProjectPortalMembershipDialog } from '../../features/projects/ProjectPortalMembershipDialog';



import { buildPath } from '../../app/routes';

import { isPublicSharePath } from '../../features/sharing/shareModel';

import type { Project } from '../../types/domain';

import type { VideoCreator } from './MobileVideoFrame';

type PortalProject = { id: string; title: string; profileId: string };


/** Mount only on request, so project grids do not fetch engagement per tile. */

export function MobileProjectPopup({ project, creator: suppliedCreator, creatorId, onClose, onOpenComments, onOptions, contextHandlers, onEditDescription }: {

 project: Project; creator?: VideoCreator; creatorId?: string; onClose: () => void;

 onOpenComments?: () => void; onOptions?: () => void; onEditDescription?: () => void; contextHandlers?: ContextTarget['handlers'];

}) {


 const services = useServices(), auth = useAuth(), navigate = useNavigate(), location = useLocation();

 const [loadedCreator, setLoadedCreator] = useState<VideoCreator>();

 const [creatorError, setCreatorError] = useState(false);

 const creator = suppliedCreator ?? loadedCreator;

 const shared = isPublicSharePath(location.pathname);

 const engagement = useProjectEngagement(shared ? null : project.id);

 useEffect(() => {

  if (suppliedCreator || !creatorId) return;

  let active = true;

  services.profiles.getProfile(creatorId).then(profile => { if(active) setLoadedCreator(profile); }).catch(() => { if(active) setCreatorError(true); });

  return () => { active = false; };

 }, [services, suppliedCreator, creatorId]);

 const requireAccount = shared && !auth.isAuthenticated ? () => auth.requestAuthenticatedDestination({kind:'route',path:location.pathname + location.search,label:'engage with this project'},'signUp') : undefined;

 const url = new URL(buildPath('sharedProject', {profileId: creator?.id ?? creatorId ?? '',categoryId:project.categoryId,projectId:project.id}),PUBLIC_ORIGIN).href;

 const profileId = creator?.id ?? creatorId;
 const owner = !shared && Boolean(profileId && auth.viewerProfileId === profileId);
 const editTitle = contextHandlers?.edit ?? onOptions;
 const editDescription = onEditDescription ?? contextHandlers?.edit ?? onOptions;
 const portalProject = owner && auth.isAuthenticated && profileId && services.projects?.getPortalMemberships && services.projects?.setPortalMemberships
  ? { id: project.id, title: project.title, profileId }
  : undefined;
 const hasOwnerActions = owner && Boolean(onOptions || editTitle || editDescription || contextHandlers?.delete || portalProject);

 return <FollowContentInfoPopup projectId={project.id} title={project.title} description={project.summary} showEngagement={!shared} optionsContent={hasOwnerActions ? <ProjectPopupOwnerActions onOptions={onOptions} onEditTitle={editTitle} onEditDescription={editDescription} portalProject={portalProject} onDelete={contextHandlers?.delete} onClose={onClose} /> : undefined} onComments={() => { onClose(); onOpenComments?.(); }} engagement={engagement} onRequireAccount={requireAccount} onClose={onClose} creatorHeader={creator ? <button type="button" className="project-popup-creator" onClick={() => { if(creator.id) { onClose(); navigate(buildPath(shared ? 'sharedProfile' : 'profile',{profileId:creator.id})); } }} disabled={!creator.id}><CreatorAvatar name={creator.name} avatar={creator.avatar} shape="squircle" className="h-12 w-12" priority /><span>{creator.name}</span></button> : <p role="status">{creatorError ? 'Creator details could not be loaded.' : 'Loading creator…'}</p>} engagementContent={shared ? undefined : <>

  <ProjectPopupEngagement projectId={project.id} projectTitle={project.title} url={url} engagement={engagement} onRequireAccount={requireAccount} onOpenComments={onOpenComments ? () => { onClose(); onOpenComments(); } : undefined} />








 </>} />;

}


export function ProjectPopupOwnerActions({ onOptions, onEditTitle, onEditDescription, portalProject, onDelete, onClose }: {
 onOptions?: () => unknown; onEditTitle?: () => unknown; onEditDescription?: () => unknown;
 portalProject?: PortalProject;
 onDelete?: () => unknown; onClose: () => void;
}) {
 const editProject = onEditTitle ?? onOptions ?? onEditDescription;
 return <div className="project-popup-owner-actions">
  {editProject && <button type="button" className="project-popup-owner-button" onClick={() => { onClose(); void editProject(); }}>Edit project</button>}
  {portalProject && <ProjectPortalMembershipAction key={portalProject.id} project={portalProject} />}
  {onDelete && <button type="button" className="project-popup-owner-button" data-destructive onClick={() => { onClose(); void onDelete(); }}>Delete project</button>}
 </div>;
}

function ProjectPortalMembershipAction({ project }: { project: PortalProject }) {
 const { projects } = useServices();
 const [open, setOpen] = useState(false);
 if (!projects.getPortalMemberships || !projects.setPortalMemberships) return null;
 const close = () => setOpen(false);
 return <>
  <button type="button" className="project-popup-owner-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>Feature in Portals</button>
  {open && <ProjectPortalMembershipDialog project={project} onClose={close} />}
 </>;
}
