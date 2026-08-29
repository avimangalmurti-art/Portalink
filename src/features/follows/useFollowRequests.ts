import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { SocialServiceError } from '../../types/social';
import type { FollowRequest, Id } from '../../types/domain';

/**
 * Pending requests to follow the SIGNED-IN viewer's own profile, resolved
 * through `SocialService.listFollowRequests`.
 *
 * The list is never assembled here: approving and declining both return the
 * requests that remain, and that answer replaces the list. A client that spliced
 * the acted-on entry out itself would be reporting a count the service has not
 * agreed to — which is exactly how a badge ends up disagreeing with the list
 * behind it.
 *
 * Nothing is read for a viewer who owns no profile: there is no inbox to read.
 */
export type FollowRequestsLifecycle = {
  /** The last list the service confirmed. Empty until the first read lands. */
  requests: FollowRequest[];
  /** The confirmed number waiting. Zero is a real answer, not "unknown". */
  count: number;
  /** The first read is in flight, so there is nothing truthful to show yet. */
  isResolving: boolean;
  /** The list could not be read, so no count is shown at all. */
  resolveError: string | null;
  retryResolve: () => void;
  /** The profile currently being approved or declined, if any. */
  pendingProfileId: Id | null;
  /** A decision was refused; the list still holds the confirmed state. */
  actionError: string | null;
  approve: (requesterProfileId: Id) => void;
  decline: (requesterProfileId: Id) => void;
};
export function useFollowRequests(): FollowRequestsLifecycle {
  const { social } = useServices();
  /*
   * The inbox belongs to the ACCOUNT, so the account is part of what identifies
   * a resolved list. Keying the read on it is what stops account B briefly
   * showing account A's pending requests after a switch.
   */
  const auth = useAuth();
  const accountId = auth.user?.id ?? null;
  const ownsProfile = Boolean(auth.user?.profileId);
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [pendingProfileId, setPendingProfileId] = useState<Id | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** A response is dropped unless the account it was read for still matches. */
  const requestedKeyRef = useRef<string | null>(null);
  const isMutatingRef = useRef(false);

  const requestKey = `${accountId ?? 'guest'}:${ownsProfile ? 'profile' : 'none'}`;
  const resolve = useCallback(() => {
    requestedKeyRef.current = requestKey;
    isMutatingRef.current = false;
    setPendingProfileId(null);
    setActionError(null);
    setResolveError(null);
    setRequests([]);
    if (!accountId || !ownsProfile) {
      setIsResolving(false);
      return;
    }
    setIsResolving(true);
    social.listFollowRequests().then((next) => {
      if (requestedKeyRef.current !== requestKey) {
        return;
      }
      setRequests(next);
      setIsResolving(false);
    }).catch((caught) => {
      if (requestedKeyRef.current !== requestKey) {
        return;
      }
      setIsResolving(false);
      setResolveError(caught instanceof SocialServiceError ? caught.message : 'Follow requests could not be loaded.');
    });
  }, [social, accountId, ownsProfile, requestKey]);

  useEffect(resolve, [resolve]);

  const decide = useCallback((requesterProfileId: Id, isApproval: boolean) => {
    if (isMutatingRef.current) {
      return;
    }
    isMutatingRef.current = true;
    setPendingProfileId(requesterProfileId);
    setActionError(null);
    const request = isApproval ? social.approveFollowRequest(requesterProfileId) : social.declineFollowRequest(requesterProfileId);
    request.then((remaining) => {
      if (requestedKeyRef.current !== requestKey) {
        return;
      }
      // The service's own answer about what is left, not a locally spliced list.
      setRequests(remaining);
    }).catch((caught) => {
      if (requestedKeyRef.current !== requestKey) {
        return;
      }
      setActionError(caught instanceof SocialServiceError ? caught.message : isApproval ? 'Couldn’t approve that request.' : 'Couldn’t decline that request.');
    }).finally(() => {
      isMutatingRef.current = false;
      if (requestedKeyRef.current === requestKey) {
        setPendingProfileId(null);
      }
    });
  }, [social, requestKey]);

  const approve = useCallback((requesterProfileId: Id) => decide(requesterProfileId, true), [decide]);
  const decline = useCallback((requesterProfileId: Id) => decide(requesterProfileId, false), [decide]);

  return useMemo(() => ({
    requests,
    count: requests.length,
    isResolving,
    resolveError,
    retryResolve: resolve,
    pendingProfileId,
    actionError,
    approve,
    decline
  }), [requests, isResolving, resolveError, resolve, pendingProfileId, actionError, approve, decline]);
}