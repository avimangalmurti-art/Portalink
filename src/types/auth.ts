/**
 * Authentication domain models.
 *
 * These describe the shape of an authenticated identity as the UI needs it, not
 * the shape any particular provider returns. A future `SupabaseAuthService` maps
 * its own user/session objects onto these before anything in the product sees
 * them, so presentation never learns a vendor's field names.
 *
 * Deliberately absent: access tokens, refresh tokens, and anything else that is
 * infrastructure rather than identity. The prototype holds no tokens at all.
 */

import type { Id } from './domain';

/** The account itself. `profileId` is what ownership derives from. */
export type AuthUser = {
  id: Id;
  email: string;
  /** The portfolio this account owns. Owner mode is `viewedProfileId === profileId`. */
  profileId: Id;
  displayName: string;
  initials: string;
  /** False until the account has confirmed its address. */
  isEmailVerified: boolean;
};

/**
 * An active session. `isPrototype` is true whenever a development
 * implementation is standing in for real authentication, so the UI can say so
 * truthfully rather than implying a real session exists.
 */
export type AuthSession = {
  user: AuthUser;
  isPrototype: boolean;
};

/** The one state machine the whole application reads. */
export type AuthPhase = 'initializing' | 'unauthenticated' | 'authenticating' | 'authenticated' | 'failed' | 'signing-out';

/** A recovery context created by following a password-reset link. */
export type AuthRecoverySession = {
  email: string;
  isPrototype: boolean;
};
/**
 * Every failure the UI branches on. Codes exist where the recovery differs:
 * a weak password re-focuses the new-password field, a wrong current password
 * re-focuses that one, `reauthentication_required` sends the person back through
 * sign-in, and `rate_limited` means wait rather than retry immediately.
 */
export type AuthErrorCode = 'invalid_credentials' | 'email_not_verified' | 'email_taken' | 'weak_password' | 'same_password' | 'invalid_email' | 'reauthentication_required' | 'verification_unavailable' | 'recovery_session_invalid' | 'rate_limited' | 'network' | 'confirmation_mismatch' | 'deletion_unavailable' | 'unsupported' | 'unknown';

/** A failure in the form the UI can render: a code to branch on, a sentence to show. */
export type AuthError = {
  code: AuthErrorCode;
  message: string;
};

/**
 * What services throw. Extending `Error` keeps it compatible with the shared
 * `useAsyncAction` message handling while still carrying a branchable code.
 */
export class AuthServiceError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthServiceError';
    this.code = code;
  }
}

/** Narrows an unknown thrown value into something the UI can present. */
export function toAuthError(caught: unknown): AuthError {
  if (caught instanceof AuthServiceError) {
    return {
      code: caught.code,
      message: caught.message
    };
  }
  if (caught instanceof Error) {
    return {
      code: 'unknown',
      message: caught.message
    };
  }
  return {
    code: 'unknown',
    message: 'Something went wrong. Please try again.'
  };
}
/**
 * Where the person was trying to go when authentication was demanded.
 *
 * Held separately from the auth sheet's visual state so cancelling a sheet can
 * never re-trigger the navigation that opened it, and so a fulfilled intent is
 * consumed exactly once. Destinations are addressed by stable id — never by a
 * display name.
 */
export type AuthIntent = {
  kind: 'my-profile';
} | {
  kind: 'view-profile';
  profileId: Id;
} | {
  kind: 'view-portfolio';
  profileId: Id;
  categoryId?: Id;
} | {
  kind: 'studio';
} | {
  /** Opens the creator's publishing flow after authentication and onboarding. */
  kind: 'create-project';
} | {
  kind: 'messages';
  recipientProfileId?: Id;
} | {
  /**
   * A canonical URL the person asked for while signed out — typed, pasted, or
   * refreshed. The path is carried verbatim so the destination survives the whole
   * gate, including profile onboarding, and is continued to afterwards.
   */
  kind: 'route';
  path: string;
  /** What the destination is, for the gate's wording. */
  label: string;
} | {
  kind: 'interaction';
  /**
   * What the person was trying to do, for the gate's wording. Interactions are
   * deliberately not replayed after sign-in — an account mutation such as a
   * follow should never fire on its own; the person is simply let through.
   */
  label: string;
};
export type SignInInput = {
  email: string;
  password: string;
};
export type SignUpInput = {
  email: string;
  password: string;
};

/**
 * Signing up does not mean signing in. When the service reports that the
 * address must be confirmed, `session` is null and the UI must say so instead of
 * claiming the person is authenticated.
 */
export type SignUpResult = {
  email: string;
  requiresEmailVerification: boolean;
  session: AuthSession | null;
};
export type PasswordResetRequestInput = {
  email: string;
};

/**
 * `deliveryConfirmed` is false whenever no mail was actually sent — the
 * prototype never claims an email arrived.
 */
export type PasswordResetRequestResult = {
  email: string;
  deliveryConfirmed: boolean;
  message: string;
};
export type UpdatePasswordInput = {
  password: string;
};

/**
 * Whether this implementation can actually delete an account, and what deletion
 * would remove.
 *
 * Modelled as a capability for the same reason uploads are: the UI must be able
 * to tell the truth about an operation it cannot perform, rather than presenting
 * a destructive control that silently does nothing. `removes` is written by the
 * implementation because only it knows what its backend actually owns — the UI
 * lists whatever it is told and never invents consequences.
 */
