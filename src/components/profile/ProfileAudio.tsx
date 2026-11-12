import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AudioLinesIcon, XIcon } from 'lucide-react';
import {
  PROFILE_AUDIO_ACCEPT, PROFILE_AUDIO_COVER_ACCEPT, PROFILE_AUDIO_COVER_MAX_BYTES, PROFILE_AUDIO_MAX_BYTES,
  type ProfileAudioEdit, type ProfileAudioTrack,
} from '../../features/profile/profileAudio';
import { readProfileAudioTags } from '../../features/profile/profileAudioTags';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ScreenBack, useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';
import { usePresentation } from '../../presentation/usePresentation';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
import './profile-audio.css';

type ProfileAudioProps = {
  track: ProfileAudioTrack | null;
  profileName: string;
  editable?: boolean;
  onSave?: (input: ProfileAudioEdit) => Promise<void>;
  onRemove?: () => Promise<void>;
  disabled?: boolean;
};

function Waveform() {
  return <span className="profile-audio-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>;
}

function TrackCover({ url, playing }: { url: string | null; playing: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className="profile-audio-cover" data-playing={playing || undefined}>
    {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} />
      : <InterfaceIcon icon={AudioLinesIcon} size="xl" />}
    {playing && <div className="profile-audio-cover-wave"><Waveform /></div>}
  </div>;
}

