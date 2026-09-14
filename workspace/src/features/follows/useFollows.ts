import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { isRetryableSocialCode, SocialServiceError } from '../../types/social';
import type { SocialErrorCode } from '../../types/social';
import type { Id } from '../../types/domain';

/**
 * Follow state for ONE profile, resolved from `SocialService.getFollowState`.
 *
 * This hook previously kept a local array of followed ids and treated it as the
 * truth: a profile the viewer already follows read as "not following" until they
 * pressed the button, because nothing ever asked the service. It also held a
 * single shared status, so a failure on one creator was still on screen after
 * navigating to another. State is now resolved per profile and keyed to it, so
 * one creator's pending or failed request can never appear on another's page.
 *
 * Every read and mutation lives here. Presentation components receive the
 * resolved values and callbacks and never touch a service.
 */
export type FollowLifecycle = {
  /** The last state the service confirmed. False until the first read lands. */
  isFollowing: boolean;
  /**
   * A follow of this profile has been ASKED FOR and is waiting on the creator.
   * Never true alongside `isFollowing`: an approved request stops being one.
   */
  isRequested: boolean;
  /** The first read for this profile is in flight. */
  isResolving: boolean;
  /** The state could not be read, so the control is not offered. */
  resolveError: string | null;
  retryResolve: () => void;
  /** A follow or unfollow is in flight. */
  isPending: boolean;
  /** The mutation was refused; `isFollowing` still holds the confirmed state. */
  mutationError: string | null;
  /**
   * Why it was refused, so presentation can branch. `unauthenticated` is answered
   * by signing in, `permission_denied` never is, and only `network`/`unknown` are
   * worth attempting again — which is why `retryMutation` is null for the rest.
   */
  mutationErrorCode: SocialErrorCode | null;
  /**
   * Asks to follow, withdraws a pending request, or unfollows — whichever the
   * confirmed state calls for. Ignored while a mutation is in flight.
   */
  toggle: () => void;
  /** Re-runs exactly the mutation that failed. Null when retrying cannot help. */
  retryMutation: (() => void) | null;
};

/** Typed refusals carry their own wording; anything else is genuinely unknown. */
function classify(error: unknown, fallback: string): {
  code: SocialErrorCode;
  message: string;
} {
  if (error instanceof SocialServiceError) {
    return {
      code: error.code,
      message: error.message
    };
  }
  return {
    code: 'unknown',
    message: error instanceof Error && error.message ? error.message : fallback
  };
}

export function useFollows(profileId: Id | null): FollowLifecycle {
  const { social } = useServices();
  /**
   * Follow state is ACCOUNT data, so the account is part of what identifies a
   * resolved value. Keying the resolve on it is what stops account B briefly
   * showing account A's cached follow state after a switch: the effect re-runs and
   * re-resolves from the service, which is authoritative either way.
   */
  const auth = useAuth();
  const accountId = auth.user?.id ?? null;
  const [isFollowing, setIsFollowing] = useState(false);
  const [isRequested, setIsRequested] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationErrorCode, setMutationErrorCode] = useState<SocialErrorCode | null>(null);
  const [retryMutation, setRetryMutation] = useState<(() => void) | null>(null);
  /**
   * Identifies the profile AND account every in-flight request belongs to. A
   * response is dropped unless both still match, so neither navigating to another
   * creator nor switching accounts can let an older answer land as the new state.
   */
  const requestedKeyRef = useRef<string | null>(null);
  // Blocks a second mutation while one is in flight, independently of the
  // disabled control, so a fast double press cannot send two requests.
  const isMutatingRef = useRef(false);

  const requestKey = `${accountId ?? 'guest'}:${profileId ?? 'none'}`;
  const resolve = useCallback(() => {
    requestedKeyRef.current = requestKey;
    isMutatingRef.current = false;
    // Everything about the previous profile OR account is dropped, including its
    // confirmed value: a stale `true` must never be shown to a different account.
    setIsPending(false);
    setMutationError(null);
    setMutationErrorCode(null);
    setRetryMutation(null);
    setResolveError(null);
    setIsFollowing(false);
    setIsRequested(false);
    if (!profileId) {
      setIsResolving(false);
      return;
    }
    setIsResolving(true);
    social.getFollowState(profileId).then((state) => {
      if (requestedKeyRef.current !== requestKey) {
        return;
      }
      setIsFollowing(state.isFollowing);
      setIsRequested(state.isRequested);
      setIsResolving(false);
    }).catch((caught) => {
      if (requestedKeyRef.current !== requestKey) {
        return;
      }
      setIsResolving(false);
      setResolveError(classify(caught, 'Follow state could not be checked.').message);
    });
  }, [social, profileId, requestKey]);

  useEffect(resolve, [resolve]);

  const mutate = useCallback((intent: 'follow' | 'unfollow' | 'cancel') => {
    if (!profileId || isMutatingRef.current) {
      return;
    }
    isMutatingRef.current = true;
    setIsPending(true);
    setMutationError(null);
    setMutationErrorCode(null);
    setRetryMutation(null);
    const request = intent === 'follow' ? social.followProfile(profileId) : intent === 'cancel' ? social.cancelFollowRequest(profileId) : social.unfollowProfile(profileId);
    request.then((state) => {
      // The service's own answer, not an assumed one — a follow of a private
      // profile comes back as a REQUEST, and only the service knows that.
      if (requestedKeyRef.current !== requestKey) {
        return;
      }
      setIsFollowing(state.isFollowing);
      setIsRequested(state.isRequested);
    }).catch((caught) => {
      if (requestedKeyRef.current !== requestKey) {
        return;
      }
      // The confirmed state is left exactly as it was: a refused follow must not
      // leave the button claiming the viewer follows this creator.
      const { code, message } = classify(caught, intent === 'follow' ? 'Couldn’t follow' : intent === 'cancel' ? 'Couldn’t withdraw the request' : 'Couldn’t unfollow');
      setMutationError(message);
      setMutationErrorCode(code);
      // Offered only where an identical second request could actually succeed.
      setRetryMutation(isRetryableSocialCode(code) ? () => () => mutate(intent) : null);
    }).finally(() => {
      isMutatingRef.current = false;
      if (requestedKeyRef.current === requestKey) {
        setIsPending(false);
      }
    });
  }, [social, profileId, requestKey]);

  const toggle = useCallback(() => {
    // Three confirmed states, three different next steps: a pending request is
    // withdrawn rather than sent again, which is what stops the control reading
    // as "press to ask" once the viewer has already asked.
    mutate(isFollowing ? 'unfollow' : isRequested ? 'cancel' : 'follow');
  }, [mutate, isFollowing, isRequested]);

  return useMemo(() => ({
    isFollowing,
    isRequested,
    isResolving,
    resolveError,
    retryResolve: resolve,
    isPending,
    mutationError,
    mutationErrorCode,
    toggle,
    retryMutation
  }), [isFollowing, isRequested, isResolving, resolveError, resolve, isPending, mutationError, mutationErrorCode, toggle, retryMutation]);
}