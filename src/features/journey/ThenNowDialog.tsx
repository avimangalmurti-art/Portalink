import React, { useRef, useState } from 'react';
import type { Profile } from '../../types/domain';
import type { TimelinePair } from '../../services/interfaces';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { ProjectFormDialog } from '../../components/publishing/ProjectFormDialog';
import { Button } from '../../components/ui/Button';
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
import { journeyProjects, sameTimelineCoverPosition } from './journey';
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon } from 'lucide-react';
import { usePresentation } from '../../presentation/usePresentation';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ImageRepositionDialog } from '../../components/media/ImageRepositionDialog';
import type { ImagePosition } from '../../types/imageCrop';
import './journey.css';
import { useTimelinePairs } from './useTimelinePairs';
import { TimelinePairCover } from './TimelinePairCover';
import { timelinePairArtwork } from './timelinePairArtwork';

const PAIR_SIDES = ['then', 'now'] as const;
type PairSide = typeof PAIR_SIDES[number];
const SIDE_LABELS = { then: 'Then', now: 'Now' } as const;

function PairScreen({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: React.ReactNode }) {
  const viewport = useDialogViewport<HTMLElement>();
  const back = () => { if (!busy) onClose(); };
  useModalFocus(true, viewport, back, true);
  return <ModalPortal><section ref={viewport} data-presentation="mobile" className="journey-pair-screen" role="dialog" aria-modal="true" aria-labelledby="journey-pair-title" tabIndex={-1}>
    <header><ScreenBack visibleOnMobile action={back}><button type="button" data-ui-control="icon" data-ui-shape="icon" data-control-size="sm" aria-label="Back" disabled={busy} onClick={back}><ArrowLeftIcon size={20} aria-hidden="true" /></button></ScreenBack><h2 id="journey-pair-title">{title}</h2></header>
    {children}
  </section></ModalPortal>;
}

