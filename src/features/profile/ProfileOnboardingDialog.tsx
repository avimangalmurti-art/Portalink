import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircleIcon, CheckCircle2Icon, XIcon } from 'lucide-react';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ProfileField } from '../../components/profile/ProfileField';
import { AvatarPicker } from '../../components/profile/AvatarPicker';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { useAvatarSelection, useCreateProfile } from './useProfileOnboarding';
import { validateLocation, validateProfileName, LOCATION_MAX_LENGTH, NAME_MAX_LENGTH } from './validation';

/**
 * Onboarding: connecting an authenticated account to the creator profile it
 * will own.
 *
 * This collects identity only — categories, projects, and uploads belong to
 * later systems. Every backend concern sits behind `ProfileService`, so a real
 * Postgres insert and a real Storage upload replace the implementation without
 * touching this component.
 */
type ProfileOnboardingDialogProps = {
  isOpen: boolean;
  onDismiss: () => void;
  onComplete: (profileId: string) => void;
  completionActionLabel?: string;
};
export function ProfileOnboardingDialog({
  isOpen,
  onDismiss,
  onComplete,
  completionActionLabel = 'Open profile'
}: ProfileOnboardingDialogProps) {
  const shouldReduceMotion = useReducedMotion();
  const errorRef = useRef<HTMLDivElement>(null);
  const avatar = useAvatarSelection();
  const create = useCreateProfile();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [isConfirmingDismiss, setIsConfirmingDismiss] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const isDirty = Boolean(name || location || avatar.avatar);
  const isSubmittingRef = useRef(false);
  /**
   * Leaving is only immediate when there is nothing to lose. Once details have
   * been entered, abandoning is confirmed first, and a creation in flight cannot
   * be dismissed out from under itself.
   */
  function requestDismiss() {
    if (create.isLoading) {
      return;
    }
    if (isDirty && create.status !== 'success') {
      setIsConfirmingDismiss(true);
      return;
    }
    onDismiss();
  }
  useModalFocus(isOpen, sheetRef, requestDismiss);
  useEffect(() => {
    // A submission failure takes focus, so it is never missed.
    if (create.status === 'error') {
      errorRef.current?.focus();
    }
  }, [create.status]);
  if (!isOpen) {
    return null;
  }
  const isSubmitting = create.isLoading;
  const isComplete = create.status === 'success' && create.createdProfile !== null;
  const canSubmit = !isSubmitting;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const nextErrors = {
      name: validateProfileName(name),
      location: validateLocation(location)
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }
    if (isSubmittingRef.current) {
      // Already creating: refuse rather than create a second profile.
      return;
    }
    isSubmittingRef.current = true;
    try {
      await create.run({
        name,
        location: location.trim() || undefined,
        avatar: avatar.avatar ?? undefined
      });
    } finally {
      // Released on failure too, so Try again works without reopening the flow.
      isSubmittingRef.current = false;
    }
  }
  return <AnimatePresence>
      <motion.div className="modal-scrim fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" initial={{
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
        requestDismiss();
      }
    }}>
        <motion.section ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-[460px] overflow-y-auto rounded-[16px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-6 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-7 outline-none" initial={shouldReduceMotion ? {
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
            <h2 id="onboarding-title" className="text-[20px] font-semibold leading-tight">{isComplete ? 'Profile ready' : 'Create a profile'}</h2>
            <button type="button" onClick={requestDismiss} disabled={create.isLoading} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40 motion-reduce:transition-none">
              <InterfaceIcon icon={XIcon} weight="medium" />
            </button>
          </div>

          {/* Entered details are never discarded silently. */}
          {isConfirmingDismiss && <div role="alertdialog" aria-label="Discard profile details" className="mt-4 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3.5 py-3">
              <p className="text-[13px] leading-relaxed">Discard what you have entered? Your profile will not be created.</p>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsConfirmingDismiss(false)}>Keep editing</Button>
                <Button variant="danger" size="sm" onClick={() => {
              setIsConfirmingDismiss(false);
              onDismiss();
            }}>Discard</Button>
              </div>
            </div>}

          {isComplete && create.createdProfile ? <div className="mt-5 flex flex-col gap-4">
              <div role="status" className="flex items-start gap-2 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3 py-3 text-[13px] leading-relaxed">
                <CheckCircle2Icon className="mt-[2px] h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{create.createdProfile.name}</span>
                  <span className="mt-0.5 block text-[var(--text-secondary)]">
                    {avatar.storageNotice ? 'This profile is available for the rest of this prototype session. A reload starts over.' : 'Your profile is saved and ready. You can now publish your work.'}
                  </span>
                </span>
              </div>
              {/* Never claim an upload that did not happen, and say why in the
               transport's own words rather than asserting it here. */}
              {avatar.avatar && !create.avatarPersisted && <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  Your chosen picture was previewed only and was not uploaded. {avatar.storageNotice}
                </p>}
              <Button variant="primary" size="lg" fullWidth onClick={() => onComplete(create.createdProfile!.id)}>{completionActionLabel}</Button>
            </div> : <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4">

              {create.status === 'error' && <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {create.error}
                    <button type="submit" disabled={isSubmitting} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
                  </span>
                </div>}

              <AvatarPicker presentation="featured" pending={avatar.avatar} error={avatar.error} disabled={isSubmitting} labelId="onboarding-avatar" storageNotice={avatar.storageNotice} onSelect={avatar.select} onClear={avatar.clear} />

              <ProfileField id="onboarding-name" label="Profile name" value={name} autoComplete="name" maxLength={NAME_MAX_LENGTH} placeholder="Your name" error={fieldErrors.name} disabled={isSubmitting} onChange={(value) => {
            setName(value);
            setFieldErrors((current) => ({
              ...current,
              name: null
            }));
          }} />

              <ProfileField id="onboarding-location" label="Where are you from?" optional value={location} autoComplete="address-level2" maxLength={LOCATION_MAX_LENGTH} placeholder="City" error={fieldErrors.location} disabled={isSubmitting} onChange={(value) => {
            setLocation(value);
            setFieldErrors((current) => ({
              ...current,
              location: null
            }));
          }} />

              <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isSubmitting} disabled={!canSubmit}>
                {isSubmitting ? 'Creating profile…' : 'Create profile'}
              </Button>
            </form>}

        </motion.section>
      </motion.div>
    </AnimatePresence>;
}
