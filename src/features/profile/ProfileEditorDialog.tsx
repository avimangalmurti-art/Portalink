import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircleIcon, CheckCircle2Icon, XIcon } from 'lucide-react';
import { ProfileField } from '../../components/profile/ProfileField';
import { AvatarPicker } from '../../components/profile/AvatarPicker';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ErrorState, LoadingState } from '../../components/ui/StateViews';
import { useProfileEditor } from './useProfileEditor';
import { ProfileLinksEditor } from './ProfileLinksEditor';
import { LOCATION_MAX_LENGTH, NAME_MAX_LENGTH } from './validation';

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
 * authorization is Supabase RLS, later.
 */
type ProfileEditorDialogProps = {
  isOpen: boolean;
  profileId: string | null;
  onClose: () => void;
  onSaved: () => void;
};
export function ProfileEditorDialog({
  isOpen,
  profileId,
  onClose,
  onSaved
}: ProfileEditorDialogProps) {
  const editor = useProfileEditor(profileId, isOpen);
  const shouldReduceMotion = useReducedMotion();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // The profile editor is lightweight and reversible until Save. Dismissal is
  // immediate; reopening reads the canonical saved profile again.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }
      onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);
  useEffect(() => {
    if (isOpen && editor.phase === 'editing') {
      const frame = requestAnimationFrame(() => firstFieldRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [isOpen, editor.phase]);
  useEffect(() => {
    // A failed save takes focus, so it is never missed.
    if (editor.phase === 'failed') {
      errorRef.current?.focus();
    }
  }, [editor.phase]);
  const hasSaved = editor.phase === 'saved';
  useEffect(() => {
    if (!isOpen || !hasSaved) {
      return undefined;
    }
    // Success is only ever reported after the service resolved.
    const timer = window.setTimeout(onSaved, 700);
    return () => window.clearTimeout(timer);
  }, [isOpen, hasSaved, onSaved]);
  if (!isOpen) {
    return null;
  }
  const {
    fields,
    fieldErrors,
    linkErrors
  } = editor;
  const isBusy = editor.phase === 'saving';
  return <AnimatePresence>
      <motion.div className="modal-scrim fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3" initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} transition={{
      duration: shouldReduceMotion ? 0 : 0.18,
      ease: [0.22, 1, 0.36, 1]
    }} onPointerDown={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
        {/* Wide and compact: this edits the profile already on screen, so it
           reads across rather than running down a long single column. */}
        <motion.section role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" className="flex max-h-[calc(100dvh-24px)] w-full max-w-[880px] flex-col overflow-hidden rounded-[16px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-4 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-5" initial={shouldReduceMotion ? {
        opacity: 0
      } : {
        opacity: 0,
        scale: 0.985
      }} animate={{
        opacity: 1,
        scale: 1
      }} exit={shouldReduceMotion ? {
        opacity: 0
      } : {
        opacity: 0,
        scale: 0.99
      }} transition={{
        duration: shouldReduceMotion ? 0 : 0.18,
        ease: [0.22, 1, 0.36, 1]
      }}>
          <div className="flex items-start justify-between gap-3">
            <h2 id="profile-editor-title" className="text-[16px] font-semibold leading-tight">Edit profile</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none">
              <InterfaceIcon icon={XIcon} weight="medium" />
            </button>
          </div>

          {editor.loadError ? <div className="mt-5">
              <ErrorState title="Unable to load profile" description={editor.loadError} />
            </div> : editor.phase === 'loading' || !fields ? <div className="mt-5">
              <LoadingState label="Loading profile" />
            </div> : <form onSubmit={(event) => {
          event.preventDefault();
          if (editor.canSave) {
            void editor.submit();
          }
        }} noValidate className="mt-4 flex min-h-0 flex-col gap-4">
              {editor.phase === 'failed' && <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2 text-[12px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {editor.save.error}
                    {/* Retries the CURRENT values, so edits made after the
                   failure are the ones sent. */}
                    <button type="button" onClick={() => void editor.submit()} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
                  </span>
                </div>}

              {editor.phase === 'saved' && <div role="status" className="flex items-start gap-2 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3 py-2 text-[12px] leading-relaxed">
                  <CheckCircle2Icon className="mt-[2px] h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                  <span>Profile updated.</span>
                </div>}

              <div className="grid min-h-0 grid-cols-[minmax(220px,0.72fr)_minmax(0,1.6fr)] gap-5">
              <div className="flex min-w-0 flex-col gap-4">
              {/* The profile picture is edited here, with the identity it
               belongs to. It rides along on the same save as the fields
               below, so nothing is written until the creator saves — and a
               save that changes only a name leaves the picture alone. What
               becomes of the file is reported in the transport's own words
               rather than asserted here. */}
              <AvatarPicker pending={editor.avatar.avatar} error={editor.avatar.error} currentUrl={editor.profile?.avatar} currentInitials={(editor.profile?.name ?? '').split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('')} disabled={isBusy} storageNotice={editor.avatar.storageNotice} onSelect={editor.avatar.select} onClear={editor.avatar.clear} />

              <ProfileField ref={firstFieldRef} id="profile-editor-name" label="Name" value={fields.name} autoComplete="name" maxLength={NAME_MAX_LENGTH} placeholder="Name shown on profile" error={fieldErrors.name} disabled={isBusy} onChange={(value) => editor.setField('name', value)} />
              <ProfileField id="profile-editor-city" label="City" value={fields.location} optional autoComplete="address-level2" maxLength={LOCATION_MAX_LENGTH} placeholder="City" error={fieldErrors.location} disabled={isBusy} onChange={(value) => editor.setField('location', value)} />
              </div>

              <ProfileLinksEditor links={fields.links} errors={linkErrors} disabled={isBusy} onAdd={editor.addProfileLink} onChange={editor.setProfileLink} onRemove={editor.removeProfileLink} onMove={editor.moveProfileLink} onReorder={editor.reorderProfileLinks} />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--hairline)] pt-3">
                <Button variant="secondary" size="lg" disabled={isBusy} onClick={onClose}>Cancel</Button>
                <Button type="submit" variant="primary" size="lg" isLoading={isBusy} disabled={!editor.canSave}>
                  {isBusy ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>}

        </motion.section>
      </motion.div>
    </AnimatePresence>;
}
