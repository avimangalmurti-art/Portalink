import React, { useEffect, useRef, useState } from 'react';
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
import './profileEditorPage.css';

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
};
export function ProfileEditorPage({
  profileId,
  onClose,
  onSaved
}: ProfileEditorPageProps) {
  const editor = useProfileEditor(profileId, true);
  const isMobile = usePresentation() === 'mobile';
  const [avatarBusy, setAvatarBusy] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    // A failed save takes focus, so it is never missed.
    if (editor.phase === 'failed') {
      errorRef.current?.focus();
    }
  }, [editor.phase]);
  const hasSaved = editor.phase === 'saved';
  useEffect(() => {
    if (!hasSaved) {
      return undefined;
    }
    // Success is only ever reported after the service resolved.
    const timer = window.setTimeout(onSaved, 700);
    return () => window.clearTimeout(timer);
  }, [hasSaved, onSaved]);
  const {
    fields,
    fieldErrors,
    linkErrors
  } = editor;
  const isBusy = editor.phase === 'saving';
  const canSubmit = editor.canSave && !hasSaved && !avatarBusy && !editor.avatar.error;
  return <section data-presentation={isMobile ? 'mobile' : 'web'} aria-labelledby="profile-editor-title" className="profile-editor-page flex h-full min-h-0 w-full flex-col text-[var(--text-primary)]">
          <header className="profile-editor-header">
            <button type="button" onClick={onClose} aria-label="Back" disabled={isBusy || avatarBusy} data-ui-control="icon" data-control-size="md" data-control-variant="ghost" className="profile-editor-back"><InterfaceIcon icon={ChevronLeftIcon} /></button>
            <h1 ref={headingRef} tabIndex={-1} id="profile-editor-title">Edit profile</h1>
            <button type="submit" form="profile-editor-form" data-ui-control="button" data-control-size="md" data-control-variant="primary" className="profile-editor-save bg-[var(--accent-primary)] text-[var(--accent-foreground)]" disabled={!canSubmit}>{isBusy ? 'Saving…' : 'Save'}</button>
          </header>

          {editor.loadError ? <div className="px-6 pb-6">
              <ErrorState title="Unable to load profile" description={editor.loadError} />
            </div> : editor.phase === 'loading' || !fields ? <div className="px-6 pb-6">
              <LoadingState label="Loading profile" />
            </div> : <form id="profile-editor-form" onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            void editor.submit();
          }
        }} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="profile-editor-scroll scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
              {editor.phase === 'failed' && <div ref={errorRef} tabIndex={-1} role="alert" className="mb-4 flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2 text-[12px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {editor.save.error}
                    {/* Retries the CURRENT values, so edits made after the
                   failure are the ones sent. */}
                    <button type="button" disabled={!canSubmit} onClick={() => { if (canSubmit) void editor.submit(); }} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
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
              <label className="flex min-h-11 items-center justify-between gap-4 text-sm">
                Show Journey publicly
                <input type="checkbox" checked={fields.showJourney} disabled={isBusy} onChange={event => editor.setShowJourney(event.target.checked)} />
              </label>

              <ProfileField ref={firstFieldRef} id="profile-editor-name" label="Name" required={isMobile} value={fields.name} autoComplete="name" maxLength={NAME_MAX_LENGTH} placeholder="Name shown on profile" error={fieldErrors.name} disabled={isBusy} onChange={(value) => editor.setField('name', value)} />
              <ProfileField id="profile-editor-headline" label="Headline" value={fields.portfolioHeadline} maxLength={80} placeholder="Your field and what you make" error={fieldErrors.portfolioHeadline} disabled={isBusy} onChange={value => editor.setField('portfolioHeadline', value)} />
              <ProfileField id="profile-editor-school" label="School" value={fields.school} maxLength={120} error={fieldErrors.school} disabled={isBusy} onChange={value => editor.setField('school', value)} />
              <ProfileField id="profile-editor-availability" label="Available" value={fields.availability} maxLength={120} placeholder="Internships · Summer 2027" error={fieldErrors.availability} disabled={isBusy} onChange={value => editor.setField('availability', value)} />
              <label className="flex items-center gap-3"><input type="checkbox" checked={fields.contactEmailPublic} disabled={isBusy} onChange={event => editor.setEmployerFlag('contactEmailPublic',event.target.checked)} />Show a contact email publicly</label>
              {fields.contactEmailPublic && <ProfileField id="profile-editor-contact" label="Public contact email" value={fields.contactEmail} maxLength={254} error={fieldErrors.contactEmail} disabled={isBusy} onChange={value => editor.setField('contactEmail',value)} />}
              <p className="text-sm text-[var(--text-secondary)]">Choose the address you want visitors to use. Turning this off removes the saved address.</p>
              <ProfileLocationPicker id="profile-editor-city" value={fields.location} error={fieldErrors.location} disabled={isBusy} onChange={value => editor.setField('location', value)} />
              </section>

              <section data-profile-editor-section="links" aria-label="Profile destinations" className="min-w-0 rounded-[14px] p-4">
                <ProfileLinksEditor compact={isMobile} links={fields.links} errors={linkErrors} disabled={isBusy} onAdd={editor.addProfileLink} onChange={editor.setProfileLink} onRemove={editor.removeProfileLink} onReorder={editor.reorderProfileLinks} />
              </section>
              </div>
            </div>

            </form>}
        </section>;
}
