import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
import { ScreenBack, useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircleIcon, CheckCircle2Icon, ChevronLeftIcon, ChevronDownIcon, LockKeyholeIcon } from 'lucide-react';
import { ProfileLocationPicker } from '../../components/profile/ProfileLocationPicker';
import { ProfileField } from '../../components/profile/ProfileField';
import { MobileProfileAvatarEditor } from '../../components/profile/MobileProfileAvatarEditor';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ErrorState, LoadingState } from '../../components/ui/StateViews';
import { useProfileEditor } from './useProfileEditor';
import { ProfileLinksEditor } from './ProfileLinksEditor';
import { NAME_MAX_LENGTH } from './validation';
import { usePresentation } from '../../presentation/usePresentation';
import { useAuth } from '../../contexts/AuthContext';
import './profileEditorPage.css';

function ProfilePreferenceSwitch({ label, checked, disabled, onChange }: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="flex min-h-11 items-center justify-between gap-4 text-sm">
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
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { const state = session.current; state.mounted = true; return () => { state.mounted = false; state.epoch += 1; }; }, []);
  useLayoutEffect(() => {
    // Retained mobile screens must not adopt a completion from an earlier entry.
    if (resetMobile) { resetSave(); setDiscard(false); setMobilePending(pending.current); }
  }, [scope, resetMobile, resetSave]);
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
  useEffect(() => { if (!isMobile || active) headingRef.current?.focus({ preventScroll: true }); }, [isMobile, active]);
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
    fieldErrors,
    linkErrors
  } = editor;
  const isBusy = editor.phase === 'saving' || mobilePending;
  const requestClose = () => { if(isMobile && (!active || session.current.epoch !== epoch))return;if(isBusy || avatarBusy || pending.current)return;if(editor.isDirty)setDiscard(true);else onClose(); };
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
  return <section ref={pageRef} data-presentation={isMobile ? 'mobile' : 'web'} aria-labelledby="profile-editor-title" className="profile-editor-page flex h-full min-h-0 w-full flex-col text-[var(--text-primary)]">
          <header className="profile-editor-header">
            <ScreenBack visibleOnMobile action={requestClose}><button type="button" onClick={requestClose} aria-label="Back" disabled={isBusy || avatarBusy} data-ui-control="icon" data-control-size="md" data-control-variant="ghost" className="profile-editor-back"><InterfaceIcon icon={ChevronLeftIcon} /></button></ScreenBack>
            <h1 ref={headingRef} tabIndex={-1} id="profile-editor-title">Edit profile</h1>
            <button type="submit" form="profile-editor-form" data-ui-control="button" data-control-size="md" data-control-variant="primary" className="profile-editor-save bg-[var(--accent-primary)] text-[var(--accent-foreground)]" disabled={!canSubmit}>{isBusy ? 'Saving…' : 'Save'}</button>
          </header>

          {editor.loadError ? <div className="px-6 pb-6">
              <ErrorState title="Unable to load profile" description={editor.loadError} />
            </div> : editor.phase === 'loading' || !fields ? <div className="px-6 pb-6">
              <LoadingState label="Loading profile" />
            </div> : <form id="profile-editor-form" onSubmit={(event) => {
          event.preventDefault();
          submit();
        }} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="profile-editor-scroll scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
              {editor.phase === 'failed' && <div ref={errorRef} tabIndex={-1} role="alert" className="mb-4 flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2 text-[12px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {editor.save.error}
                    {/* Retries the CURRENT values, so edits made after the
                   failure are the ones sent. */}
                    <button type="button" disabled={!canSubmit} onClick={submit} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
                  </span>
                </div>}

              {editor.phase === 'saved' && <div role="status" className="mb-4 flex items-start gap-2 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3 py-2 text-[12px] leading-relaxed">
                  <CheckCircle2Icon className="mt-[2px] h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                  <span>Profile updated.</span>
                </div>}

              <div className="profile-editor-layout grid min-h-0 grid-cols-1 gap-5 md:grid-cols-[minmax(220px,0.78fr)_minmax(360px,1.55fr)] md:gap-6">
              <section data-profile-editor-section="identity" aria-label="Profile details" className="flex min-w-0 flex-col gap-4 rounded-[14px] p-4">
              {/* The profile picture is edited here, with the identity it
               belongs to. It rides along on the same save as the fields
               below, so nothing is written until the creator saves — and a
               save that changes only a name leaves the picture alone. What
               becomes of the file is reported in the transport's own words
               rather than asserted here. */}
              <MobileProfileAvatarEditor pending={editor.avatar.avatar} error={editor.avatar.error} currentUrl={editor.profile?.avatar} currentInitials={(editor.profile?.name ?? '').split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('')} disabled={isBusy} storageNotice={editor.avatar.storageNotice} onSelect={editor.avatar.select} onClear={editor.avatar.clear} onBusyChange={setAvatarBusy}>
                <label className="mobile-profile-visibility">
                  <LockKeyholeIcon aria-hidden="true" size={20} />
                  <span>Account visibility<strong>{fields.isPrivate ? 'Private' : 'Public'}</strong></span>
                  <ChevronDownIcon aria-hidden="true" size={16} />
                  <select aria-label="Account visibility" value={fields.isPrivate ? 'private' : 'public'} disabled={isBusy} onChange={event => editor.setVisibility(event.target.value === 'private')}>
                    <option value="public">Public</option><option value="private">Private</option>
                  </select>
                </label>
              </MobileProfileAvatarEditor>
              <ProfilePreferenceSwitch label="Show Timeline publicly" checked={fields.showJourney} disabled={isBusy} onChange={editor.setShowJourney} />
              <ProfilePreferenceSwitch label="Show what I cite" checked={fields.showOutgoingCitations} disabled={isBusy} onChange={checked => editor.setCitationPreference('showOutgoingCitations', checked)} />
              <ProfilePreferenceSwitch label="Show who cites me" checked={fields.showIncomingCitations} disabled={isBusy} onChange={checked => editor.setCitationPreference('showIncomingCitations', checked)} />
              <ProfileField ref={firstFieldRef} id="profile-editor-name" label="Name" required={isMobile} value={fields.name} autoComplete="name" maxLength={NAME_MAX_LENGTH} placeholder="Name shown on profile" error={fieldErrors.name} disabled={isBusy} onChange={(value) => editor.setField('name', value)} />
              <ProfileLocationPicker id="profile-editor-city" value={fields.location} error={fieldErrors.location} disabled={isBusy} onChange={value => editor.setField('location', value)} />
              </section>

              <section data-profile-editor-section="links" aria-label="Profile destinations" className="min-w-0 rounded-[14px] p-4">
                <ProfileLinksEditor compact={isMobile} links={fields.links} errors={linkErrors} disabled={isBusy} onAdd={editor.addProfileLink} onChange={editor.setProfileLink} onRemove={editor.removeProfileLink} onReorder={editor.reorderProfileLinks} />
              </section>
              </div>
            </div>

            </form>}
          {discard && <ConfirmationDialog title="Discard changes?" description="Your unsaved profile changes will be lost." confirmLabel="Discard changes" cancelLabel="Keep editing" variant="destructive" onCancel={()=>setDiscard(false)} onConfirm={onClose}/>}
        </section>;
}
