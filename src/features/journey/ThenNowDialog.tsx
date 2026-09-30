import React, { useRef, useState } from 'react';
import type { Profile } from '../../types/domain';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { ProjectFormDialog } from '../../components/publishing/ProjectFormDialog';
import { Button } from '../../components/ui/Button';
import { journeyProjects } from './journey';
export function ThenNowDialog({ profile, selectedId, onClose }: { profile: Profile; selectedId?: string; onClose: () => void }) {
  const choices = journeyProjects(profile.projects, false), { profiles } = useServices(), { invalidateProfiles } = useProfileData();
  const available = (id?: string) => id && choices.some(project => project.id === id) ? id : '';
  const [then, setThen] = useState(available(profile.thenNow?.then) || available(selectedId));
  const [now, setNow] = useState(profile.thenNow?.then && selectedId && selectedId !== profile.thenNow.then ? available(selectedId) : available(profile.thenNow?.now));
  const validPair = then !== now && Boolean(available(then) && available(now));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  const save = async (clear = false) => {
    if (saving.current || (!clear && !validPair)) return;
    saving.current = true; setBusy(true); setError('');
    try { await profiles.updateProfile(profile.id, { thenNow: clear ? null : { then, now } }); invalidateProfiles(); onClose(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The pair could not be saved.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <ProjectFormDialog title="Then / Now" titleId="journey-pair-title" onClose={onClose} closeDisabled={busy}>
    <form className="project-form-content journey-pair-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p>Choose two visible published projects that show how your work has changed. Hiding either project removes the pair.</p>
      {(['Then', 'Now'] as const).map(label => <label key={label}>{label}<select aria-label={`${label} project`} value={label === 'Then' ? then : now} disabled={busy} onChange={event => (label === 'Then' ? setThen : setNow)(event.target.value)}>
        <option value="">Choose a project</option>{choices.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
      </select></label>)}
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy || !validPair}>{busy ? 'Saving…' : 'Save pair'}</Button>
      {profile.thenNow && <Button variant="ghost" disabled={busy} onClick={() => void save(true)}>Remove pair</Button>}
    </form>
  </ProjectFormDialog>;
}
