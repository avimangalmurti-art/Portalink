/**
 * PROTOTYPE AUTHENTICATION — NOT PRODUCTION INFRASTRUCTURE.
 *
 * This file exists so the auth UX can be designed and reviewed before a real
 * provider is connected. It is deliberately kept in `services/prototype/` rather
 * than beside the data mocks so it is obvious at a glance that nothing here is
 * an implementation anyone should ship.
 *
 * What it deliberately does NOT do:
 *  - no network requests, no Supabase client, no environment variables
 *  - no access tokens or refresh tokens of any kind, real or fake
 *  - no persistence: reloading the page returns to signed out, because no
 *    session was ever established
 *  - no email is sent, and the service never claims one was
 *
 * What it does do: hold an in-memory account list and session so every state the
 * UI must handle — invalid credentials, unverified email, expired recovery,
 * success — can actually be reached. Replace this whole module with
 * `SupabaseAuthService` implementing the same `AuthService` interface; no
 * presentation component should need to change.
 */

import { AuthServiceError } from '../../types/auth';
import type { AccountDeletionCapability, AccountSecurityCapability, AccountSecurityState, AuthRecoverySession, AuthSession, AuthUser, ChangeEmailInput, ChangeEmailResult, ChangePasswordInput, ChangePasswordResult, DeleteAccountInput, DeleteAccountResult, PasswordResetRequestInput, PasswordResetRequestResult, PendingEmailChange, ResendVerificationInput, ResendVerificationResult, SignInInput, SignUpInput, SignUpResult, UpdatePasswordInput } from '../../types/auth';
import type { AuthService } from '../interfaces';
import { getProfileById } from '../../data/profiles';

/** The one password the seeded development accounts accept. */
export const PROTOTYPE_PASSWORD = 'portalinc';

/** Shown in the sign-in sheet so a reviewer can get in without guessing. */
export const prototypeCredentialsHint = {
  email: 'avi@portalinc.dev',
  password: PROTOTYPE_PASSWORD
};
type PrototypeAccount = {
  user: AuthUser;
  password: string;
};
function accountFor(profileId: string, email: string, isEmailVerified: boolean): PrototypeAccount {
  const profile = getProfileById(profileId);
  return {
    password: PROTOTYPE_PASSWORD,
    user: {
      id: `user-${profile.id}`,
      email,
      profileId: profile.id,
      displayName: profile.name,
      initials: profile.initials,
      isEmailVerified
    }
  };
}

// Two seeded accounts, so owner mode can be checked against more than one
// identity and is never assumed to mean "avi".
const accounts = new Map<string, PrototypeAccount>([['avi@portalinc.dev', accountFor('avi', 'avi@portalinc.dev', true)], ['luma@portalinc.dev', accountFor('studio-luma', 'luma@portalinc.dev', true)],
// A verified account that owns NO profile, so the onboarding flow can be
// reviewed. It is never given a seeded portfolio: `profileId` stays empty
// until a profile is actually created.
['new@portalinc.dev', {
  password: PROTOTYPE_PASSWORD,
  user: {
    id: 'user-new-account',
    email: 'new@portalinc.dev',
    profileId: '',
    displayName: 'New account',
    initials: 'NA',
    isEmailVerified: true
  }
}]]);
let currentSession: AuthSession | null = null;
let recoverySession: AuthRecoverySession | null = null;
/**
 * Email changes requested this session, keyed by account id. They stay PENDING
 * forever, because confirming one needs mail that cannot be delivered — which is
 * exactly the state the UI has to handle. In memory only; a reload clears it.
 */
const pendingEmailChanges = new Map<string, PendingEmailChange>();
const listeners = new Set<(session: AuthSession | null) => void>();
function publish() {
  listeners.forEach((listener) => listener(currentSession));
}
/**
 * The session as the prototype BACKEND sees it.
 *
 * This exists so other prototype implementations can enforce authentication
 * themselves rather than trusting an argument or a React context. In a real
 * deployment the equivalent is the access token the server verifies on every
 * request; here it is this module's own session, which is the closest truthful
 * analogue. It is deliberately not exported to presentation code — only other
 * service implementations read it.
 */
export function readPrototypeSession(): AuthSession | null {
  return currentSession;
}

