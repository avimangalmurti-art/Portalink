import React, { useRef, useState } from 'react';
import type { Profile } from '../../types/domain';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { ProjectFormDialog } from '../../components/publishing/ProjectFormDialog';
import { Button } from '../../components/ui/Button';
import { journeyProjects } from './journey';
import { ArrowLeftIcon } from 'lucide-react';
import { usePresentation } from '../../presentation/usePresentation';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import './journey.css';
import { useTimelinePairs } from './useTimelinePairs';

function PairScreen({ busy, onClose, children }: { busy: boolean; onClose: () => void; children: React.ReactNode }) {
  const viewport = useDialogViewport();
  const back = () => { if (!busy) onClose(); };
  return <ModalPortal><section ref={viewport} data-presentation="mobile" className="journey-pair-screen" aria-labelledby="journey-pair-title">
    <header><ScreenBack visibleOnMobile action={back}><button type="button" aria-label="Back" disabled={busy} onClick={back}><ArrowLeftIcon size={20} /></button></ScreenBack><h2 id="journey-pair-title">Then / Now</h2></header>
    {children}
  </section></ModalPortal>;
}
export function ThenNowDialog({ profile, selectedId, onClose }: { profile: Profile; selectedId?: string; onClose: () => void }) {
  const isMobile = usePresentation() === 'mobile';
  const choices = journeyProjects(profile.projects, false), { profiles } = useServices(), { invalidateProfiles } = useProfileData();
  const available = (id?: string) => id && choices.some(project => project.id === id) ? id : '';
  const { pairs, error: loadError, loading } = useTimelinePairs(profile, true);
  const [then, setThen] = useState(available(selectedId));
  const [now, setNow] = useState('');
  const validPair = then !== now && Boolean(available(then) && available(now));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  const save = async () => {
    if (saving.current || !validPair || loading || loadError) return;
    saving.current = true; setBusy(true); setError('');
    try {
      if (pairs.some(pair => pair.then === then && pair.now === now)) throw new Error('This pair already exists.');
      if (!profiles.addTimelinePair) throw new Error('Multiple Then/Now pairs are not available yet.');
      await profiles.addTimelinePair(profile.id, then, now); invalidateProfiles(); onClose();
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The pair could not be saved.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const remove = async (id: string) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      if (id === 'legacy') await profiles.updateProfile(profile.id, { thenNow: null });
      else {
        if (!profiles.removeTimelinePair) throw new Error('This pair could not be removed.');
        await profiles.removeTimelinePair(profile.id, id);
      }
      invalidateProfiles(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'This pair could not be removed.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const form = <form className="project-form-content journey-pair-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p>Choose two visible published projects that show how your work has changed. Hiding either project removes the pair.</p>
      {(['Then', 'Now'] as const).map(label => <label key={label}>{label}<select aria-label={`${label} project`} value={label === 'Then' ? then : now} disabled={busy} onChange={event => (label === 'Then' ? setThen : setNow)(event.target.value)}>
        <option value="">Choose a project</option>{choices.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
      </select></label>)}
      {loadError && <p role="alert">{loadError}</p>}
      {error && <p role="alert">{error}</p>}
      {pairs.map(pair => <div key={pair.id}>
        <p>{choices.find(project => project.id === pair.then)?.title} → {choices.find(project => project.id === pair.now)?.title}</p>
        <Button variant="ghost" disabled={busy} onClick={() => void remove(pair.id)}>Remove pair</Button>
      </div>)}
      <Button type="submit" disabled={busy || loading || Boolean(loadError) || !validPair}>{busy ? 'Saving…' : 'Save pair'}</Button>
    </form>;
  return isMobile ? <PairScreen busy={busy} onClose={onClose}>{form}</PairScreen> : <ProjectFormDialog title="Then / Now" titleId="journey-pair-title" onClose={onClose} closeDisabled={busy}>{form}</ProjectFormDialog>;
}
