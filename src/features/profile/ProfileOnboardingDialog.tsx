import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon, XIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ProfileField } from '../../components/profile/ProfileField';
import { AvatarPicker } from '../../components/profile/AvatarPicker';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { useAvatarSelection, useCreateProfile, useHandleAvailability } from './useProfileOnboarding';
import { formatHandle, normalizeHandle, validateHandle, validateHeadline, validateLocation, validateProfileName, HEADLINE_MAX_LENGTH, LOCATION_MAX_LENGTH, NAME_MAX_LENGTH } from './validation';

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
  const auth = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const avatar = useAvatarSelection();
  const handleCheck = useHandleAvailability();
  const create = useCreateProfile();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [headline, setHeadline] = useState('');
  const [location, setLocation] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [isConfirmingDismiss, setIsConfirmingDismiss] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const isDirty = Boolean(name || handle || headline || location || avatar.avatar);
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
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        requestDismiss();
        return;
      }
      // A modal keeps focus inside itself rather than letting Tab reach the page
      // behind the scrim.
      if (event.key !== 'Tab' || !sheetRef.current) {
        return;
      }
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !sheetRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isDirty, create.isLoading, create.status, onDismiss]);
  useEffect(() => {
    if (isOpen) {
      const frame = requestAnimationFrame(() => firstFieldRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [isOpen]);
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
  const normalizedHandle = normalizeHandle(handle);
  const handleFormatError = handle ? validateHandle(handle) : null;
  // Submission waits for the availability answer rather than racing it.
  const isHandleUnresolved = Boolean(normalizedHandle) && !handleFormatError && (handleCheck.status === 'checking' || handleCheck.status === 'idle' || handleCheck.checkedHandle !== normalizedHandle);
  const canSubmit = !isSubmitting && !isHandleUnresolved && handleCheck.status !== 'unavailable';
  function updateHandle(value: string) {
    setHandle(value);
    setFieldErrors((current) => ({
      ...current,
      handle: null
    }));
    const formatError = validateHandle(value);
    if (formatError) {
      handleCheck.reset();
      return;
    }
    handleCheck.check(value);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const nextErrors = {
      name: validateProfileName(name),
      handle: validateHandle(handle),
      headline: validateHeadline(headline),
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
        handle: normalizedHandle,
        headline,
        location: location.trim() || undefined,
        avatar: avatar.avatar ?? undefined
      });
    } finally {
      // Released on failure too, so Try again works without reopening the flow.
      isSubmittingRef.current = false;
    }
  }
  const handleStatus = (() => {
    if (handleFormatError || !normalizedHandle) {
      return null;
    }
    if (handleCheck.status === 'checking') {
      return {
        tone: 'neutral' as const,
        message: 'Checking availability…',
        icon: <Loader2Icon className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      };
    }
    if (handleCheck.status === 'available' && handleCheck.checkedHandle === normalizedHandle) {
      return {
        tone: 'positive' as const,
        message: `${formatHandle(normalizedHandle)} is available.`,
        icon: <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      };
    }
    if (handleCheck.status === 'unavailable') {
      return {
        tone: 'negative' as const,
        message: handleCheck.message ?? 'That handle is not available.',
        icon: <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      };
    }
    if (handleCheck.status === 'error') {
      return {
        tone: 'negative' as const,
        message: handleCheck.message ?? 'Could not check that handle.',
        icon: <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      };
    }
    return null;
  })();
  return <AnimatePresence>
      <motion.div className="modal-scrim fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/55 px-4 py-8 sm:items-center" initial={{
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
        <motion.section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="w-full max-w-[460px] rounded-[16px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-6 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-7" initial={shouldReduceMotion ? {
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
                  <span className="block font-semibold">{create.createdProfile.name} · {create.createdProfile.handle}</span>
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
              <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                Signed in as {auth.user?.email}. The public profile is separate from the account and holds the work you publish.
              </p>

              {create.status === 'error' && <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {create.error}
                    <button type="button" onClick={() => void create.retry()} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
                  </span>
                </div>}

              <AvatarPicker pending={avatar.avatar} error={avatar.error} disabled={isSubmitting} labelId="onboarding-avatar" storageNotice={avatar.storageNotice} onSelect={avatar.select} onClear={avatar.clear} />

              <ProfileField ref={firstFieldRef} id="onboarding-name" label="Profile name" value={name} autoComplete="name" maxLength={NAME_MAX_LENGTH} placeholder="How your work is credited" error={fieldErrors.name} disabled={isSubmitting} onChange={(value) => {
            setName(value);
            setFieldErrors((current) => ({
              ...current,
              name: null
            }));
          }} />

              <ProfileField id="onboarding-handle" label="Handle" value={handle} prefix="@" autoComplete="username" placeholder="yourname" hint="Letters, numbers, and underscores. This is how people find you." error={fieldErrors.handle ?? handleFormatError} status={handleStatus} disabled={isSubmitting} onChange={updateHandle} />
              {handleCheck.status === 'error' && <button type="button" onClick={handleCheck.retry} className="self-start rounded-[6px] text-[12px] font-semibold text-[var(--accent-text)] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Check again</button>}

              <ProfileField id="onboarding-headline" label="Headline" value={headline} maxLength={HEADLINE_MAX_LENGTH} placeholder="What you make, in one line" error={fieldErrors.headline} disabled={isSubmitting} onChange={(value) => {
            setHeadline(value);
            setFieldErrors((current) => ({
              ...current,
              headline: null
            }));
          }} />

              <ProfileField id="onboarding-location" label="Portalink city" optional value={location} autoComplete="address-level2" maxLength={LOCATION_MAX_LENGTH} placeholder="City for location discovery" error={fieldErrors.location} disabled={isSubmitting} onChange={(value) => {
            setLocation(value);
            setFieldErrors((current) => ({
              ...current,
              location: null
            }));
          }} />

              <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isSubmitting} disabled={!canSubmit}>
                {isSubmitting ? 'Creating profile…' : 'Create profile'}
              </Button>
              {isHandleUnresolved && <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">Checking handle availability…</p>}
            </form>}

          {avatar.storageNotice && <p className="mt-6 border-t border-[var(--hairline)] pt-4 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              Prototype profile creation — {avatar.storageNotice} Handle availability is checked against local sample profiles only.
            </p>}
        </motion.section>
      </motion.div>
    </AnimatePresence>;
}