export function ReorderTimelinePairs({ pairs, projects, loading, saveOrder, onClose }: {
  pairs: TimelinePair[];
  projects: Profile['projects'];
  loading: boolean;
  saveOrder: (ids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(pairs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const pairIds = new Set(pairs.map(pair => pair.id));
  const listChanged = draft.length !== pairs.length || draft.some(pair => !pairIds.has(pair.id));
  const changed = draft.some((pair, index) => pair.id !== pairs[index]?.id);
  const canSave = changed && !listChanged && !loading;

  const move = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (saving.current || destination < 0 || destination >= draft.length) return;
    const next = [...draft];
    [next[index], next[destination]] = [next[destination], next[index]];
    setDraft(next);
    setError('');
  };
  const save = async () => {
    if (saving.current || !canSave) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await saveOrder(draft.map(pair => pair.id));
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The pair order could not be saved.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return <PairScreen title="Reorder Then/Now pairs" busy={busy} onClose={onClose}>
    <form className="project-form-content journey-pair-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <ol className="journey-pair-order-list" aria-label="Pair order">
        {draft.map((pair, index) => {
          const then = projects.find(project => project.id === pair.then)?.title ?? 'Then project';
          const now = projects.find(project => project.id === pair.now)?.title ?? 'Now project';
          return <li key={pair.id}>
            <span>{then} → {now}</span>
            <div className="journey-pair-order-actions">
              <button type="button" data-ui-control="icon" data-ui-shape="icon" data-control-size="sm"
                aria-label={`Move ${then} and ${now} up`} aria-disabled={index === 0}
                disabled={busy} onClick={() => move(index, -1)}><ArrowUpIcon size={20} aria-hidden="true" /></button>
              <button type="button" data-ui-control="icon" data-ui-shape="icon" data-control-size="sm"
                aria-label={`Move ${then} and ${now} down`} aria-disabled={index === draft.length - 1}
                disabled={busy} onClick={() => move(index, 1)}><ArrowDownIcon size={20} aria-hidden="true" /></button>
            </div>
          </li>;
        })}
      </ol>
      {listChanged && !loading && <p role="alert">The list has changed. Go back and reopen it to reorder the latest pairs.</p>}
      {error && <p role="alert">{error}</p>}
      <Button type="submit" variant="primary" data-ui-shape="action" disabled={busy || !canSave}>
        {busy ? 'Saving…' : 'Save order'}
      </Button>
    </form>
  </PairScreen>;
}

export function ThenNowDialog({ profile, selectedId, editingPair, onClose }: { profile: Profile; selectedId?: string; editingPair?: TimelinePair; onClose: () => void }) {
  const isMobile = usePresentation() === 'mobile';
  const choices = journeyProjects(profile.projects, false), { profiles } = useServices(), { invalidateProfiles } = useProfileData();
  const available = (id?: string) => id && choices.some(project => project.id === id) ? id : '';
  const { pairs, error: loadError, loading } = useTimelinePairs(profile, true);
  const [then, setThen] = useState(available(editingPair?.then ?? selectedId));
  const [now, setNow] = useState(available(editingPair?.now));
  const [framing, setFraming] = useState<Record<PairSide, ImagePosition | null>>({ then: editingPair?.thenCover ?? null, now: editingPair?.nowCover ?? null });
  const [editingCover, setEditingCover] = useState<PairSide | null>(null);
  const framingChanged = !sameTimelineCoverPosition(framing.then, editingPair?.thenCover)
    || !sameTimelineCoverPosition(framing.now, editingPair?.nowCover);
  const coverUpdate = framingChanged ? { thenCover: framing.then, nowCover: framing.now } : undefined;
  const changed = !editingPair || editingPair.then !== then || editingPair.now !== now || framingChanged;
  const validPair = changed && then !== now && Boolean(available(then) && available(now));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const saving = useRef(false);
  const updateFraming = (side: PairSide, position: ImagePosition | null) => {
    setFraming(current => ({ ...current, [side]: position }));
    setError('');
  };
  const selectedProjects = { then: choices.find(project => project.id === then), now: choices.find(project => project.id === now) };
  const coverProject = editingCover && selectedProjects[editingCover];
  const coverArtwork = coverProject && timelinePairArtwork(coverProject);
  const close = () => {
    if (saving.current) return;
    if (editingCover) setEditingCover(null);
    else if (confirmDelete) {
      setConfirmDelete(false);
      setDeleteError('');
    } else onClose();
  };
  const checkLegacy = () => {
    if (editingPair?.id === 'legacy' &&
      (profile.thenNow?.then !== editingPair.then || profile.thenNow.now !== editingPair.now
        || !sameTimelineCoverPosition(profile.thenNow.thenCover, editingPair.thenCover)
        || !sameTimelineCoverPosition(profile.thenNow.nowCover, editingPair.nowCover))) {
      throw new Error('This pair has changed. Go back and reopen it to see the latest version.');
    }
  };
  const save = async () => {
    if (saving.current || editingCover || confirmDelete || !validPair || loading || loadError) return;
    saving.current = true; setBusy(true); setError('');
    try {
      if (pairs.some(pair => pair.id !== editingPair?.id && pair.then === then && pair.now === now)) throw new Error('This pair already exists.');
      if (editingPair?.id === 'legacy') {
        checkLegacy();
        await profiles.updateProfile(profile.id, { thenNow: { then, now, ...coverUpdate } });
      } else if (editingPair) {
        if (!profiles.updateTimelinePair) throw new Error('Pair editing is not available yet.');
        const expected = [profile.id, editingPair.id, then, now, editingPair] as const;
        if (coverUpdate) await profiles.updateTimelinePair(...expected, coverUpdate);
        else await profiles.updateTimelinePair(...expected);
      } else {
        if (!profiles.addTimelinePair) throw new Error('Multiple Then/Now pairs are not available yet.');
        await profiles.addTimelinePair(profile.id, then, now);
      }
      invalidateProfiles(); onClose();
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The pair could not be saved.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const remove = async (id: string, reportError = setError) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); reportError('');
    try {
      if (id === 'legacy') {
        checkLegacy();
        await profiles.updateProfile(profile.id, { thenNow: null });
      }
      else {
        if (!profiles.removeTimelinePair) throw new Error('This pair could not be removed.');
        await profiles.removeTimelinePair(profile.id, id);
      }
      setConfirmDelete(false);
      invalidateProfiles(); onClose();
    } catch (caught) { reportError(caught instanceof Error ? caught.message : 'This pair could not be removed.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const form = <form className="project-form-content journey-pair-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p>Choose two visible published projects that show how your work has changed. Hiding either project removes the pair.</p>
      {PAIR_SIDES.map(side => <label key={side}>{SIDE_LABELS[side]}<select aria-label={`${SIDE_LABELS[side]} project`} data-ui-shape={isMobile ? 'action' : undefined} value={side === 'then' ? then : now} disabled={busy} onChange={event => {
        const id = event.target.value;
        (side === 'then' ? setThen : setNow)(id);
        updateFraming(side, id === editingPair?.[side] ? editingPair[side === 'then' ? 'thenCover' : 'nowCover'] ?? null : null);
      }}>
        <option value="">Choose a project</option>{choices.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
      </select></label>)}
      {editingPair && <fieldset className="journey-pair-framing">
        <legend>Cover framing</legend>
        <div className="journey-pair-framing-grid">{PAIR_SIDES.map(side => {
          const project = selectedProjects[side];
          if (!project) return null;
          const label = SIDE_LABELS[side];
          const canFrame = Boolean(timelinePairArtwork(project));
          return <div key={side}>
            <TimelinePairCover project={project} position={framing[side]} />
            <Button type="button" variant="secondary" aria-haspopup="dialog" disabled={busy || !canFrame}
              onClick={event => {
                event.currentTarget.focus({ preventScroll: true });
                setEditingCover(side);
              }}>Edit {label} cover</Button>
            {framing[side] && <Button type="button" variant="ghost" aria-label={`Reset ${label} cover`} disabled={busy}
              onClick={() => updateFraming(side, null)}>Reset</Button>}
            {!canFrame && <span className="journey-pair-framing-unavailable">Cover preview unavailable</span>}
          </div>;
        })}</div>
      </fieldset>}
      {loadError && <p role="alert">{loadError}</p>}
      {error && <p role="alert">{error}</p>}
      {!editingPair && pairs.map(pair => <div key={pair.id}>
        <p>{choices.find(project => project.id === pair.then)?.title} → {choices.find(project => project.id === pair.now)?.title}</p>
        <Button variant="ghost" disabled={busy} onClick={() => void remove(pair.id)}>Remove pair</Button>
      </div>)}
      <Button type="submit" variant={editingPair ? 'primary' : 'secondary'} data-ui-shape={isMobile ? 'action' : undefined} disabled={busy || confirmDelete || loading || Boolean(loadError) || !validPair}>
        {busy && !confirmDelete ? 'Saving…' : editingPair ? 'Save changes' : 'Save pair'}
      </Button>
      {editingPair && <Button type="button" variant="danger" data-ui-shape={isMobile ? 'action' : undefined} disabled={busy}
        aria-haspopup="dialog" onClick={event => {
          event.currentTarget.focus({ preventScroll: true });
          setConfirmDelete(true);
        }}>Delete pair</Button>}
    </form>;
  const title = editingPair ? 'Edit Then/Now pair' : 'Then / Now';
  const screen = isMobile
    ? <PairScreen title={title} busy={busy} onClose={close}>{form}</PairScreen>
    : <ProjectFormDialog title={title} titleId="journey-pair-title" onClose={close} closeDisabled={busy}>{form}</ProjectFormDialog>;
  return editingPair ? <>
    {screen}
    {editingCover && coverProject && coverArtwork && <ImageRepositionDialog mobileAuthoring
      title={`Edit ${SIDE_LABELS[editingCover]} cover`} shape="square" source={coverArtwork.src}
      alt={coverProject.coverAlt || coverProject.title} initialPosition={framing[editingCover] ?? undefined}
      saveLabel="Apply framing" onClose={() => setEditingCover(null)}
      onSavePosition={position => {
        updateFraming(editingCover, position);
        setEditingCover(null);
      }} />}
    {confirmDelete && <ConfirmationDialog title="Delete this Then/Now pair?"
      description="This removes the pair from Timeline. Both projects will stay in your catalogue."
      confirmLabel="Delete pair" variant="destructive" pending={busy} pendingLabel="Deleting…"
      error={deleteError} onCancel={close} onConfirm={() => remove(editingPair.id, setDeleteError)} />}
  </> : screen;
}
