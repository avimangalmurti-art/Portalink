import type { Id } from './domain';

/**
 * Comments and replies.
 *
 * One level of nesting, deliberately: a reply names the comment it answers, and a
 * reply to a reply still belongs to the same root thread. Arbitrary depth is a
 * different product with different reading and moderation problems, and nothing
 * here pretends to solve them.
 */

/**
 * The author, as the SERVICE resolves it.
 *
 * Identity is mutable — a creator can rename themselves or change their picture —
 * so it is never copied into component state or frozen onto the comment at the
 * point of writing. The service resolves it from the canonical profile on every
 * read, which is why a renamed author reads correctly on an old comment.
 */
export type CommentAuthor = {
  /** The canonical profile id. Null for an account with no creator profile yet. */
  profileId: Id | null;
  name: string;
  initials: string;
  avatarUrl?: string;
};
export type Comment = {
  id: Id;
  /** The project this belongs to. A comment cannot exist without one. */
  projectId: Id;
  author: CommentAuthor;
  body: string;
  /** ISO 8601. */
  createdAt: string;
  /** Present only when the body has been edited. Editing is not built yet. */
  updatedAt?: string;
  /**
   * The comment this answers, or null for a top-level comment. `rootId` is the
   * top-level comment the whole thread hangs from — equal to `parentId` for a
   * direct reply — so a thread can be assembled without walking the chain.
   */
  parentId: Id | null;
  rootId: Id | null;
  /** Whether the VIEWER may delete this. Decided by the service, not the UI. */
  canDelete: boolean;
};

/** One top-level comment with its replies, ordered oldest first. */
export type CommentThread = {
  comment: Comment;
  replies: Comment[];
};

/** What the service reports about the whole conversation on a project. */
export type ProjectComments = {
  projectId: Id;
  threads: CommentThread[];
  /** Every comment and reply, so a count never has to be re-derived by the UI. */
  totalCount: number;
};
export type CommentErrorCode = 'unauthenticated' | 'not_found' | 'permission_denied' | 'validation' | 'rate_limited' | 'network' | 'unknown';
export class CommentServiceError extends Error {
  readonly code: CommentErrorCode;
  constructor(code: CommentErrorCode, message: string) {
    super(message);
    this.name = 'CommentServiceError';
    this.code = code;
  }
}

/**
 * Only these describe a condition an identical second request could clear.
 * `validation` is excluded on purpose: the text has to change first, so offering
 * "Try again" would just fail again.
 */
export function isRetryableCommentCode(code: CommentErrorCode): boolean {
  return code === 'network' || code === 'rate_limited' || code === 'unknown';
}
export const COMMENT_MAX_LENGTH = 1000;

/**
 * The one place a comment body is judged, so the client and the service agree.
 * The service still validates independently — this is for immediate feedback, not
 * for trust.
 */
export function validateCommentBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) {
    return 'Write something before posting.';
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    return `Keep it under ${COMMENT_MAX_LENGTH} characters. This is ${trimmed.length}.`;
  }
  return null;
}