import React, { useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, CheckCircle2Icon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AccountWelcomeSurface, type AccountAppearanceProps } from '../../components/auth/AccountWelcomeSurface';
import { MobileOnboardingAction, MobileOnboardingWelcome } from '../../components/auth/MobileOnboarding';
import { readRegistrationAvatar, removeRegistrationAvatar } from '../auth/registration';
import { DEFAULT_PUBLIC_APPEARANCE } from '../../utils/publicAppearance';
import type { PreparedAvatar } from '../../types/profile';
import { ProfileField } from '../../components/profile/ProfileField';
import { ProfileVisibilityField } from '../../components/profile/ProfileVisibilityField';
import { usePresentation } from '../../presentation/usePresentation';
import { AvatarPicker } from '../../components/profile/AvatarPicker';
import { Button } from '../../components/ui/Button';
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
type ProfileOnboardingDialogProps = AccountAppearanceProps & {
  isOpen: boolean;
  onDismiss: () => void;
  onComplete: (profileId: string) => void;
  completionActionLabel?: string;
};
export function ProfileOnboardingDialog({
  isOpen,
  onDismiss,
  onComplete,
  completionActionLabel = 'Open profile',
  theme,
  accentColor,
  onAccentColorChange,
  highContrast,
  onHighContrastChange,
  reduceTranslucency,
  onReduceTranslucencyChange
}: ProfileOnboardingDialogProps) {
  const auth = useAuth();
  const isMobile = usePresentation() === 'mobile';
  const registration = useRef(auth.user?.registration).current;
  const [draftLoading, setDraftLoading] = useState(Boolean(registration));
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const completed = useRef(false);
  const cleaned = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const avatar = useAvatarSelection();
  const create = useCreateProfile();
  const selectAvatar = avatar.select;
  const [name, setName] = useState(registration?.name ?? '');
  const [location, setLocation] = useState(registration?.location ?? '');
  const [isPrivate, setIsPrivate] = useState(registration?.isPrivate === true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const isDirty = Boolean(name || location || isPrivate || avatar.avatar);
  const isSubmittingRef = useRef(false);
  const createRef = useRef(create.run);
  createRef.current = create.run;
  useEffect(() => {
    if (!isOpen || !registration || autoStarted.current) return;
    let current = true;
    const restore = async () => {
      await Promise.resolve();
      if (!current) return;
      let pending: PreparedAvatar | undefined;
      if (registration.hasAvatar) {
        const saved = await readRegistrationAvatar(registration.id).catch(() => null);
        if (!current) return;
        if (!saved) {
          setDraftNotice('Choose your profile image again, or continue without one.');
          setDraftLoading(false);
          return;
        }
        selectAvatar(saved.file, { originalSource: saved.originalSource, crop: saved.crop });
        pending = { file: saved.file, previewUrl: '', fileName: saved.file.name,
          sizeBytes: saved.file.size, isPersisted: false, originalSource: saved.originalSource, crop: saved.crop };
      }
      if (!current) return;
      autoStarted.current = true;
      setDraftLoading(false);
      await createRef.current({ name: registration.name, location: registration.location,
        isPrivate: registration.isPrivate === true,
        avatar: pending, creationKey: registration.id,
        publicAppearance: { ...DEFAULT_PUBLIC_APPEARANCE, accentColor: registration.accentColor } });
    };
    void restore();
    return () => { current = false; };
  }, [isOpen, registration, selectAvatar]);
  useEffect(() => {
    if (!registration || create.status !== 'success' || !create.createdProfile) return;
    if (!cleaned.current) { cleaned.current = true; void removeRegistrationAvatar(registration.id); }
    // Mobile pauses at Welcome. Desktop retains its existing automatic return.
    if (!isMobile && !completed.current) {
      completed.current = true;
      onComplete(create.createdProfile.id);
    }
  }, [registration, create.status, create.createdProfile, onComplete, isMobile]);
  useEffect(() => {
    // A submission failure takes focus, so it is never missed.
    if (create.status === 'error') {
      errorRef.current?.focus();
    }
  }, [create.status]);
  if (!isOpen) {
    return null;
  }
  const isSubmitting = create.isLoading || draftLoading;
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
    if (Object.values(nextErrors).some(Boolean) || avatar.error) {
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
        isPrivate,
        avatar: avatar.avatar ?? undefined,
        creationKey: registration?.id,
        publicAppearance: { ...DEFAULT_PUBLIC_APPEARANCE, accentColor }
      });
    } finally {
      // Released on failure too, so Try again works without reopening the flow.
      isSubmittingRef.current = false;
    }
  }
  const complete = () => {
    if (!create.createdProfile || completed.current) return;
    completed.current = true;
    onComplete(create.createdProfile.id);
  };
  return <AccountWelcomeSurface mobileOnboarding={isMobile} theme={theme} showAppearance={!isMobile} title={isMobile ? (isComplete ? 'Welcome to Portalink' : 'Create your profile') : isComplete ? 'Account ready' : registration ? 'Finishing your account' : 'Finish your account'} accentColor={accentColor} onAccentColorChange={onAccentColorChange}
    highContrast={highContrast} onHighContrastChange={onHighContrastChange} reduceTranslucency={reduceTranslucency} onReduceTranslucencyChange={onReduceTranslucencyChange}
    busy={isSubmitting} dirty={isDirty && !isComplete} onDismiss={onDismiss}>
          {(draftLoading || (registration && create.isLoading)) && <p role="status" className="py-4 text-center text-sm text-[var(--text-secondary)]">Finishing your account…</p>}
          {draftNotice && <p role="status" className="mb-4 text-sm text-[var(--text-secondary)]">{draftNotice}</p>}
          {isComplete && create.createdProfile && isMobile ? <MobileOnboardingWelcome isPrototype={auth.session?.isPrototype} onComplete={complete} notice={avatar.avatar && !create.avatarPersisted ? <p role="status" className="text-sm text-[var(--text-secondary)]">Your chosen picture was not uploaded. {avatar.storageNotice}</p> : undefined} /> : isComplete && create.createdProfile ? <div className="mt-5 flex flex-col gap-4">
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
            </div> : (draftLoading || (registration && create.isLoading)) ? null : <form onSubmit={submit} noValidate className={isMobile ? 'mobile-onboarding-form' : 'mt-5 flex flex-col gap-4'}>

              {create.status === 'error' && <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {create.error}
                    <button type="submit" disabled={isSubmitting} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
                  </span>
                </div>}

              <AvatarPicker presentation={isMobile ? 'onboarding' : 'featured'} pending={avatar.avatar} error={avatar.error} disabled={isSubmitting} labelId="onboarding-avatar" storageNotice={avatar.storageNotice} onSelect={avatar.select} onClear={avatar.clear} />

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

              {isMobile && <ProfileVisibilityField id="onboarding-visibility" isPrivate={isPrivate} onChange={setIsPrivate} disabled={isSubmitting} />}

              {isMobile ? <MobileOnboardingAction busy={isSubmitting}>{isSubmitting ? 'Finishing setup…' : 'Continue'}</MobileOnboardingAction> : <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isSubmitting} disabled={!canSubmit}>
                {isSubmitting ? 'Finishing setup…' : 'Finish setup'}
              </Button>}
            </form>}

    </AccountWelcomeSurface>;
}
