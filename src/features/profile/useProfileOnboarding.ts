import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import type { CreateProfileInput, PreparedAvatar, ProfileOnboardingStatus } from '../../types/profile';
import type { Profile } from '../../types/domain';
import { readImageDimensions } from '../../utils/imageMetadata';
import { createOrResumeProfile, saveRegistrationAvatar } from '../auth/registration';
import { AVATAR_REJECTIONS, validateAvatarFile } from './avatarValidation';

/**
 * The onboarding feature boundary.
 *
 * UI → this hook → `ProfileService` → implementation. Nothing here knows about
 * a database or a storage bucket; swapping the service is the only change a
 * real backend requires.
 */

/** Whether the signed-in account still needs a profile. */
export function useProfileOnboardingStatus(): ProfileOnboardingStatus {
  const auth = useAuth();
  if (auth.isInitializing || auth.phase === 'authenticating') {
    return 'unknown';
  }
  if (!auth.isAuthenticated || !auth.user) {
    return 'not-required';
  }
  if (!auth.user.isEmailVerified) {
    // Verification comes first; onboarding is not the right ask yet.
    return 'not-required';
  }
  return auth.user.profileId ? 'ready' : 'required';
}
export type AvatarSelection = {
  avatar: PreparedAvatar | null;
  error: string | null;
  /** Always false in the prototype: the file has not left the browser. */
  isPersisted: boolean;
  /**
   * What will actually happen to the chosen file, in the transport's own words.
   * Null once a storage backend reports itself available, because then there is
   * nothing to warn about.
   */
  storageNotice: string | null;
  select: (file: File | null, crop?: Pick<PreparedAvatar, 'originalSource' | 'crop'>) => boolean;
  clear: () => void;
};

/** Choose → validate → preview → replace → remove. No upload happens. */
export function useAvatarSelection(): AvatarSelection {
  const {
    media
  } = useServices();
  const [avatar, setAvatar] = useState<PreparedAvatar | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read from `MediaService` rather than asserted in the UI, so the moment a
  // real backend is connected this stops warning on its own.
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  useEffect(() => {
    let isCurrent = true;
    media.getUploadCapability().then((capability) => {
      if (isCurrent) {
        setStorageNotice(capability.isAvailable ? null : capability.reason);
      }
    }).catch(() => {
      if (isCurrent) {
        // A capability that cannot be read is not a promise that uploading works.
        setStorageNotice('Whether your picture can be stored could not be checked, so treat it as previewed on this device only.');
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [media]);
  const previousUrlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previousUrlRef.current) {
      URL.revokeObjectURL(previousUrlRef.current);
    }
  }, []);
  const replacePreview = useCallback((next: PreparedAvatar | null) => {
    if (previousUrlRef.current) {
      URL.revokeObjectURL(previousUrlRef.current);
    }
    previousUrlRef.current = next?.previewUrl ?? null;
    setAvatar(next);
  }, []);
  const select = useCallback((file: File | null, crop?: Pick<PreparedAvatar, 'originalSource' | 'crop'>) => {
    if (!file) {
      return false;
    }
    const rejection = validateAvatarFile(file);
    if (rejection) {
      setError(rejection);
      return false;
    }
    try {
      setError(null);
      const previewUrl = URL.createObjectURL(file);
      replacePreview({
        ...crop,
        file,
        previewUrl,
        fileName: file.name,
        sizeBytes: file.size,
        isPersisted: false
      });
      // Geometry arrives asynchronously, but the preview can appear immediately.
      // A stale read is ignored if the person has already chosen another file.
      void readImageDimensions(file).then((dimensions) => {
        if (!dimensions) {
          return;
        }
        setAvatar((current) => current?.previewUrl === previewUrl ? {
          ...current,
          ...dimensions
        } : current);
      }).catch(() => undefined);
      return true;
    } catch {
      setError(AVATAR_REJECTIONS.unreadable);
      return false;
    }
  }, [replacePreview]);
  const clear = useCallback(() => {
    setError(null);
    replacePreview(null);
  }, [replacePreview]);
  return {
    avatar,
    error,
    isPersisted: false,
    storageNotice,
    select,
    clear
  };
}
/** Creating the profile, and linking it to the account for this session. */
export function useCreateProfile() {
  const services = useServices();
  const auth = useAuth();
  const [createdProfile, setCreatedProfile] = useState<Profile | null>(null);
  const [avatarPersisted, setAvatarPersisted] = useState(false);
  const accountId = auth.user?.id ?? null;
  const action = useAsyncAction(async (input: CreateProfileInput) => {
    if (!accountId) {
      throw new Error('Sign in before creating a profile.');
    }
    // The complete signup draft was saved before sending confirmation. A local
    // cache failure here must not prevent the authenticated Storage/profile save.
    if (input.creationKey && input.avatar) await saveRegistrationAvatar(input.creationKey, input.avatar).catch(() => undefined);
    const result = await createOrResumeProfile(services, accountId, input);
    // Only now does the account own a profile.
    await auth.linkProfile(result.profile.id);
    setCreatedProfile(result.profile);
    setAvatarPersisted(result.avatarPersisted);
  });
  return useMemo(() => ({
    ...action,
    createdProfile,
    avatarPersisted
  }), [action, createdProfile, avatarPersisted]);
}
