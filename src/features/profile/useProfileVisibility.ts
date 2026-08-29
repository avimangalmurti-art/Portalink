import { useCallback } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import type { Id, Profile } from '../../types/domain';

/**
 * Whether a profile is public or private.
 *
 * UI → this hook → `ProfileService` → implementation, exactly like every other
 * profile write. The state shown is always the CONFIRMED one from the canonical
 * record: nothing is flipped optimistically, because claiming a profile is
 * private before the service has agreed would be the one lie that matters here.
 */
export function useProfileVisibility(profile: Profile | null) {
  const { profiles } = useServices();
  const { invalidateProfiles } = useProfileData();
  const profileId: Id | null = profile?.id ?? null;
  const isPrivate = profile?.isPrivate === true;

  const change = useAsyncAction(async (nextIsPrivate: boolean) => {
    if (!profileId) {
      throw new Error('No profile to update.');
    }
    await profiles.updateProfile(profileId, { isPrivate: nextIsPrivate });
    // One invalidation, so every surface re-reads the canonical record.
    invalidateProfiles();
  });

  const onToggle = useCallback(() => {
    if (change.isLoading) {
      return;
    }
    void change.run(!isPrivate);
  }, [change, isPrivate]);

  return {
    isPrivate,
    isPending: change.isLoading,
    /** The change was refused; `isPrivate` still holds the confirmed state. */
    error: change.error,
    onToggle,
    onRetry: change.error ? () => void change.retry() : undefined
  };
}