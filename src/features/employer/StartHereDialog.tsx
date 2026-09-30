import React, { useRef, useState } from 'react';
import type { Profile, Project } from '../../types/domain';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { ProjectFormDialog } from '../../components/publishing/ProjectFormDialog';
import { Button } from '../../components/ui/Button';
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
  return <ProjectFormDialog title="Start here" titleId="start-here-title" onClose={onClose} closeDisabled={busy}>
    <div className="project-form-content"><p>{pinned ? 'Remove this introduction from your portfolio?' : `Make “${project.title}” the first project visitors see? This replaces your current Start-here selection.`}</p>
      <Button disabled={busy || (!pinned && (project.isPubliclyVisible === false || project.sessionOnly))} onClick={() => void save()}>{busy ? 'Saving…' : pinned ? 'Remove Start here' : 'Use as Start here'}</Button>
      {error && <p role="alert">{error}</p>}
    </div>
  </ProjectFormDialog>;
}
