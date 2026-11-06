import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
import { ScreenBack, useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircleIcon, CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { CreatorAvatar } from '../../components/profile/CreatorAvatar';
import { ProfilePersonalDetails } from './ProfilePersonalDetails';
import { ProfileLinkDetails } from './ProfileLinkDetails';
import { useProfileLeaveGuard } from './useProfileLeaveGuard';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ErrorState, LoadingState } from '../../components/ui/StateViews';
import { useProfileEditor } from './useProfileEditor';
import { ProfileLinksEditor } from './ProfileLinksEditor';
import { validateLocation, validateProfileName } from './validation';
import { usePresentation } from '../../presentation/usePresentation';
import { useAuth } from '../../contexts/AuthContext';
import './profileEditorPage.css';

function ProfilePreferenceSwitch({ label, checked, disabled, onChange }: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="profile-settings-row profile-settings-switch-row">
    <span>{label}</span>
    <span className="profile-preference-switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span className="profile-preference-switch-track" aria-hidden="true" />
    </span>
  </label>;
}

/**
 * The owner's identity editor.
 *
 * Scope comes from the profile header: name, picture, and the destinations behind
 * the marks it already shows. Nothing derived or system-generated — followers,
 * gaze time, project counts, the handle — appears here.
 *
 * Presentation only: every rule, request, and state transition comes from
 * `useProfileEditor`. Owner-only rendering is decided by the caller from
 * `auth.viewerProfileId`, and remains frontend permission UX — real
 * authorization remains enforced by the existing profile service and Supabase RLS.
 */
