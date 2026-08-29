import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from './ServicesContext';
import type { Id, Profile } from '../types/domain';

/**
 * The one read boundary for profile records.
 *
 * `UI → useProfileQuery → ProfileService → implementation`. This provider owns
 * nothing but the cache and the invalidation signal: the record itself is always
 * the one the service returned, never a seed store read behind its back. It used
 * to call `getProfileById` from `data/profiles` directly, which is why a profile
 * could appear without ever having been fetched, could never fail, and could
 * never be missing — a read boundary that cannot report anything is not one.
 *
 * Two rules this file exists to enforce:
 *
 * 1. **No substitution.** While a profile is loading, missing, or failed, the
 *    answer is `null` plus a status. Nothing hands back another record, and
 *    there is no fallback id anywhere in the read path.
 * 2. **One record per id.** The `Profile` the service returned is reused as-is.
 *    An id is never resolved and then independently re-read from a seed store.
 *
 * Mapping to production: `fetchProfile` becomes a cached query and
 * `invalidateProfiles` becomes cache invalidation after a mutation. Components
 * do not change.
 */
export type ProfileQueryStatus = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';
type ProfileDataContextValue = {
  /** Resolves a record through `ProfileService`, caching the result by id. */
  fetchProfile: (profileId: Id) => Promise<Profile>;
  /**
   * The already-fetched record for an id, or null. A PEEK, never a fetch: it
   * answers "has the service confirmed this yet?" for logic that cannot await,
   * and returns null rather than substituting anything when it has not.
   */
  peekProfile: (profileId: Id) => Profile | null;
  /** Called by the profile, category, and publishing features after a write. */
  invalidateProfiles: () => void;
  revision: number;
};
const ProfileDataContext = createContext<ProfileDataContextValue | null>(null);
export function ProfileDataProvider({
  children


}: {children: React.ReactNode;}) {
  const {
    profiles: profileService
  } = useServices();
  const [revision, setRevision] = useState(0);
  const cacheRef = useRef(new Map<Id, Profile>());
  const invalidateProfiles = useCallback(() => {
    // Emptied rather than patched: after a write, every cached record is suspect,
    // and a stale entry is exactly what this boundary exists to prevent.
    cacheRef.current.clear();
    setRevision((current) => current + 1);
  }, []);
  const fetchProfile = useCallback(async (profileId: Id) => {
    const cached = cacheRef.current.get(profileId);
    if (cached) {
      return cached;
    }
    const profile = await profileService.getProfile(profileId);
    // Keyed by both the requested id and the record's own id, so a service that
    // resolves an alias still answers a peek under either.
    cacheRef.current.set(profileId, profile);
    cacheRef.current.set(profile.id, profile);
    return profile;
  }, [profileService]);
  const peekProfile = useCallback((profileId: Id) => cacheRef.current.get(profileId) ?? null, []);
  const value = useMemo<ProfileDataContextValue>(() => ({
    fetchProfile,
    peekProfile,
    invalidateProfiles,
    revision
  }), [fetchProfile, peekProfile, invalidateProfiles, revision]);
  return <ProfileDataContext.Provider value={value}>{children}</ProfileDataContext.Provider>;
}
export function useProfileData(): ProfileDataContextValue {
  const value = useContext(ProfileDataContext);
  if (!value) {
    throw new Error('useProfileData must be used inside a ProfileDataProvider.');
  }
  return value;
}

/**
 * Absence and failure are different answers, and only the second is retryable.
 * Implementations report absence in their own words, so their phrasings are
 * matched rather than assumed.
 */
function isMissing(error: unknown): boolean {
  return error instanceof Error && /not found|no (such )?profile|unknown profile|invalid input syntax for type uuid/i.test(error.message);
}
function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
export type ProfileQuery = {
  /** The confirmed record, or null while loading, missing, or failed. */
  profile: Profile | null;
  status: ProfileQueryStatus;
  error: string | null;
  /** Re-runs the read. Meaningful on `error`; retrying a missing id cannot help. */
  retry: () => void;
};

/**
 * One profile's read lifecycle: `loading → ready`, with `not-found` and
 * `error → retry`. Passing null is the guest / no-context case and resolves to
 * `idle` with no record — a truthful nothing, not an invented creator.
 *
 * Rapid navigation is safe: every read carries the id it was made for, and only
 * the newest is allowed to settle, so an answer for a creator already navigated
 * away from can never be written into the current one.
 */
export function useProfileQuery(profileId: Id | null): ProfileQuery {
  const {
    fetchProfile,
    revision
  } = useProfileData();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    profileId: Id | null;
    profile: Profile | null;
    status: ProfileQueryStatus;
    error: string | null;
  }>({
    profileId: null,
    profile: null,
    status: 'idle',
    error: null
  });
  const latestRequestRef = useRef(0);
  useEffect(() => {
    if (!profileId) {
      latestRequestRef.current += 1;
      setState({
        profileId: null,
        profile: null,
        status: 'idle',
        error: null
      });
      return;
    }
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setState((current) => ({
      profileId,
      // Re-reading the SAME profile after an invalidation keeps the record on
      // screen: that is the same creator, not a substitution. A DIFFERENT id
      // clears it, so no surface ever shows one creator under another's id.
      profile: current.profileId === profileId ? current.profile : null,
      status: 'loading',
      error: null
    }));
    fetchProfile(profileId).then((profile) => {
      if (latestRequestRef.current !== requestId) {
        return;
      }
      setState({
        profileId,
        profile,
        status: 'ready',
        error: null
      });
    }).catch((error) => {
      if (latestRequestRef.current !== requestId) {
        return;
      }
      const missing = isMissing(error);
      setState({
        profileId,
        // Nothing is shown in its place, whichever way the read went wrong.
        profile: null,
        status: missing ? 'not-found' : 'error',
        error: messageFor(error, missing ? 'That profile does not exist.' : 'That profile could not be read.')
      });
    });
  }, [profileId, fetchProfile, revision, attempt]);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return useMemo(() => ({
    profile: state.profileId === profileId ? state.profile : null,
    status: state.profileId === profileId ? state.status : profileId ? 'loading' : 'idle',
    error: state.error,
    retry
  }), [state, profileId, retry]);
}
