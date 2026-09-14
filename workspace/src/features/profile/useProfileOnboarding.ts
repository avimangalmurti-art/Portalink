import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { normalizeHandle } from './validation';
import type { AvatarRejectionCode, CreateProfileInput, HandleCheckStatus, PreparedAvatar, ProfileOnboardingStatus } from '../../types/profile';
import type { Profile } from '../../types/domain';
import { readImageDimensions } from '../../utils/imageMetadata';
import { createOrResumeProfile, saveRegistrationAvatar } from '../auth/registration';

/**
 * The onboarding feature boundary.
 *
 * UI → this hook → `ProfileService` → implementation. Nothing here knows about
 * a database or a storage bucket; swapping the service is the only change a
 * real backend requires.
 */

const ACCEPTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
const AVATAR_REJECTIONS: Record<AvatarRejectionCode, string> = {
  unsupported_type: 'Choose a PNG, JPEG, WebP, or GIF image.',
  too_large: 'Choose an image under 4 MB.',
  unreadable: 'That file could not be read. Choose another.'
};

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
  select: (file: File | null, crop?: Pick<PreparedAvatar, 'originalSource' | 'crop'>) => void;
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
      return;
    }
    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setError(AVATAR_REJECTIONS.unsupported_type);
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(AVATAR_REJECTIONS.too_large);
      return;
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
    } catch {
      setError(AVATAR_REJECTIONS.unreadable);
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
export type HandleCheck = {
  status: HandleCheckStatus;
  /** The normalized handle the current answer applies to. */
  checkedHandle: string | null;
  message: string | null;
  check: (handle: string) => void;
  reset: () => void;
  retry: () => void;
};

/**
 * Availability, as its own lifecycle: idle → checking → available / unavailable
 * / error, with retry. Debounced so typing does not flood the service.
 */
export function useHandleAvailability(): HandleCheck {
  const {
    profiles
  } = useServices();
  const [status, setStatus] = useState<HandleCheckStatus>('idle');
  const [checkedHandle, setCheckedHandle] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const lastRequestedRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const run = useCallback(async (handle: string) => {
    lastRequestedRef.current = handle;
    setStatus('checking');
    setMessage(null);
    try {
      const result = await profiles.checkHandleAvailability(handle);
      // Ignore answers to a handle the user has already moved on from.
      if (lastRequestedRef.current !== handle) {
        return;
      }
      setCheckedHandle(result.handle);
      setStatus(result.isAvailable ? 'available' : 'unavailable');
      setMessage(result.isAvailable ? `${result.handle} is available.` : result.reason ?? 'That handle is not available.');
    } catch (caught) {
      if (lastRequestedRef.current !== handle) {
        return;
      }
      setStatus('error');
      setMessage(caught instanceof Error ? caught.message : 'Could not check that handle.');
    }
  }, [profiles]);
  const check = useCallback((handle: string) => {
    const normalized = normalizeHandle(handle);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    if (!normalized) {
      lastRequestedRef.current = null;
      setStatus('idle');
      setCheckedHandle(null);
      setMessage(null);
      return;
    }
    // Invalidate an older in-flight answer immediately, rather than leaving it
    // current during this new value's debounce window.
    lastRequestedRef.current = normalized;
    setStatus('checking');
    setMessage(null);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void run(normalized);
    }, 350);
  }, [run]);
  useEffect(() => () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    lastRequestedRef.current = null;
  }, []);
  const reset = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastRequestedRef.current = null;
    setStatus('idle');
    setCheckedHandle(null);
    setMessage(null);
  }, []);
  const retry = useCallback(() => {
    if (lastRequestedRef.current) {
      void run(lastRequestedRef.current);
    }
  }, [run]);
  return {
    status,
    checkedHandle,
    message,
    check,
    reset,
    retry
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
    if (input.creationKey) await saveRegistrationAvatar(input.creationKey, input.avatar ?? null);
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