type ProfileEditorPageProps = {
  profileId: string | null;
  onClose: () => void;
  onSaved: () => void;
  returnFocusTarget?: { opener: HTMLElement | null; main: HTMLElement | null };
};
export function ProfileEditorPage({
  profileId,
  onClose,
  onSaved,
  returnFocusTarget
}: ProfileEditorPageProps) {
  const isMobile = usePresentation() === 'mobile';
  const active = useMobileScreenActive();
  const accountId = useAuth().user?.id;
  const editor = useProfileEditor(profileId, true, isMobile);
  const resetSave = editor.save.reset;
  const [discard, setDiscard] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [mobilePending, setMobilePending] = useState(false);
  const [screen, setScreen] = useState<'overview' | 'personal' | 'link'>('overview');
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [childDirty, setChildDirty] = useState(false);
  const [childValid, setChildValid] = useState(false);
  const owner = JSON.stringify([profileId, accountId]);
  const scope = JSON.stringify([isMobile, isMobile ? active : true, profileId, accountId]);
  const session = useRef({ scope, owner, epoch: 0, mobile: isMobile, mounted: true });
  const resetMobile = isMobile || session.current.mobile;
  if (session.current.scope !== scope) { session.current.scope = scope; session.current.epoch += 1; }
  session.current.mobile = isMobile;
  session.current.owner = owner;
  const epoch = session.current.epoch;
  const pending = useRef(false);
  const attempt = useRef<{ epoch: number; returned: boolean } | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { const state = session.current; state.mounted = true; return () => { state.mounted = false; state.epoch += 1; }; }, []);
  useLayoutEffect(() => {
    // Retained mobile screens must not adopt a completion from an earlier entry.
    if (resetMobile) { resetSave(); setDiscard(false); setMobilePending(pending.current); }
  }, [scope, resetMobile, resetSave]);
  useLayoutEffect(() => {
    // A presentation resize keeps the same child transaction mounted. Only an
    // owner/entry change abandons its scratch draft.
    setScreen('overview'); setEditingLinkId(null); setChildDirty(false); setChildValid(false);
  }, [owner, active]);
  const returnFocus = useRef<{ opener: HTMLElement | null; main: HTMLElement | null } | null>(null);
  useLayoutEffect(() => {
    if (!isMobile || !active) return;
    const page = pageRef.current;
    if (!returnFocus.current) {
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const origin = opener && opener !== document.body && !page?.contains(opener) ? opener : null;
      returnFocus.current = returnFocusTarget ?? { opener: origin, main: origin?.closest('main') ?? null };
    }
    const state = session.current;
    return () => {
      const leavingFocus = document.activeElement;
      let frame = 0;
      const stop = () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', stop, true); document.removeEventListener('keydown', stop, true); };
      document.addEventListener('pointerdown', stop, true); document.addEventListener('keydown', stop, true);
      frame = requestAnimationFrame(() => {
        stop();
        if (!state.mobile || state.owner !== owner) return;
        const current = document.activeElement;
        if (current !== document.body && current !== leavingFocus && !page?.contains(current)) return;
        if (document.querySelector('[aria-modal="true"]')) return;
        const available = (node: HTMLElement | null | undefined) => node?.isConnected && !node.closest('[inert], [aria-hidden="true"]') && !node.matches(':disabled') && node.getClientRects().length > 0;
        const origin = returnFocus.current;
        if (!available(origin?.main)) return;
        const target = available(origin?.opener) ? origin?.opener : available(origin?.main) ? origin?.main : null;
        target?.focus({ preventScroll: true });
      });
    };
  }, [isMobile, active, owner, returnFocusTarget]);
  useEffect(() => { if (!isMobile || active) headingRef.current?.focus({ preventScroll: true }); }, [isMobile, active, screen]);
  useEffect(() => {
    // A failed save takes focus, so it is never missed.
    if (editor.phase === 'failed' && (!isMobile || (active && attempt.current?.epoch === epoch))) {
      errorRef.current?.focus();
    }
  }, [editor.phase, isMobile, active, epoch]);
  const hasSaved = editor.phase === 'saved';
  useEffect(() => {
    if (!hasSaved) {
      return undefined;
    }
    if (isMobile) {
      const current = attempt.current;
      if (active && session.current.mounted && current?.epoch === epoch && !current.returned) {
        current.returned = true;
        onSaved();
      }
      return;
    }
    // Resizing cannot transfer a pending mobile attempt into WEB's timer.
    if (attempt.current) return;
    // Success is only ever reported after the service resolved.
    const timer = window.setTimeout(onSaved, 700);
    return () => window.clearTimeout(timer);
  }, [hasSaved, onSaved, isMobile, active, epoch]);
  const {
    fields,
    linkErrors
  } = editor;
  const isBusy = editor.phase === 'saving' || mobilePending;
  const leave = useProfileLeaveGuard({ enabled: (!isMobile || active) && !hasSaved && (editor.isDirty || childDirty || avatarBusy || isBusy), blocked: isBusy || avatarBusy, onRequestDiscard: () => setDiscard(true), onChildBack: (!isMobile || active) && !hasSaved && screen !== 'overview' ? () => { setScreen('overview'); setEditingLinkId(null); setChildDirty(false); setChildValid(false); } : undefined });
  const closeChild = () => { setScreen('overview'); setEditingLinkId(null); setChildDirty(false); setChildValid(false); };
  const openPersonal = () => { setChildDirty(false); setChildValid(Boolean(fields && !validateProfileName(fields.name) && !validateLocation(fields.location))); setScreen('personal'); };
  const openLink = (id: string | null) => { setEditingLinkId(id); setChildDirty(false); setChildValid(false); setScreen('link'); };
  const requestClose = () => {
    if (isMobile && (!active || session.current.epoch !== epoch)) return;
    if (isBusy || avatarBusy || pending.current) return;
    if (screen !== 'overview') closeChild();
    else leave.requestLeave(onClose);
  };
  const canSubmit = editor.canSave && !hasSaved && !mobilePending && !avatarBusy && !editor.avatar.error;
  const submit = () => {
    if (!canSubmit || pending.current) return;
    if ((isMobile || session.current.mobile || attempt.current) && session.current.epoch !== epoch) return;
    if (!isMobile) {
      attempt.current = null;
      pending.current = true;
      void editor.submit().finally(() => { pending.current = false; if (session.current.mounted) setMobilePending(false); });
      return;
    }
    if (!active || !session.current.mounted || session.current.epoch !== epoch) return;
    pending.current = true;
    attempt.current = { epoch, returned: false };
    setMobilePending(true);
    void editor.submit().finally(() => { pending.current = false; if (session.current.mounted) setMobilePending(false); });
  };
  const selectedLink = fields?.links.find(link => link.id === editingLinkId) ?? null;
  const title = screen === 'personal' ? 'Personal details' : screen === 'link' ? (editingLinkId ? 'Edit link' : 'Add link') : 'Edit profile';
  return <section ref={pageRef} data-presentation={isMobile ? 'mobile' : 'web'} data-profile-editor-screen={screen} aria-labelledby="profile-editor-title" className="profile-editor-page flex h-full min-h-0 w-full flex-col">
    <header className="profile-editor-header">
      <div className="profile-editor-toolbar">
        <ScreenBack visibleOnMobile action={requestClose}><button type="button" onClick={requestClose} aria-label={screen === 'overview' ? 'Back' : 'Back to Edit profile'} disabled={isBusy || avatarBusy} className="profile-editor-back"><InterfaceIcon icon={ChevronLeftIcon} />{screen !== 'overview' && <span>Edit profile</span>}</button></ScreenBack>
        {screen !== 'overview' && <h1 ref={headingRef} tabIndex={-1} id="profile-editor-title">{title}</h1>}
        {screen === 'overview' ? <button type="submit" form="profile-editor-form" className="profile-editor-save" disabled={!canSubmit}>{isBusy ? 'Saving…' : 'Save'}</button> : <button type="submit" form={screen === 'personal' ? 'profile-personal-form' : 'profile-link-form'} className="profile-editor-save" disabled={!childValid || isBusy || avatarBusy}>Done</button>}
      </div>
      {screen === 'overview' && <h1 ref={headingRef} tabIndex={-1} id="profile-editor-title" className="profile-editor-large-title">Edit profile</h1>}
    </header>
    {editor.loadError ? <div className="profile-settings-content"><ErrorState title="Unable to load profile" description={editor.loadError} /></div> : editor.phase === 'loading' || !fields ? <div className="profile-settings-content"><LoadingState label="Loading profile" /></div> :
      <div className="profile-editor-scroll scrollbar-overlay" key={screen}>
        {screen === 'overview' ? <form id="profile-editor-form" className="profile-settings-content" noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
          {editor.phase === 'failed' && <div ref={errorRef} tabIndex={-1} role="alert" className="profile-settings-notice profile-settings-error">
            <AlertCircleIcon aria-hidden="true" size={20} /><div>{editor.save.error}<button type="button" disabled={!canSubmit} onClick={submit} className="profile-settings-action">Try again</button></div>
          </div>}
          {editor.phase === 'saved' && <div role="status" className="profile-settings-notice"><CheckCircle2Icon aria-hidden="true" size={20} />Profile updated.</div>}
          {editor.isDirty && !editor.canSave && !isBusy && <p className="profile-settings-error" role="alert">Review your name, location and links before saving.</p>}
          <div className="profile-settings-group">
            <button type="button" className="profile-settings-row profile-settings-identity" onClick={openPersonal} disabled={isBusy} aria-label={`Personal details, ${fields.name}`}>
              <span className="profile-settings-avatar"><CreatorAvatar name={fields.name} avatar={editor.avatar.avatar?.previewUrl ?? editor.profile?.avatar} shape="squircle" className="h-full w-full" /></span>
              <span className="profile-settings-identity-copy"><strong>{fields.name}</strong>{fields.location && <span>{fields.location}</span>}</span><ChevronRightIcon className="profile-settings-chevron" aria-hidden="true" />
            </button>
          </div>
          <section className="profile-settings-section" aria-labelledby="profile-visibility-heading">
            <h2 id="profile-visibility-heading" className="profile-settings-section-title">Visibility</h2>
            <div className="profile-settings-group">
              <label className="profile-settings-row profile-settings-visibility"><span className="profile-settings-label">Account visibility</span><span className="profile-settings-value">{fields.isPrivate ? 'Private' : 'Public'}</span><ChevronRightIcon className="profile-settings-chevron" aria-hidden="true" /><select aria-label="Account visibility" value={fields.isPrivate ? 'private' : 'public'} disabled={isBusy} onChange={event => editor.setVisibility(event.target.value === 'private')}><option value="public">Public</option><option value="private">Private</option></select></label>
              <ProfilePreferenceSwitch label="Show Timeline publicly" checked={fields.showJourney} disabled={isBusy} onChange={editor.setShowJourney} />
              <ProfilePreferenceSwitch label="Show what I cite" checked={fields.showOutgoingCitations} disabled={isBusy} onChange={checked => editor.setCitationPreference('showOutgoingCitations', checked)} />
              <ProfilePreferenceSwitch label="Show who cites me" checked={fields.showIncomingCitations} disabled={isBusy} onChange={checked => editor.setCitationPreference('showIncomingCitations', checked)} />
            </div>
          </section>
          <ProfileLinksEditor links={fields.links} errors={linkErrors} disabled={isBusy} onAdd={() => openLink(null)} onEdit={openLink} onRemove={editor.removeProfileLink} onReorder={editor.reorderProfileLinks} />
        </form> : screen === 'personal' ? <ProfilePersonalDetails name={fields.name} location={fields.location} avatar={editor.avatar.avatar} currentUrl={editor.profile?.avatar} disabled={isBusy} onBusyChange={setAvatarBusy} onDirtyChange={setChildDirty} onValidityChange={setChildValid} onDone={details => {
          if (details.avatar && !editor.avatar.select(details.avatar.file, { originalSource: details.avatar.originalSource, crop: details.avatar.crop })) return false;
          editor.setField('name', details.name); editor.setField('location', details.location);
          closeChild(); return true;
        }} /> : <ProfileLinkDetails link={selectedLink} disabled={isBusy} onDirtyChange={setChildDirty} onValidityChange={setChildValid} onDone={value => {
          if (editingLinkId) editor.setProfileLink(editingLinkId, value);
          else if (!editor.addProfileLink(value)) return;
          closeChild();
        }} onRemove={() => { if (editingLinkId) editor.removeProfileLink(editingLinkId); closeChild(); }} />}
      </div>}
    {discard && <ConfirmationDialog title="Discard changes?" description="Your unsaved profile changes will be lost." confirmLabel="Discard changes" cancelLabel="Keep editing" variant="destructive" onCancel={() => { setDiscard(false); leave.cancelLeave(); }} onConfirm={() => { setDiscard(false); leave.confirmLeave(); }} />}
  </section>;
}
