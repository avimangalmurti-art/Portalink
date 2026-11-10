import type { Id } from './domain';

/**
 * Project engagement: like and save.
 *
 * One vocabulary for both, because they are the same shape of fact — a
 * viewer's relationship to a project, plus a public total — and modelling them
 * separately is how different state machines end up in the product.
 *
 * Comments, notifications, messaging, reporting, and shares are deliberately NOT
 * here. Nothing in this file implies they exist.
 */
export type EngagementKind = 'like' | 'save';
export const ENGAGEMENT_KINDS: readonly EngagementKind[] = ['like', 'save'];
/** Runtime inputs may outlive a feature's removal. Validate before auth or I/O. */
export function isEngagementKind(kind: unknown): kind is EngagementKind {
  return kind === 'like' || kind === 'save';
}

/**
 * A project's engagement as the service reports it.
 *
 * Counts are OPTIONAL and independently nullable: an implementation that cannot
 * report a total must answer `null` rather than `0`, because "nobody has liked
 * this" and "we do not know how many have" are different facts and only one of
 * them is safe to render as a number.
 */
export type ProjectEngagement = {
  projectId: Id;
  /** The viewer's own state. False for a guest, who has engaged with nothing. */
  isLiked: boolean;
  isSaved: boolean;
  /** Legacy summary wire field; retained for backend compatibility only. */
  isReposted: boolean;
  likeCount: number | null;
  saveCount: number | null;
  /** Legacy summary wire field; never an active engagement kind. */
  repostCount: number | null;
};

/** What a mutation asks for, stated rather than inferred from the current value. */
export type EngagementMutation = {
  projectId: Id;
  kind: EngagementKind;
  /** True to engage, false to withdraw. Never a blind toggle at the boundary. */
  engaged: boolean;
};

/**
 * Branchable failures. `unauthenticated` and `permission_denied` are separate
 * because the first is answered by signing in and the second never is, and
 * `not_found` is separate from `network` because retrying a deleted project is
 * pointless.
 */
export type EngagementErrorCode = 'unauthenticated' | 'permission_denied' | 'not_found' | 'rate_limited' | 'network' | 'unknown';
export class EngagementServiceError extends Error {
  readonly code: EngagementErrorCode;
  constructor(code: EngagementErrorCode, message: string) {
    super(message);
    this.name = 'EngagementServiceError';
    this.code = code;
  }
}

/** Only these describe a condition an identical second request could clear. */
export function isRetryableEngagementCode(code: EngagementErrorCode): boolean {
  return code === 'network' || code === 'rate_limited' || code === 'unknown';
}
/**
 * The URL vocabulary for activity collections, and its mapping to the canonical
 * engagement kinds.
 *
 * The product's words and the domain's words differ, and both are deliberate:
 * a URL reads as a plural collection (`/activity/likes`), while the domain names a
 * single act (`like`). "Saved" and "Bookmark" are the same fact — the interface
 * says Saved, the domain says `save` — so the mapping is stated here ONCE rather
 * than being re-guessed at each call site.
 */
export type ActivitySlug = 'likes' | 'saved';
const SLUG_TO_KIND: Record<ActivitySlug, EngagementKind> = {
  likes: 'like',
  saved: 'save'
};
const KIND_TO_SLUG: Record<EngagementKind, ActivitySlug> = {
  like: 'likes',
  save: 'saved'
};

/** An unsupported slug resolves to null, never to a default. */
export function activityKindFromSlug(slug: string): EngagementKind | null {
  return Object.prototype.hasOwnProperty.call(SLUG_TO_KIND, slug) ? SLUG_TO_KIND[slug as ActivitySlug] : null;
}
export function activitySlugForKind(kind: EngagementKind): ActivitySlug | undefined {
  return isEngagementKind(kind) ? KIND_TO_SLUG[kind] : undefined;
}

/** How a collection of one kind is titled and described. */
export function describeActivityCollection(kind: EngagementKind): {
  title: string;
  /** The accessible name of the compact control that opens it. */
  action: string;
  /** What an empty collection means, in the product's own words. */
  emptyTitle: string;
  emptyDescription: string;
} {
  switch (kind) {
    case 'like':
      return {
        title: 'Likes',
        action: 'View likes',
        emptyTitle: 'Nothing liked yet',
        emptyDescription: 'Work you like collects here, newest first.'
      };
    case 'save':
      return {
        title: 'Saved',
        action: 'View saved work',
        emptyTitle: 'Nothing saved yet',
        emptyDescription: 'Bookmark work to keep it here for later.'
      };
  }
}
export function describeEngagement(kind: EngagementKind): {
  /** The action, for a control that is not yet engaged. */
  action: string;
  /** The withdrawal, for a control that is. */
  undo: string;
  /** The standing state, for the pressed control. */
  state: string;
} {
  switch (kind) {
    case 'like':
      return {
        action: 'Like',
        undo: 'Remove like',
        state: 'Liked'
      };
    case 'save':
      return {
        action: 'Save',
        undo: 'Remove from saved',
        state: 'Saved'
      };
  }
}
