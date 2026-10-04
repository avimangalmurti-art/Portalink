import React, { useRef, useState } from 'react';
import type { Profile, Project } from '../../types/domain';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
export function StartHereDialog({profile, project, onClose}: {profile: Profile; project: Project; onClose: () => void}) {
  const {profiles} = useServices(), {invalidateProfiles} = useProfileData();
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), saving = useRef(false);
  const pinned = profile.startHereProjectId === project.id;
  const save = async () => {
    if(saving.current)return; saving.current=true;setBusy(true);setError('');
    try { await profiles.updateProfile(profile.id,{startHereProjectId:pinned ? null : project.id}); invalidateProfiles(); onClose(); }
    catch(e){setError(e instanceof Error ? e.message : 'The project could not be pinned.');}
    finally{saving.current=false;setBusy(false);}
  };
  return <ConfirmationDialog title={pinned ? 'Remove Start here?' : 'Use this project as Start here?'} description={pinned ? 'This removes the introduction from your portfolio. The project stays published.' : `“${project.title}” will be the first project visitors see. This replaces your current Start-here selection.`} confirmLabel={pinned ? 'Remove Start here' : 'Use as Start here'} variant="standard" pending={busy} pendingLabel="Saving…" error={error} confirmDisabled={!pinned && (project.isPubliclyVisible === false || Boolean(project.sessionOnly))} onCancel={onClose} onConfirm={save}/>;
}
