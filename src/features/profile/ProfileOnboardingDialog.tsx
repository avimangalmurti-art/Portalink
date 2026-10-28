import { useServices } from '../../contexts/ServicesContext';
import { createProfileHandle } from '../../utils/profileHandle';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, CheckCircle2Icon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AccountWelcomeSurface, type AccountAppearanceProps } from '../../components/auth/AccountWelcomeSurface';
import { MobileOnboardingAction } from '../../components/auth/MobileOnboarding';
import { readRegistrationAvatar, removeRegistrationDraft } from '../auth/registration';
import { DEFAULT_PUBLIC_APPEARANCE } from '../../utils/publicAppearance';
import type { PreparedAvatar } from '../../types/profile';
import { ProfileField, type ProfileFieldStatus } from '../../components/profile/ProfileField';
import { ProfileVisibilityField } from '../../components/profile/ProfileVisibilityField';
import { ProfileLocationPicker } from '../../components/profile/ProfileLocationPicker';
import { usePresentation } from '../../presentation/usePresentation';
import { Button } from '../../components/ui/Button';
import { useAvatarSelection, useCreateProfile } from './useProfileOnboarding';
import { normalizeHandle, validateHandle, validateLocation, validateProfileName, NAME_MAX_LENGTH } from './validation';

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
  theme,
  accentColor,
  onAccentColorChange,
  highContrast,
  onHighContrastChange,
  reduceTranslucency,
  onReduceTranslucencyChange
}: ProfileOnboardingDialogProps) {
  const auth = useAuth();
  const { profiles } = useServices();
  const isMobile = usePresentation() === 'mobile';
  const [registration, setRegistration] = useState(auth.user?.registration);
  const [draftLoading, setDraftLoading] = useState(Boolean(registration));
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [missingSavedAvatar, setMissingSavedAvatar] = useState(false);
  const touched = useRef({ name: false, handle: false, location: false, isPrivate: false, avatar: false });
  const autoStarted = useRef(false);
  const completed = useRef(false);
  const cleaned = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const avatar = useAvatarSelection();
  const create = useCreateProfile();
  const selectAvatar = avatar.select;
  const [name, setName] = useState(registration?.name ?? '');
  const [requestedHandle, setRequestedHandle] = useState<string | null>(registration?.handle ?? null);
  const handle = normalizeHandle(requestedHandle ?? createProfileHandle(name));
  const [submitPending, setSubmitPending] = useState(false);
  const [handleAvailability, setHandleAvailability] = useState<{ scope: object; status: 'checking' | 'available' | 'taken' | 'error'; message: string } | null>(null);
  const accountId = auth.user?.id ?? null;
  const checkPublicHandle = profiles.checkPublicHandle;
  const handleScope = useRef({ handle, accountId, isOpen, checkPublicHandle });
  if (handleScope.current.handle !== handle || handleScope.current.accountId !== accountId || handleScope.current.isOpen !== isOpen || handleScope.current.checkPublicHandle !== checkPublicHandle) {
    handleScope.current = { handle, accountId, isOpen, checkPublicHandle };
  }
  const mounted = useRef(true);
  const handleRequest = useRef<{ scope: object; promise: Promise<boolean> } | null>(null);
  const handleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; handleScope.current = { ...handleScope.current }; };
  }, []);
  const checkHandle = useCallback((): Promise<boolean> => {
    if (handleDebounce.current !== null) { clearTimeout(handleDebounce.current); handleDebounce.current = null; }
    const scope = handleScope.current;
    const current = () => mounted.current && scope === handleScope.current && scope.isOpen;
    if (!current()) return Promise.resolve(false);
    const invalid = validateHandle(scope.handle);
    if (invalid) return Promise.resolve(false);
    if (handleRequest.current?.scope === scope) return handleRequest.current.promise;
    setHandleAvailability({ scope, status: 'checking', message: 'Checking availability…' });
    const promise = Promise.resolve().then(() => scope.checkPublicHandle?.(scope.handle) ?? 'unavailable').then(value => {
      if (!current()) return false;
      const available = value === 'available';
      setHandleAvailability({ scope, status: available ? 'available' : value === 'taken' ? 'taken' : 'error', message: available ? 'Available' : value === 'taken' ? 'That handle is already taken.' : 'Could not check availability. Try again.' });
      if (!available && handleRequest.current?.scope === scope) handleRequest.current = null;
      return available;
    }).catch(() => {
      if (current()) {
        setHandleAvailability({ scope, status: 'error', message: 'Could not check availability. Try again.' });
        if (handleRequest.current?.scope === scope) handleRequest.current = null;
      }
      return false;
    });
    handleRequest.current = { scope, promise };
    return promise;
  }, []);
  const [location, setLocation] = useState(registration?.location ?? '');
  const [isPrivate, setIsPrivate] = useState(registration?.isPrivate === true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const isDirty = Boolean(name || location || isPrivate || avatar.avatar);
  const isSubmittingRef = useRef(false);
  const createRef = useRef(create.run);
  createRef.current = create.run;
  useEffect(() => {
    if ((isMobile || !registration) && create.status === 'success' && create.createdProfile && !completed.current) {
      completed.current = true;
      onComplete(create.createdProfile.id);
    }
  }, [isMobile, registration, create.status, create.createdProfile, onComplete]);
  useEffect(() => {
    if (missingSavedAvatar && avatar.avatar && !avatar.error) {
      setMissingSavedAvatar(false);
      setDraftNotice(null);
    }
  }, [missingSavedAvatar, avatar.avatar, avatar.error]);
  useEffect(() => {
    const incoming = auth.user?.registration;
    if (registration || !incoming) return;
    // Metadata can arrive after this surface opens. Hydrate once for this
    // account without replacing any edits already made in the form.
    setRegistration(incoming);
    if (!touched.current.name) setName(incoming.name);
    if (!touched.current.handle && incoming.handle) setRequestedHandle(incoming.handle);
    if (!touched.current.location) setLocation(incoming.location);
    if (!touched.current.isPrivate) setIsPrivate(incoming.isPrivate === true);
    setDraftLoading(true);
  }, [auth.user?.registration, registration]);
  useEffect(() => {
    if (!isOpen || !registration || autoStarted.current) return;
    let current = true;
    const restore = async () => {
      await Promise.resolve();
      if (!current) return;
      let pending: PreparedAvatar | undefined;
      if (registration.hasAvatar && !touched.current.avatar) {
        const saved = await readRegistrationAvatar(registration.id).catch(() => null);
        if (!current) return;
        if (!saved) {
          setDraftNotice('Your saved profile picture could not be restored yet. Your other details are still here. Try restoring it again.');
          setMissingSavedAvatar(true);
          setDraftLoading(false);
          return;
        }
        setMissingSavedAvatar(false);
        setDraftNotice(null);
        selectAvatar(saved.file, { originalSource: saved.originalSource, crop: saved.crop });
        pending = { file: saved.file, previewUrl: '', fileName: saved.file.name,
          sizeBytes: saved.file.size, isPersisted: false, originalSource: saved.originalSource, crop: saved.crop };
      }
      if (!current) return;
      autoStarted.current = true;
      setDraftLoading(false);
      if (Object.values(touched.current).some(Boolean)) return;
      await createRef.current({ name: registration.name, handle: registration.handle, location: registration.location,
        isPrivate: registration.isPrivate === true,
        avatar: pending, creationKey: registration.id,
        publicAppearance: { ...DEFAULT_PUBLIC_APPEARANCE, accentColor: registration.accentColor, systemGray: registration.systemGray ?? DEFAULT_PUBLIC_APPEARANCE.systemGray } });
    };
    void restore();
    return () => { current = false; };
  }, [isOpen, registration, selectAvatar, restoreAttempt]);
  useEffect(() => {
    if (!registration || create.status !== 'success' || !create.createdProfile) return;
    if (!cleaned.current && (!registration.hasAvatar || (touched.current.avatar && !avatar.avatar && !avatar.error) || create.avatarPersisted || create.createdProfile.avatar)) {
      cleaned.current = true; void removeRegistrationDraft(registration.id);
    }
    // Saved desktop registration cleans its draft before continuing.
    if (!isMobile && !completed.current) {
      completed.current = true;
      onComplete(create.createdProfile.id);
    }
  }, [registration, create.status, create.createdProfile, create.avatarPersisted, avatar.avatar, avatar.error, onComplete, isMobile]);
  useEffect(() => {
    // A submission failure takes focus, so it is never missed.
    if (create.status === 'error') {
      errorRef.current?.focus();
    }
  }, [create.status]);
  const trustedRegistrationHandle = registration?.handle === handle && !touched.current.handle;
  const showHandleStatus = isOpen && !draftLoading && !trustedRegistrationHandle && (Boolean(name.trim()) || requestedHandle !== null);
  useEffect(() => {
    if (!showHandleStatus || validateHandle(handle) || create.isLoading || create.status === 'success') return;
    const timer = setTimeout(() => { void checkHandle(); }, 350);
    handleDebounce.current = timer;
    return () => clearTimeout(timer);
  }, [showHandleStatus, handle, accountId, isOpen, checkPublicHandle, create.isLoading, create.status, checkHandle]);
  if (!isOpen) {
    return null;
  }
  const isSubmitting = create.isLoading || draftLoading || submitPending;
  const isComplete = create.status === 'success' && create.createdProfile !== null;
  if (isComplete) return null;
  const canSubmit = !isSubmitting;
  const recoveryNotice = draftNotice ?? avatar.error;
  const handleError = validateHandle(handle);
  const currentAvailability = handleAvailability?.scope === handleScope.current ? handleAvailability : null;
  const handleStatus: ProfileFieldStatus | null = !showHandleStatus ? null : handleError
    ? { tone: 'negative', message: handleError, icon: <AlertCircleIcon data-keep-color="" size={14} aria-hidden="true" /> }
    : currentAvailability?.status === 'available'
      ? { tone: 'positive', message: 'Available', icon: <CheckCircle2Icon data-keep-color="" size={14} aria-hidden="true" /> }
      : currentAvailability && currentAvailability.status !== 'checking'
        ? { tone: 'negative', message: currentAvailability.message, icon: <AlertCircleIcon data-keep-color="" size={14} aria-hidden="true" /> }
        : { tone: 'neutral', message: 'Checking availability…' };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || isSubmittingRef.current || (missingSavedAvatar && !avatar.avatar)) {
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
    isSubmittingRef.current = true;
    setSubmitPending(true);
    const scope = handleScope.current;
    try {
      if (handleError || (!trustedRegistrationHandle && !await checkHandle())) return;
      if (!mounted.current || handleScope.current !== scope || !scope.isOpen) return;
      await create.run({
        name,
        handle,
        location: location.trim() || undefined,
        isPrivate,
        avatar: avatar.avatar ?? undefined,
        creationKey: registration?.id,
        publicAppearance: { ...DEFAULT_PUBLIC_APPEARANCE, accentColor: registration?.accentColor ?? accentColor, systemGray: registration?.systemGray ?? DEFAULT_PUBLIC_APPEARANCE.systemGray }
      });
    } finally {
      // Released on failure too, so Try again works without reopening the flow.
      isSubmittingRef.current = false;
      if (mounted.current) setSubmitPending(false);
    }
  }
  return <AccountWelcomeSurface profileSetup mobileOnboarding={isMobile} theme={theme} showAppearance={!isMobile} title={registration ? 'Setting up your profile' : 'Create your profile'} accentColor={accentColor} onAccentColorChange={onAccentColorChange}
    highContrast={highContrast} onHighContrastChange={onHighContrastChange} reduceTranslucency={reduceTranslucency} onReduceTranslucencyChange={onReduceTranslucencyChange}
    busy={isSubmitting} dirty={isDirty} onDismiss={onDismiss}>
          {(draftLoading || (registration && create.isLoading)) && <p role="status" className="py-4 text-center text-sm text-[var(--text-secondary)]">Finishing your account…</p>}
          {recoveryNotice && <div className="mb-4 text-sm text-[var(--text-secondary)]"><p role="status">{recoveryNotice}</p>{registration?.hasAvatar && <button type="button" data-ui-shape="action" className="min-h-11 text-[var(--accent-text)]" disabled={isSubmitting} onClick={() => { autoStarted.current = false; touched.current.avatar = false; setDraftLoading(true); setRestoreAttempt(value => value + 1); }}>Restore saved picture</button>}{(missingSavedAvatar || avatar.error) && <button type="button" data-ui-shape="action" className="min-h-11 ml-4 text-[var(--accent-text)]" disabled={isSubmitting} onClick={() => { touched.current.avatar = true; setMissingSavedAvatar(false); setDraftNotice(null); avatar.clear(); }}>Add picture later</button>}</div>}
          {(draftLoading || (registration && create.isLoading)) ? null : <form onSubmit={submit} noValidate data-onboarding-step={isMobile ? 'profile' : undefined} className="profile-setup-form">
              <div className="profile-setup-fields">

              {create.status === 'error' && <div ref={errorRef} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none">
                  <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    {create.error}
                    <button type="submit" disabled={isSubmitting} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
                  </span>
                </div>}

              <ProfileField id="onboarding-name" label="Profile name" required={isMobile} requiredIndicator="asterisk" value={name} autoComplete="name" maxLength={NAME_MAX_LENGTH} placeholder="Your name" error={fieldErrors.name} disabled={isSubmitting} onChange={(value) => {
            touched.current.name = true; setName(value);
            setFieldErrors((current) => ({
              ...current,
              name: null
            }));
          }} />

              <ProfileField id="onboarding-handle" label="Public handle" value={handle} status={handleStatus} disabled={isSubmitting} onChange={value => { touched.current.handle = true; setRequestedHandle(value); }} />
              <ProfileLocationPicker focusedScreen={isMobile} id="onboarding-location" value={location} error={fieldErrors.location} disabled={isSubmitting} onChange={value => { touched.current.location = true; setLocation(value); setFieldErrors(current => ({ ...current, location: null })); }} />

              {isMobile && <ProfileVisibilityField id="onboarding-visibility" collapsible isPrivate={isPrivate} onChange={value => { touched.current.isPrivate = true; setIsPrivate(value); }} disabled={isSubmitting} />}
              </div>
              <div className="profile-setup-submit">
              {isMobile ? <MobileOnboardingAction busy={isSubmitting}>{isSubmitting ? 'Finishing setup…' : 'Continue'}</MobileOnboardingAction> : <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isSubmitting} disabled={!canSubmit}>
                {isSubmitting ? 'Finishing setup…' : 'Continue'}
              </Button>}
              </div>
            </form>}

    </AccountWelcomeSurface>;
}
