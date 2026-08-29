import React from 'react';
import { Button } from '../../components/ui/Button';
import { InlineStatus } from '../../components/ui/StateViews';

/**
 * The engineering contract for following a creator.
 *
 * Purely presentational: it never calls a service and never owns the follow
 * state. `useFollows(profileId)` resolves the state through `SocialService` and
 * passes the resolved lifecycle down.
 */
export type FollowButtonProps = {
  profileName: string;
  /** The last state the service confirmed. */
  isFollowing: boolean;
  /**
   * The viewer has ASKED to follow a private profile and is waiting on the
   * creator. Never true alongside `isFollowing`.
   */
  isRequested?: boolean;
  /** The target is private, so following it means sending a request. */
  isPrivate?: boolean;
  /** The first read is in flight; the control has nothing truthful to show yet. */
  isResolving?: boolean;
  /** A follow or unfollow is in flight. Blocks a duplicate mutation. */
  isPending?: boolean;
  /** The mutation was refused. The label still shows the confirmed state. */
  error?: string | null;
  disabled?: boolean;
  onToggle: () => void;
  onRetry?: (() => void) | null;
};
export function FollowButton({
  profileName,
  isFollowing,
  isRequested = false,
  isPrivate = false,
  isResolving = false,
  isPending = false,
  error = null,
  disabled = false,
  onToggle,
  onRetry
}: FollowButtonProps) {
  return <span className="inline-flex items-center gap-2">
      {/* Requested is a WAITING state, not a granted one, so it stays secondary
         and pressing it withdraws the request rather than asking again. */}
      <Button variant={isFollowing ? 'secondary' : isRequested ? 'secondary' : 'primary'} isLoading={isPending || isResolving} disabled={disabled || isPending || isResolving} onClick={onToggle} aria-busy={isPending || undefined} aria-label={isFollowing ? `Unfollow ${profileName}` : isRequested ? `Withdraw your follow request to ${profileName}` : isPrivate ? `Request to follow ${profileName}` : `Follow ${profileName}`}>
        {isFollowing ? 'Following' : isRequested ? 'Requested' : isPrivate ? 'Request' : 'Follow'}
      </Button>
      {error && <InlineStatus status="error" message={error} onRetry={onRetry ?? undefined} />}
    </span>;
}