/** The audio stays mounted while the dialog is closed so the shortcut can play from its click gesture. */
export function ProfileAudio({ track, profileName, editable, onSave, onRemove, disabled }: ProfileAudioProps) {
  const presentation = usePresentation();
  const screenActive = useMobileScreenActive();
  const id = useId();
  const audio = useRef<HTMLAudioElement | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const isOpen = useRef(false);
  const attempt = useRef(0);
  const tagAttempt = useRef(0);
  const editedDetails = useRef({ title: false, artist: false });
  const saving = useRef(false);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [draft, setDraft] = useState<ProfileAudioEdit | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readingTags, setReadingTags] = useState(false);
  const [error, setError] = useState('');
  const [playError, setPlayError] = useState('');
  const isActive = screenActive && !disabled;
  const visible = open && isActive;
  const viewport = useDialogViewport(visible);
  const canEdit = Boolean(editable && onSave);
  const hasPlayableAudio = Boolean(track?.enabled && track.audioUrl);
  const showShortcut = canEdit || hasPlayableAudio;
  const editing = draft !== null;
  const bindAudio = useCallback((player: HTMLAudioElement | null) => {
    if (!player) audio.current?.pause();
    audio.current = player;
  }, []);

  const pause = useCallback(() => {
    attempt.current++;
    audio.current?.pause();
    setPlaying(false);
  }, []);

  const dismiss = useCallback(() => {
    isOpen.current = false;
    pause();
    tagAttempt.current++;
    setReadingTags(false);
    setOpen(false);
    setDraft(null);
    setConfirmingRemove(false);
    setError('');
    setPlayError('');
  }, [pause]);

  function close() {
    if (!saving.current) dismiss();
  }

  function back() {
    if (saving.current) return;
    if (confirmingRemove) {
      setConfirmingRemove(false);
      setError('');
    } else if (draft) {
      tagAttempt.current++;
      setReadingTags(false);
      setDraft(null);
      setError('');
    } else close();
  }

  useModalFocus(visible, dialog, back, true);
  useEffect(() => {
    if (!isActive && isOpen.current) dismiss();
  }, [isActive, dismiss]);
  useEffect(() => {
    if (visible) dialog.current?.focus({ preventScroll: true });
  }, [visible, editing, confirmingRemove]);

  function play() {
    const player = audio.current;
    if (!player) return;
    const request = ++attempt.current;
    setPlayError('');
    void player.play().catch((failure: unknown) => {
      if (request !== attempt.current || !isOpen.current) return;
      setPlayError(failure instanceof DOMException && failure.name === 'NotAllowedError'
        ? 'Tap Play to start listening.'
        : 'This audio couldn’t play. Try again.');
    });
  }

  function edit() {
    pause();
    setPlayError('');
    setError('');
    tagAttempt.current++;
    setReadingTags(false);
    editedDetails.current = { title: Boolean(track?.title), artist: Boolean(track?.artist) };
    setDraft({
      title: track?.title ?? '',
      artist: track?.artist ?? '',
      description: track?.description ?? '',
      enabled: track?.enabled ?? true,
    });
  }

  function show(event: React.MouseEvent<HTMLButtonElement>) {
    event.currentTarget.focus({ preventScroll: true });
    isOpen.current = true;
    // The first render can precede the portal host when arriving via a deep link.
    if (hasPlayableAudio && !audio.current) flushSync(() => setOpen(true));
    else setOpen(true);
    if (!track && canEdit) edit();
    else if (hasPlayableAudio) play();
  }

  function selectAudio(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const request = ++tagAttempt.current;
    const fallbackTitle = file.name.replace(/\.[^.]+$/, '').slice(0, 120);
    setDraft(current => current ? {
      ...current, audioFile: file,
      title: editedDetails.current.title ? current.title : fallbackTitle,
      artist: editedDetails.current.artist ? current.artist : '',
    } : current);
    if (file.size > PROFILE_AUDIO_MAX_BYTES) {
      setReadingTags(false);
      setError('Choose an audio file under 50 MB. For a large WAV, export an MP3 or M4A first.');
      return;
    }
    setError('');
    setReadingTags(true);
    void readProfileAudioTags(file).then(tags => {
      if (request !== tagAttempt.current) return;
      setDraft(current => current?.audioFile === file ? {
        ...current,
        title: editedDetails.current.title ? current.title : tags.title?.trim().slice(0, 120) || fallbackTitle,
        artist: editedDetails.current.artist ? current.artist : tags.artist?.trim().slice(0, 120) || '',
      } : current);
    }).catch(() => {
      // Metadata is optional. The chosen file and filename fallback stay available.
    }).finally(() => {
      if (request === tagAttempt.current) setReadingTags(false);
    });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !onSave || readingTags || saving.current) return;
    if (!draft.title.trim()) { setError('Enter a title.'); return; }
    if (!track && !draft.audioFile) { setError('Choose an audio file.'); return; }
    if (draft.audioFile && draft.audioFile.size > PROFILE_AUDIO_MAX_BYTES) {
      setError('Choose an audio file that is 50 MB or smaller.');
      return;
    }
    if (draft.coverFile && draft.coverFile.size > PROFILE_AUDIO_COVER_MAX_BYTES) {
      setError('Choose a cover image that is 5 MB or smaller.');
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave(draft);
      setDraft(null);
    } catch (failure) {
      if (isOpen.current) setError(failure instanceof Error ? failure.message : 'Audio couldn’t be saved. Try again.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (!onRemove || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await onRemove();
      setConfirmingRemove(false);
    } catch (failure) {
      if (isOpen.current) setError(failure instanceof Error ? failure.message : 'Audio couldn’t be removed. Try again.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (!showShortcut) return null;
  const shortcutLabel = !track && canEdit ? 'Add profile audio' : 'Open profile audio';
  const heading = draft ? (track ? 'Edit profile audio' : 'Add profile audio') : track?.title || 'Profile audio';
  return <>
    <button type="button" className="profile-audio-shortcut" disabled={!isActive || busy}
      aria-label={shortcutLabel} title={shortcutLabel} aria-haspopup="dialog" aria-expanded={visible}
      aria-controls={visible ? id : undefined} data-playing={playing || undefined} onClick={show}>
      <Waveform />
    </button>
    <ModalPortal>
      <div ref={viewport} hidden={!visible} data-presentation={presentation} className="profile-audio-overlay modal-scrim"
        onPointerDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) close(); }}
        onClick={event => event.stopPropagation()}>
        {visible && <ScreenBack action={back}>{null}</ScreenBack>}
        <section id={id} ref={dialog} role="dialog" aria-modal={visible || undefined} aria-labelledby={`${id}-title`}
          aria-busy={busy || undefined} tabIndex={-1} data-ui-surface="popup" className="profile-audio-dialog">
          {visible && <header className="profile-audio-header">
            <div>
              <h2 id={`${id}-title`}>{heading}</h2>
              <p>{draft ? profileName : track?.artist || profileName}</p>
            </div>
            <button type="button" data-ui-control="icon" data-control-size="md" data-control-variant="ghost"
              disabled={busy} aria-label="Close profile audio" onClick={close}><InterfaceIcon icon={XIcon} /></button>
          </header>}
          {visible && !draft && track && <div className="profile-audio-details">
            <TrackCover key={track.coverUrl} url={track.coverUrl} playing={playing} />
            {track.description && <p className="profile-audio-description">{track.description}</p>}
            {!track.enabled && <p className="profile-audio-muted">Playback is off.</p>}
            {track.enabled && !track.audioUrl && <p role="status" className="profile-audio-muted">Audio is unavailable.</p>}
          </div>}
          <audio ref={bindAudio} src={hasPlayableAudio ? track?.audioUrl : undefined} controls tabIndex={0} preload="none"
            hidden={!visible || editing || !hasPlayableAudio} className="profile-audio-player"
            aria-label={track ? `Play or pause ${track.title}` : 'Profile audio player'}
            onPlaying={event => {
              if (!isOpen.current || !isActive) { event.currentTarget.pause(); return; }
              setPlaying(true);
              setPlayError('');
            }}
            onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onWaiting={() => setPlaying(false)}
            onError={() => { if (isOpen.current && hasPlayableAudio) { setPlaying(false); setPlayError('This audio couldn’t load.'); } }} />
          {visible && !draft && playError && <div className="profile-audio-play-error">
            <p role="status" className="profile-audio-muted">{playError}</p>
            <button type="button" data-ui-control="button" data-control-size="md" data-control-variant="secondary"
              onClick={() => { if (audio.current?.error) audio.current.load(); play(); }}>Play audio</button>
          </div>}
          {visible && !draft && !track && <p className="profile-audio-muted">No profile audio has been added.</p>}
          {visible && draft && <form className="profile-audio-form" onSubmit={event => { void save(event); }}>
            <fieldset disabled={busy}>
              <label>Title<input value={draft.title} maxLength={120} required onChange={event => {
                editedDetails.current.title = true;
                setDraft({ ...draft, title: event.target.value });
              }} /></label>
              <label>Artist<input value={draft.artist} maxLength={120} onChange={event => {
                editedDetails.current.artist = true;
                setDraft({ ...draft, artist: event.target.value });
              }} /></label>
              <label>Description<textarea rows={3} value={draft.description} maxLength={600} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
              <label>{track ? 'Replace audio file' : 'Audio file'}<input type="file" accept={PROFILE_AUDIO_ACCEPT} onChange={selectAudio} /></label>
              <label>Cover art<input ref={coverInput} type="file" accept={PROFILE_AUDIO_COVER_ACCEPT}
                onChange={event => { const file = event.target.files?.[0]; if (file) setDraft({ ...draft, coverFile: file }); }} /></label>
              {draft.coverFile !== null && (draft.coverFile || track?.coverUrl) && <button type="button" className="profile-audio-remove-cover"
                onClick={() => {
                  if (coverInput.current) {
                    coverInput.current.value = '';
                    coverInput.current.focus({ preventScroll: true });
                  }
                  setDraft({ ...draft, coverFile: null });
                }}>Remove cover art</button>}
              <label className="profile-audio-check"><input type="checkbox" checked={draft.enabled}
                onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />Allow profile playback</label>
            </fieldset>
            {readingTags && <p role="status" className="profile-audio-muted">Reading audio details…</p>}
            <div className="profile-audio-actions">
              <button type="button" data-ui-control="button" data-control-size="md" data-control-variant="secondary" disabled={busy} onClick={back}>Cancel</button>
              <button type="submit" data-ui-control="button" data-control-size="md" data-control-variant="primary" disabled={busy || readingTags}>{busy ? 'Saving…' : 'Save audio'}</button>
            </div>
          </form>}
          {visible && !draft && canEdit && (confirmingRemove
            ? <div className="profile-audio-remove">
              <p>Remove audio from this profile?</p>
              <div className="profile-audio-actions">
                <button type="button" data-ui-control="button" data-control-size="md" data-control-variant="secondary" disabled={busy} onClick={back}>Cancel</button>
                <button type="button" data-ui-control="button" data-control-size="md" data-control-variant="danger" disabled={busy}
                  onClick={() => { void remove(); }}>{busy ? 'Removing…' : 'Remove audio'}</button>
              </div>
            </div> : <div className="profile-audio-actions">
              {track && onRemove && <button type="button" data-ui-control="button" data-control-size="md" data-control-variant="ghost"
                onClick={() => { pause(); setError(''); setConfirmingRemove(true); }}>Remove audio</button>}
              <button type="button" data-ui-control="button" data-control-size="md" data-control-variant="secondary" onClick={edit}>
                {track ? 'Edit audio' : 'Add audio'}
              </button>
            </div>)}
          {visible && error && <p role="alert" className="profile-audio-error">{error}</p>}
        </section>
      </div>
    </ModalPortal>
  </>;
}
