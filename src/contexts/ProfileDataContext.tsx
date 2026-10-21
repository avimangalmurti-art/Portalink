import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from './ServicesContext';
import { useAuth } from './AuthContext';
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
export type ProfileReadMode = 'full' | 'overview';
const profileCacheKey = (id: Id, mode: ProfileReadMode) => mode === 'full' ? id : `overview:${id}`;
type ProfileDataContextValue = {
  /** Resolves a record through `ProfileService`, caching the result by id. */
  fetchProfile: (profileId: Id, mode?: ProfileReadMode) => Promise<Profile>;
  /**
   * The already-fetched record for an id, or null. A PEEK, never a fetch: it
   * answers "has the service confirmed this yet?" for logic that cannot await,
   * and returns null rather than substituting anything when it has not.
   */
  peekProfile: (profileId: Id, mode?: ProfileReadMode) => Profile | null;
  /** Called by the profile, category, and publishing features after a write. */
  invalidateProfiles: () => void;
  /** Replace a profile with a confirmed service result without a loading flash. */
  cacheProfile: (profile: Profile) => void;
  revision: number;
  /** Internal identity for records whose visibility depends on the viewer. */
  scope: object;
};
const ProfileDataContext = createContext<ProfileDataContextValue | null>(null);
export function ProfileDataProvider({
  children


}: {children: React.ReactNode;}) {
  const {
    profiles: profileService
  } = useServices();
  const accountId = useAuth().user?.id ?? null;
  const [revision, setRevision] = useState(0);
  // A new identity gets an empty cache during render, before any child can peek
  // at the previous owner's record. Returning to an account creates a new scope
  // too: an old response cannot become current again after A -> B -> A.
  const scope = useMemo(() => ({
    accountId,
    profileService,
    cache: new Map<Id, Profile>(),
    inFlight: new Map<Id, Promise<Profile>>(),
    generation: 0,
  }), [accountId, profileService]);
  const currentScope = useRef<typeof scope | null>(scope);
  currentScope.current = scope;
  useEffect(() => {
    currentScope.current = scope;
    return () => { if (currentScope.current === scope) currentScope.current = null; };
  }, [scope]);
  const invalidateProfiles = useCallback(() => {
    if (currentScope.current !== scope) return;
    // Emptied rather than patched: after a write, every cached record is suspect,
    // and a stale entry is exactly what this boundary exists to prevent.
    scope.generation += 1;
    scope.cache.clear();
    scope.inFlight.clear();
    setRevision((current) => current + 1);
  }, [scope]);
  const cacheProfile = useCallback((profile: Profile) => {
    if (currentScope.current !== scope) return;
    scope.generation += 1;
    scope.inFlight.clear();
    scope.cache.set(profile.id, profile);
    scope.cache.set(profileCacheKey(profile.id, 'overview'), profile);
    setRevision(current => current + 1);
  }, [scope]);
  const fetchProfile = useCallback(async (profileId: Id, mode: ProfileReadMode = 'full'): Promise<Profile> => {
    if (currentScope.current !== scope) throw new Error('Your account changed. Please try again.');
    const key = profileCacheKey(profileId, mode);
    const cached = scope.cache.get(key) ?? (mode === 'overview' ? scope.cache.get(profileId) : undefined);
    if (cached) {
      return cached;
    }
    const pending = scope.inFlight.get(key);
    if (pending) {
      return pending;
    }

    const generation = scope.generation;
    const request = (mode === 'overview' && profileService.getProfileOverview ? profileService.getProfileOverview(profileId) : profileService.getProfile(profileId)).then((profile) => {
      if (currentScope.current !== scope) throw new Error('Your account changed. Please try again.');
      // A write may have invalidated this read while it was travelling. Join the
      // current read/cache rather than returning the obsolete answer to a caller
      // whose effect has not rerun yet.
      if (scope.generation !== generation) return fetchProfile(profileId, mode);
      // Keyed by both the requested id and the record's own id, so a service
      // that resolves an alias still answers a peek under either.
      scope.cache.set(key, profile);
      scope.cache.set(profileCacheKey(profile.id, mode), profile);
      return profile;
    }, (error: unknown) => {
      if (currentScope.current !== scope) throw new Error('Your account changed. Please try again.');
      if (scope.generation !== generation) return fetchProfile(profileId, mode);
      throw error;
    });
    scope.inFlight.set(key, request);
    const clearRequest = () => {
      if (scope.inFlight.get(key) === request) {
        scope.inFlight.delete(key);
      }
    };
    // Supplying both handlers keeps this housekeeping branch fulfilled even
    // when the caller receives a rejection to present through the route.
    void request.then(clearRequest, clearRequest);
    return request;
  }, [profileService, scope]);
  const peekProfile = useCallback((profileId: Id, mode: ProfileReadMode = 'full') => currentScope.current === scope ? scope.cache.get(profileCacheKey(profileId, mode)) ?? (mode === 'overview' ? scope.cache.get(profileId) : undefined) ?? null : null, [scope]);
  const value = useMemo<ProfileDataContextValue>(() => ({
    fetchProfile,
    peekProfile,
    invalidateProfiles,
    cacheProfile,
    revision,
    scope,
  }), [fetchProfile, peekProfile, invalidateProfiles, cacheProfile, revision, scope]);
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
export function useProfileQuery(profileId: Id | null, mode: ProfileReadMode = 'full'): ProfileQuery {
  const {
    fetchProfile: fetchCachedProfile,
    peekProfile: peekCachedProfile,
    revision,
    scope: accountScope,
  } = useProfileData();
  const scope = useMemo(() => ({ accountScope, mode }), [accountScope, mode]);
  const fetchProfile = useCallback((id: Id) => fetchCachedProfile(id, mode), [fetchCachedProfile, mode]);
  const peekProfile = useCallback((id: Id) => peekCachedProfile(id, mode), [peekCachedProfile, mode]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    profileId: Id | null;
    scope: object;
    profile: Profile | null;
    status: ProfileQueryStatus;
    error: string | null;
  }>({
    profileId: null,
    scope,
    profile: null,
    status: 'idle',
    error: null
  });
  const latestRequestRef = useRef(0);
  const currentQuery = useRef({ profileId, scope });
  currentQuery.current = { profileId, scope };
  useEffect(() => {
    if (!profileId) {
      latestRequestRef.current += 1;
      setState({
        profileId: null,
        scope,
        profile: null,
        status: 'idle',
        error: null
      });
      return;
    }
    const prefetchedProfile = peekProfile(profileId);
    if (prefetchedProfile) {
      latestRequestRef.current += 1;
      setState({
        profileId,
        scope,
        profile: prefetchedProfile,
        status: 'ready',
        error: null
      });
      return;
    }
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setState((current) => ({
      profileId,
      scope,
      // Re-reading the SAME profile after an invalidation keeps the record on
      // screen: that is the same creator, not a substitution. A DIFFERENT id
      // clears it, so no surface ever shows one creator under another's id.
      profile: current.profileId === profileId && current.scope === scope ? current.profile : null,
      status: 'loading',
      error: null
    }));
    fetchProfile(profileId).then((profile) => {
      if (latestRequestRef.current !== requestId || currentQuery.current.scope !== scope || currentQuery.current.profileId !== profileId) {
        return;
      }
      setState({
        profileId,
        scope,
        profile,
        status: 'ready',
        error: null
      });
    }).catch((error) => {
      if (latestRequestRef.current !== requestId || currentQuery.current.scope !== scope || currentQuery.current.profileId !== profileId) {
        return;
      }
      const missing = isMissing(error);
      setState({
        profileId,
        scope,
        // Nothing is shown in its place, whichever way the read went wrong.
        profile: null,
        status: missing ? 'not-found' : 'error',
        error: messageFor(error, missing ? 'That profile does not exist.' : 'That profile could not be read.')
      });
    });
    return () => { latestRequestRef.current += 1; };
  }, [profileId, fetchProfile, peekProfile, revision, attempt, scope]);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const prefetchedProfile = profileId ? peekProfile(profileId) : null;
  const matchesQuery = state.profileId === profileId && state.scope === scope;
  return useMemo(() => ({
    profile: matchesQuery ? state.profile : prefetchedProfile,
    status: matchesQuery ? state.status : prefetchedProfile ? 'ready' : profileId ? 'loading' : 'idle',
    error: matchesQuery ? state.error : null,
    retry
  }), [state, profileId, prefetchedProfile, retry, matchesQuery]);
}
