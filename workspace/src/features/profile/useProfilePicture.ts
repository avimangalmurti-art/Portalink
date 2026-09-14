import { useCallback } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useAvatarSelection } from './useProfileOnboarding';
import type { Profile } from '../../types/domain';

/**
 * Choosing a profile picture from the profile page itself.
 *
 * UI → this hook → `ProfileService.updateProfile`, the same boundary every
 * other profile write uses. Validation and previewing are delegated to
 * `useAvatarSelection`, so there is ONE set of rules about what a profile
 * picture may be rather than a second copy living here.
 *
 * Honesty: the chosen file is previewed from a local object URL. Whether it is
 * actually STORED is the media transport's business, and it says so through
 * `storageNotice` — this hook never claims an upload happened.
 */
export function useProfilePicture(profile: Profile | null) {
  const { profiles } = useServices();
  const { invalidateProfiles } = useProfileData();
  const selection = useAvatarSelection();

  const save = useAsyncAction(async (file: File) => {
    if (!profile) {
      throw new Error('No profile to update.');
    }
    await profiles.updateProfile(profile.id, {
      avatar: {
        file,
        previewUrl: URL.createObjectURL(file),
        fileName: file.name,
        sizeBytes: file.size,
        isPersisted: false
      }
    });
    // One invalidation, so every surface re-reads the canonical record.
    invalidateProfiles();
  });

  const choose = useCallback((file: File | null) => {
    if (!file) {
      return;
    }
    // Validation first: a rejected file must never reach the service.
    selection.select(file);
    void save.run(file);
  }, [selection, save]);

  return {
    /** The chosen picture, previewed locally. Null until one is chosen. */
    previewUrl: selection.avatar?.previewUrl ?? null,
    /** The transport's own words about whether the file can be stored. */
    storageNotice: selection.storageNotice,
    isPending: save.isLoading,
    error: selection.error ?? save.error,
    choose
  };
}