export type AccountDeletionCapability = {
  isAvailable: boolean;
  /** Plain sentences describing exactly what deletion removes. */
  removes: readonly string[];
  /** Why deletion is unavailable. Required whenever `isAvailable` is false. */
  reason?: string;
};

/**
 * Deleting an account is authenticated and irreversible, so it carries an
 * explicit confirmation the person had to type. A real implementation also
 * re-authenticates; that belongs to the implementation, not to this shape.
 */
export type DeleteAccountInput = {
  /** The account being deleted, so an implementation never infers it. */
  accountId: Id;
  /** Must exactly equal the account's email address. */
  confirmation: string;
};

/**
 * The outcome of a deletion request. `isDeleted` is only ever true when an
 * account was genuinely removed — a prototype must report false rather than
 * claiming a deletion it did not perform.
 */
export type DeleteAccountResult = {
  isDeleted: boolean;
  message: string;
};

/* ────────────────────────────────────────────────────────────────────────────
   ACCOUNT SECURITY — credentials on an already-authenticated account.
   Provider-neutral by construction: no vendor types, no tokens, no transport.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * What this implementation can actually do to an authenticated account's
 * credentials. Read BEFORE any security control is offered, for the same reason
 * uploads and deletion are capability-gated: a control that silently does nothing
 * is worse than a control that is honestly unavailable.
 *
 * `canChangePassword` is false for an account that has no password at all (a
 * future OAuth-only identity), which is a different condition from a backend that
 * cannot perform the change — hence the separate reasons.
 */
export type AccountSecurityCapability = {
  canChangePassword: boolean;
  canChangeEmail: boolean;
  /** Whether verification mail can genuinely be delivered by this implementation. */
  canSendVerificationEmail: boolean;
  /** Whether an email change takes effect only after the new address confirms. */
  emailChangeRequiresVerification: boolean;
  /** Why an operation is unavailable. Required whenever its flag is false. */
  passwordReason?: string;
  emailReason?: string;
  verificationReason?: string;
};

/**
 * Changing the password of a signed-in account. The current password is sent so
 * the SERVICE can verify it: the client may check format and matching, but it can
 * never prove a credential and must not imply that it has.
 */
export type ChangePasswordInput = {
  accountId: Id;
  currentPassword: string;
  newPassword: string;
};

/**
 * `isChanged` is only true when the credential genuinely changed. Deliberately
 * not `Promise<void>`: presentation must never infer success from the mere
 * absence of an exception.
 */
export type ChangePasswordResult = {
  isChanged: boolean;
  message: string;
  /** True when the change ended other sessions, so the UI can say so. */
  didSignOutOtherSessions?: boolean;
};

/** Requesting a new address for a signed-in account. */
export type ChangeEmailInput = {
  accountId: Id;
  newEmail: string;
};

/**
 * The outcome of an email-change request, with the three cases kept apart because
 * they read differently to the person:
 *
 *  - `status: 'changed'`     — the confirmed address is now `email`.
 *  - `status: 'pending'`     — accepted, but `email` only becomes authoritative
 *                             once verified. The confirmed address is UNCHANGED,
 *                             and the UI must show the new one as pending.
 *  - `status: 'unavailable'` — nothing happened, and `message` says why.
 *
 * `deliveryConfirmed` is false whenever no mail actually left, so a pending
 * change never implies "check your inbox" on an implementation that cannot send.
 */
export type ChangeEmailResult = {
  status: 'changed' | 'pending' | 'unavailable';
  /** The address the result refers to: confirmed when changed, pending otherwise. */
  email: string;
  deliveryConfirmed: boolean;
  message: string;
};

/**
 * An email change awaiting confirmation. Held separately from `AuthUser.email`
 * precisely so the confirmed address is never optimistically overwritten — only
 * the authoritative session may move it.
 */
export type PendingEmailChange = {
  newEmail: string;
  requestedAt: string;
  deliveryConfirmed: boolean;
};

/** What resending verification mail did. */
export type ResendVerificationInput = {
  accountId: Id;
  /** Which address to confirm: the account's own, or a pending change. */
  target: 'account' | 'pending-email';
};

/**
 * `status: 'sent'` is the ONLY value that may be presented as "sent", and an
 * implementation must not use it unless mail genuinely left. A prototype reports
 * `'unavailable'`. `retryAfterSeconds` accompanies `'rate-limited'`.
 */
export type ResendVerificationResult = {
  status: 'sent' | 'unavailable' | 'rate-limited';
  email: string;
  message: string;
  retryAfterSeconds?: number;
};

/**
 * Everything the Security surface needs about the account's credential state,
 * read as one snapshot so the UI never assembles it from separate requests that
 * could disagree.
 */
export type AccountSecurityState = {
  /** The authoritative, confirmed address. */
  email: string;
  isEmailVerified: boolean;
  /** Present only while a requested address is awaiting confirmation. */
  pendingEmailChange: PendingEmailChange | null;
  /** False for an identity with no password (e.g. a future OAuth-only account). */
  hasPassword: boolean;
};