/** A visible pause, so loading states are real rather than theoretical. */
function settle<T>(value: T, latency = 420): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), latency));
}
function normalise(email: string) {
  return email.trim().toLowerCase();
}
export const prototypeAuthService: AuthService = {
  async getSession(): Promise<AuthSession | null> {
    // Nothing is restored from storage: the prototype starts signed out.
    return settle(currentSession, 300);
  },
  onAuthStateChange(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async signIn({
    email,
    password
  }: SignInInput): Promise<AuthSession> {
    await settle(null);
    const account = accounts.get(normalise(email));
    if (!account || account.password !== password) {
      throw new AuthServiceError('invalid_credentials', 'That email and password do not match an account.');
    }
    if (!account.user.isEmailVerified) {
      // Only reachable for an account made through the prototype sign-up flow.
      // The seeded development accounts are verified, so reviewers are never
      // blocked by a confirmation step that no email backend can complete.
      throw new AuthServiceError('email_not_verified', 'This account was created in the prototype sign-up flow, which requires confirmation that no email service can deliver. Use the development account below to sign in.');
    }
    currentSession = {
      user: account.user,
      isPrototype: true
    };
    publish();
    return currentSession;
  },
  async signUp({
    email,
    password
  }: SignUpInput): Promise<SignUpResult> {
    await settle(null);
    const key = normalise(email);
    if (accounts.has(key)) {
      throw new AuthServiceError('email_taken', 'An account already uses that email address.');
    }
    if (password.length < 8) {
      throw new AuthServiceError('weak_password', 'Choose a password of at least 8 characters.');
    }
    // A new account has no portfolio of its own yet, so it is not tied to an
    // existing profile. It stays unverified, which is what a real
    // email-confirmation flow produces.
    accounts.set(key, {
      password,
      user: {
        id: `user-${key}`,
        email: key,
        profileId: '',
        displayName: key.split('@')[0],
        initials: key.slice(0, 2).toUpperCase(),
        isEmailVerified: false
      }
    });
    return {
      email: key,
      // Never authenticate on sign-up: verification is required.
      requiresEmailVerification: true,
      session: null
    };
  },
  async attachProfile(profileId: string): Promise<AuthSession> {
    await settle(null, 200);
    if (!currentSession) {
      throw new AuthServiceError('invalid_credentials', 'Sign in before creating a profile.');
    }
    // In production the profile row references the auth user and the session is
    // re-read. Here the in-memory account is updated so ownership resolves for
    // the rest of this session only — a reload starts signed out again.
    const nextUser: AuthUser = {
      ...currentSession.user,
      profileId
    };
    const account = accounts.get(nextUser.email);
    if (account) {
      accounts.set(nextUser.email, {
        ...account,
        user: nextUser
      });
    }
    currentSession = {
      ...currentSession,
      user: nextUser
    };
    publish();
    return currentSession;
  },
  async signOut(): Promise<void> {
    await settle(null, 320);
    currentSession = null;
    publish();
  },
  async getAccountSecurityCapability(): Promise<AccountSecurityCapability> {
    return settle({
      // Changing a password only needs the in-memory account, so this state is
      // genuinely reachable and the whole flow can be reviewed end to end.
      canChangePassword: true,
      // Requesting a change is reachable; CONFIRMING it is not, which is why the
      // request resolves as pending rather than as changed.
      canChangeEmail: true,
      // The one hard limit: nothing here can send mail, and it never claims to.
      canSendVerificationEmail: false,
      emailChangeRequiresVerification: true,
      verificationReason: 'No email service is connected to this prototype, so no confirmation message can be delivered.'
    }, 200);
  },
  async getAccountSecurityState(): Promise<AccountSecurityState> {
    await settle(null, 200);
    if (!currentSession) {
      throw new AuthServiceError('invalid_credentials', 'Sign in to view your security settings.');
    }
    const account = accounts.get(normalise(currentSession.user.email));
    return {
      // The authoritative address, straight from the session. A pending change
      // never moves it.
      email: currentSession.user.email,
      isEmailVerified: currentSession.user.isEmailVerified,
      pendingEmailChange: pendingEmailChanges.get(currentSession.user.id) ?? null,
      hasPassword: Boolean(account?.password)
    };
  },
  async changePassword({
    accountId,
    currentPassword,
    newPassword
  }: ChangePasswordInput): Promise<ChangePasswordResult> {
    await settle(null);
    if (!currentSession || currentSession.user.id !== accountId) {
      throw new AuthServiceError('reauthentication_required', 'Sign in again before changing your password.');
    }
    const key = normalise(currentSession.user.email);
    const account = accounts.get(key);
    if (!account) {
      throw new AuthServiceError('invalid_credentials', 'This account could not be read. Sign in again.');
    }
    // Verified HERE, never in the form: only the service holds the credential.
    if (account.password !== currentPassword) {
      throw new AuthServiceError('invalid_credentials', 'That is not your current password.');
    }
    if (newPassword.length < 8) {
      throw new AuthServiceError('weak_password', 'Choose a password of at least 8 characters.');
    }
    if (newPassword === currentPassword) {
      throw new AuthServiceError('same_password', 'Choose a password different from your current one.');
    }
    // A real change to the in-memory account, so signing out and back in with the
    // new password actually works for the rest of this session.
    accounts.set(key, {
      ...account,
      password: newPassword
    });
    return {
      isChanged: true,
      message: 'Your password is updated for this prototype session. It is held in memory only, so a reload restores the development password.',
      // Nothing else to sign out: no tokens exist anywhere in this prototype.
      didSignOutOtherSessions: false
    };
  },
  async requestEmailChange({
    accountId,
    newEmail
  }: ChangeEmailInput): Promise<ChangeEmailResult> {
    await settle(null);
    if (!currentSession || currentSession.user.id !== accountId) {
      throw new AuthServiceError('reauthentication_required', 'Sign in again before changing your email address.');
    }
    const key = normalise(newEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(key)) {
      throw new AuthServiceError('invalid_email', 'Enter a valid email address.');
    }
    if (key === normalise(currentSession.user.email)) {
      throw new AuthServiceError('invalid_email', 'That is already the address on this account.');
    }
    if (accounts.has(key)) {
      throw new AuthServiceError('email_taken', 'An account already uses that email address.');
    }
    const pending: PendingEmailChange = {
      newEmail: key,
      requestedAt: new Date().toISOString(),
      // No mail left, so this must not claim otherwise.
      deliveryConfirmed: false
    };
    pendingEmailChanges.set(currentSession.user.id, pending);
    return {
      // Accepted, NOT applied: the confirmed address on the session is untouched
      // and stays that way until a real service confirms the new one.
      status: 'pending',
      email: key,
      deliveryConfirmed: false,
      message: 'The change is recorded as pending. No confirmation email can be delivered by this prototype, so the address on your account is unchanged.'
    };
  },
  async resendVerification({
    accountId,
    target
  }: ResendVerificationInput): Promise<ResendVerificationResult> {
    await settle(null, 320);
    if (!currentSession || currentSession.user.id !== accountId) {
      throw new AuthServiceError('reauthentication_required', 'Sign in again before requesting a confirmation email.');
    }
    const pending = pendingEmailChanges.get(accountId);
    const email = target === 'pending-email' ? pending?.newEmail ?? currentSession.user.email : currentSession.user.email;
    // The whole point: no fake timer, no "check your inbox", no claim of delivery.
    return {
      status: 'unavailable',
      email,
      message: 'No confirmation email was sent. Sending mail requires an email service, and none is connected to this prototype.'
    };
  },
  async requestPasswordReset({
    email
  }: PasswordResetRequestInput): Promise<PasswordResetRequestResult> {
    await settle(null);
    const key = normalise(email);
    // Real providers answer identically whether or not the address exists, so
    // the prototype does too rather than leaking which accounts are real.
    recoverySession = accounts.has(key) ? {
      email: key,
      isPrototype: true
    } : null;
    return {
      email: key,
      // Truthful: no mail was sent, and none can be from a prototype.
      deliveryConfirmed: false,
      message: 'No email is delivered in this prototype. Continue to set a new password to review that step.'
    };
  },
  async getAccountDeletionCapability(): Promise<AccountDeletionCapability> {
    // Truthful: there is no backend, so the capability reports unavailable and
    // says why. The UI reads this and presents the flow as reviewable rather
    // than functional, instead of offering a control that does nothing.
    return settle({
      isAvailable: false,
      reason: 'Account deletion is a server-side operation and no account service is connected to this prototype.',
      // Written here because only an implementation knows what its backend owns.
      removes: ['Your account and sign-in credentials', 'Your creator profile and handle', 'Every project you have published, including its files', 'Your followers, the creators you follow, and your saved work', 'Your appearance and account preferences']
    }, 200);
  },
  async deleteAccount({
    accountId,
    confirmation
  }: DeleteAccountInput): Promise<DeleteAccountResult> {
    await settle(null);
    if (!currentSession || currentSession.user.id !== accountId) {
      throw new AuthServiceError('invalid_credentials', 'Sign in again before deleting this account.');
    }
    // Checked here as well as in the form: an authenticated destructive
    // operation must never rely on the client having asked correctly.
    if (normalise(confirmation) !== normalise(currentSession.user.email)) {
      throw new AuthServiceError('confirmation_mismatch', 'That does not match the email address on this account.');
    }
    // The one thing this must not do is pretend. No account is removed, the
    // session is left exactly as it was, and the failure explains itself.
    throw new AuthServiceError('deletion_unavailable', 'Nothing was deleted. Permanently removing an account requires an authenticated server-side request, and no account service is connected to this prototype.');
  },
  async getRecoverySession(): Promise<AuthRecoverySession | null> {
    return settle(recoverySession, 200);
  },
  async updatePassword({
    password
  }: UpdatePasswordInput): Promise<void> {
    await settle(null);
    if (!recoverySession) {
      throw new AuthServiceError('recovery_session_invalid', 'This recovery link is invalid or has expired. Request a new one.');
    }
    if (password.length < 8) {
      throw new AuthServiceError('weak_password', 'Choose a password of at least 8 characters.');
    }
    const account = accounts.get(recoverySession.email);
    if (account) {
      accounts.set(recoverySession.email, {
        ...account,
        password
      });
    }
    // A used recovery context is spent: the next attempt must fail.
    recoverySession = null;
  }
};