/**
 * Profile creation domain models.
 *
 * An authenticated account and a public creator profile are RELATED BUT
 * DISTINCT. Authentication (`types/auth.ts`) answers who the account is; a
 * `Profile` (`types/domain.ts`) is the public identity and portfolio that
 * account owns. An account may legitimately exist with no profile at all, which
 * is the state this module models.
 *
 * These shapes are what a future Postgres `profiles` table and Supabase Storage
 * avatar upload must satisfy; nothing here is provider-specific.
 */

import type { Id, Profile } from './domain';
import type { RelativeImageCrop } from './imageCrop';

/** Where an authenticated account stands in relation to owning a profile. */
export type ProfileOnboardingStatus =
/** Not resolved yet: signed out, still initializing, or the check is in flight. */
'unknown'
/** No profile is needed right now (signed out, or the address is unverified). */ |
'not-required'
/** Authenticated and verified, but no profile exists. Creator surfaces must onboard. */ |
'required'
/** The account owns a profile. */ |
'ready';

/**
 * An avatar the user has CHOSEN but which has NOT been uploaded anywhere.
 *
 * `previewUrl` is a local object URL, valid only for this page. `isPersisted`
 * is deliberately always false in the prototype so the UI can never imply that
 * a file reached storage. A future implementation uploads `file` to Supabase
 * Storage and replaces this with the returned public URL.
 */
export type PreparedAvatar = {
  file: File;
  previewUrl: string;
  fileName: string;
  sizeBytes: number;
  isPersisted: false;
  widthPixels?: number;
  heightPixels?: number;
  /** Original retained locally so reopening Reposition does not crop an already cropped bitmap. */
  originalSource?: File | string;
  crop?: RelativeImageCrop;
};

/** Why a chosen file was rejected before it was ever sent anywhere. */
export type AvatarRejectionCode = 'unsupported_type' | 'too_large' | 'unreadable';

/** Everything needed to establish the initial creator profile — identity only. */
export type CreateProfileInput = {
  name: string;
  /** Normalized, without the leading "@". */
  handle: string;
  headline: string;
  location?: string;
  /** Transient; the transport for this is not implemented in the prototype. */
  avatar?: PreparedAvatar;
};

/** The lifecycle of one handle-availability check. */
export type HandleCheckStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'error';

/**
 * The answer to "can this account take this handle?".
 *
 * FRONTEND ONLY. This is a usability check to keep obviously taken handles out
 * of the form. Real uniqueness will be enforced by a Postgres unique constraint
 * on `profiles.handle`; a check that passes here can still lose a race at
 * insert time, and `createProfile` must be able to reject with `handle_taken`.
 */
export type HandleAvailability = {
  /** The normalized handle the answer applies to. */
  handle: string;
  isAvailable: boolean;
  /** Present when unavailable, e.g. "That handle is already taken." */
  reason?: string;
};
export type ProfileErrorCode = 'handle_taken' | 'invalid_handle' | 'invalid_input' | 'not_found' | 'permission_denied' | 'network' | 'unknown';

/** What the profile service throws. Same shape contract as `AuthServiceError`. */
export class ProfileServiceError extends Error {
  readonly code: ProfileErrorCode;
  constructor(code: ProfileErrorCode, message: string) {
    super(message);
    this.name = 'ProfileServiceError';
    this.code = code;
  }
}

/** What category management throws. Same shape contract as `ProfileServiceError`. */
export class CategoryMutationError extends Error {
  readonly code: import('./domain').CategoryMutationErrorCode;
  /** Set on `category_not_empty`, so the UI can name the work standing in the way. */
  readonly blockingProjectCount: number;
  constructor(code: import('./domain').CategoryMutationErrorCode, message: string, blockingProjectCount = 0) {
    super(message);
    this.name = 'CategoryMutationError';
    this.code = code;
    this.blockingProjectCount = blockingProjectCount;
  }
}

/** The result of establishing a profile for an account. */
export type CreateProfileResult = {
  profile: Profile;
  accountId: Id;
  /**
   * False whenever no storage backend received the chosen avatar, so the UI can
   * say so rather than showing a fake upload success.
   */
  avatarPersisted: boolean;
};
