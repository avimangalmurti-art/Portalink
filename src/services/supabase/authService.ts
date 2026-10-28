import type { Session, User } from '@supabase/supabase-js';
import type { AuthService } from '../interfaces';
import { AuthServiceError, isFutureIssuedJwtError, SESSION_NOT_READY_MESSAGE, toAuthError } from '../../types/auth';
import type {
  AccountSecurityState,
  AuthSession,
  AuthUser,
} from '../../types/auth';
import { accountDeletionEnabled, createPasswordRecoveryClient, passwordRecovery, recoveryCallbackFailed, requireSupabase, readSocialProviders } from './client';
import { clearPasswordRecoveryReturn, passwordRecoveryRedirect } from '../../utils/passwordRecoveryReturn';
import { authReturnOrigin } from '../../utils/authReturnOrigin';
import { readRegistrationDraft, readRegistrationProfile, readSharedReturnPath } from '../../features/auth/registration';
import { socialRegistration } from '../../features/auth/socialRegistration';

function textMetadata(user: User, key: string): string {
  const value: unknown = user.user_metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function initialsFor(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'TP';
}

const sessionTimingRetryDelays = [500, 1000, 2000];
const pendingSessions = new Map<string, Promise<AuthSession | null>>();
let lastMappedAccountId: string | null = null;
let sessionGeneration = 0;
let observedAccountId: string | null | undefined;

function observeSessionAccount(accountId: string | null, signedOut = false): void {
  if (signedOut || observedAccountId !== undefined && observedAccountId !== accountId) {
    sessionGeneration += 1;
    pendingSessions.clear();
  }
  observedAccountId = accountId;
  if (!accountId) lastMappedAccountId = null;
}

function assertSessionGeneration(generation: number): void {
  if (generation !== sessionGeneration) {
    throw new AuthServiceError('reauthentication_required', 'Your sign-in session changed. Please sign in again to continue.');
  }
}

async function assertCurrentAccount(accountId: string, generation: number): Promise<void> {
  assertSessionGeneration(generation);
  const { data, error } = await requireSupabase().auth.getSession();
  assertSessionGeneration(generation);
  if (error) throw authFailure(error, 'Your session could not be checked.');
  if (data.session?.user.id !== accountId) {
    throw new AuthServiceError('reauthentication_required', 'Your sign-in session changed. Please sign in again to continue.');
  }
}

async function profileIdentity(accountId: string, generation: number): Promise<{
  profileId: string;
  displayName: string;
}> {
  const client = requireSupabase();
  for (let attempt = 0; ; attempt++) {
    // A sign-out/account switch during a delay must stop this lookup. The SDK
    // supplies the current bearer token, which may differ from the first one.
    await assertCurrentAccount(accountId, generation);
    assertSessionGeneration(generation);
    const { data, error } = await client
      .from('profiles')
      .select('id,name')
      .eq('account_id', accountId)
      .maybeSingle();
    assertSessionGeneration(generation);
    if (error) {
      if (isFutureIssuedJwtError(error) && attempt < sessionTimingRetryDelays.length) {
        // Retry the read with the existing session, never replay credentials or
        // mint another token whose issued-at time would be even further ahead.
        await new Promise<void>(resolve => window.setTimeout(resolve, sessionTimingRetryDelays[attempt]));
        continue;
      }
      throw authFailure(error, 'Your profile could not be read.');
    }
    const row = data as unknown as { id: string; name: string } | null;
    return {
      profileId: row?.id ?? '',
      displayName: row?.name ?? '',
    };
  }
}

function toAuthSession(session: Session | null): Promise<AuthSession | null> {
  if (!session || session.user.is_anonymous) {
    observeSessionAccount(null);
    return Promise.resolve(null);
  }
  if (observedAccountId === undefined) observedAccountId = session.user.id;
  const generation = sessionGeneration;
  // SIGNED_IN and signInWithPassword resolve together. Share only their
  // in-flight work, never a cached profile identity after a write or sign-out.
  const key = `${generation}:${session.user.id}:${session.access_token}`;
  const pending = pendingSessions.get(key);
  if (pending) return pending;
  const task = mapAuthSession(session, generation).finally(() => {
    if (pendingSessions.get(key) === task) pendingSessions.delete(key);
  });
  pendingSessions.set(key, task);
  return task;
}

async function mapAuthSession(session: Session, generation: number): Promise<AuthSession> {
  let user = session.user;
  // Ownership always comes from the RLS-protected profile row. User metadata is
  // editable by the account and must never be trusted as an authorization fact.
  const identity = await profileIdentity(user.id, generation);
  const isPasswordRecovery = Boolean(passwordRecovery.read(session));
  let registration = identity.profileId || isPasswordRecovery ? undefined : readRegistrationProfile(user.user_metadata?.portalink_registration);
  if (!identity.profileId && !isPasswordRecovery && !registration) {
    // A cached session can predate signup metadata. Resolve the confirmed user
    // before falling back to this browser's email-bound pending draft.
    const fresh = await requireSupabase().auth.getUser().catch(() => null);
    if (fresh?.data.user?.id === user.id) {
      user = fresh.data.user;
      registration = readRegistrationProfile(user.user_metadata?.portalink_registration);
    }
    if (!registration && user.email) {
      const saved = await readRegistrationDraft(user.email).catch(() => null);
      registration = saved?.registration;
    }
  }
  const email = user.email ?? '';
  const displayName = identity.displayName || textMetadata(user, 'display_name') || textMetadata(user, 'full_name') || email.split('@')[0] || 'Creator';
  if (!identity.profileId && !isPasswordRecovery && !registration && ['google', 'apple'].includes(user.app_metadata?.provider ?? '')) {
    registration = socialRegistration(user, new URLSearchParams(window.location.search).get('onboarding_return') ?? undefined);
  }
  const mapped: AuthUser = {
    id: user.id,
    email,
    profileId: identity.profileId,
    displayName,
    initials: initialsFor(displayName),
    isEmailVerified: Boolean(user.email_confirmed_at),
    registration,
  };

  await assertCurrentAccount(user.id, generation);
  assertSessionGeneration(generation);
  lastMappedAccountId = user.id;
  return { user: mapped, isPrototype: false, isPasswordRecovery };
}

function authFailure(error: { message: string; status?: number | null; code?: string }, fallback: string): AuthServiceError {
  if (isFutureIssuedJwtError(error)) {
    return new AuthServiceError('session_not_ready', SESSION_NOT_READY_MESSAGE);
  }
  const message = error.message || fallback;
  const normalized = message.toLowerCase();
  if (error.code === 'same_password' || normalized.includes('different from the old password')) {
    return new AuthServiceError('same_password', 'Choose a password different from your current one.');
  }
  if (error.code === 'email_address_not_authorized') {
    return new AuthServiceError('verification_unavailable', 'Password-reset email is unavailable right now. Please try again later.');
  }
  if (normalized.includes('invalid login credentials')) {
    return new AuthServiceError('invalid_credentials', 'That email and password do not match an account.');
  }
  if (normalized.includes('email not confirmed')) {
    return new AuthServiceError('email_not_verified', 'Confirm your email address before signing in.');
  }
  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return new AuthServiceError('email_taken', 'An account already uses that email address.');
  }
  if (normalized.includes('password') && (normalized.includes('weak') || normalized.includes('characters'))) {
    return new AuthServiceError('weak_password', message);
  }
  if (error.status === 429 || normalized.includes('rate limit')) {
    return new AuthServiceError('rate_limited', 'Too many attempts. Wait a moment and try again.');
  }
  if (normalized.includes('session') || normalized.includes('jwt')) {
    return new AuthServiceError('reauthentication_required', 'Sign in again before continuing.');
  }
  return new AuthServiceError('network', message);
}

async function currentProviderUser(): Promise<User> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw error
      ? authFailure(error, 'Your account could not be read.')
      : new AuthServiceError('reauthentication_required', 'Sign in again before continuing.');
  }
  return data.user;
}

async function verifiedRecoverySession() {
  if (recoveryCallbackFailed) return null;
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw authFailure(error, 'Your recovery link could not be checked.');
  const recovery = passwordRecovery.read(data.session);
  if (!recovery || !data.session) return null;
  const recovered = data.session;
  const verified = await client.auth.getUser(recovered.access_token);
  if (verified.error) {
    if (verified.error.status === 401 || verified.error.status === 403) { passwordRecovery.clear(recovered); return null; }
    throw authFailure(verified.error, 'Your recovery link could not be checked.');
  }
  if (verified.data.user?.id !== recovered.user.id) { passwordRecovery.clear(recovered); return null; }
  return passwordRecovery.read(recovered) ? { session: recovered, recovery } : null;
}

export const supabaseAuthService: AuthService = {
  async getSession() {
    const client = requireSupabase();
    const { data, error } = await client.auth.getSession();
    if (error) {
      throw authFailure(error, 'Your session could not be restored.');
    }
    return toAuthSession(data.session);
  },

  onAuthStateChange(listener) {
    const client = requireSupabase();
    let active = true;
    let latestEvent = 0;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const eventVersion = ++latestEvent;
      // Invalidate work immediately, even when a newer event supersedes this
      // callback before its deferred mapping runs. Reusing a token after logout
      // must never rejoin a lookup from the previous signed-in lifetime.
      observeSessionAccount(session?.user.id ?? null, _event === 'SIGNED_OUT');
      // Supabase recommends keeping its auth callback synchronous. Resolve the
      // profile identity on the next task, outside the auth client's lock.
      window.setTimeout(() => {
        if (!active || eventVersion !== latestEvent) return;
        void toAuthSession(session)
          .then((mapped) => active && eventVersion === latestEvent && listener(mapped))
          .catch((error: unknown) => {
            if (!active || eventVersion !== latestEvent) return;
            // A temporary profile-read rejection is not a sign-out. Let the
            // initiating getSession/signIn show its actionable error, retaining
            // an already mapped identity only when it belongs to this account.
            if (error instanceof AuthServiceError && error.code === 'session_not_ready' &&
              (!lastMappedAccountId || lastMappedAccountId === session?.user.id)) return;
            lastMappedAccountId = null;
            listener(null, toAuthError(error));
          });
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  },

  async signIn(input) {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });
    if (error || !data.session) {
      throw error
        ? authFailure(error, 'Sign in failed.')
        : new AuthServiceError('invalid_credentials', 'Sign in did not establish a session.');
    }
    const mapped = await toAuthSession(data.session);
    if (!mapped) {
      throw new AuthServiceError('unknown', 'Sign in did not establish a session.');
    }
    return mapped;
  },

  async getSocialProviders() {
    return readSocialProviders();
  },

  async signInWithOAuth(provider, returnPath) {
    const redirect = new URL('/', authReturnOrigin(window.location.origin));
    redirect.searchParams.set('entry', 'oauth');
    const safePath = readSharedReturnPath(returnPath);
    if (safePath) redirect.searchParams.set('onboarding_return', safePath);
    const { error } = await requireSupabase().auth.signInWithOAuth({
      provider, options: { redirectTo: redirect.href },
    });
    if (error) throw authFailure(error, 'Sign in could not be started.');
  },

  async signUp(input) {
    const client = requireSupabase();
    const email = input.email.trim().toLowerCase();
    const registration = readRegistrationProfile(input.registration);
    if (input.registration && !registration) {
      throw new AuthServiceError('unknown', 'Your profile details could not be saved. Review them and try again.');
    }
    const { data, error } = await client.auth.signUp({
      email,
      password: input.password,
      options: { emailRedirectTo: authReturnOrigin(window.location.origin),
        data: registration ? { portalink_registration: registration } : undefined },
    });
    if (error) {
      throw authFailure(error, 'Account creation failed.');
    }
    return {
      email,
      requiresEmailVerification: data.session === null,
      session: await toAuthSession(data.session),
    };
  },

  async signOut(scope = 'global') {
    const { error } = await requireSupabase().auth.signOut({ scope });
    if (error) throw authFailure(error, 'Sign out failed.');
  },

  async requestPasswordReset(input) {
    const email = input.email.trim().toLowerCase();
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: passwordRecoveryRedirect(authReturnOrigin(window.location.origin)),
    });
    if (error) throw authFailure(error, 'The reset email could not be requested.');
    return {
      email,
      deliveryConfirmed: true,
      message: 'If an account uses this address, you’ll receive a reset link. Open the link in your email to choose a new password. Check your spam folder if it doesn’t arrive.',
    };
  },

  async getRecoverySession() {
    return (await verifiedRecoverySession())?.recovery ?? null;
  },

  async updatePassword(input) {
    const recovery = await verifiedRecoverySession();
    if (!recovery) {
      throw new AuthServiceError('recovery_session_invalid', 'This recovery link is invalid or has expired.');
    }
    // A fresh non-persisting SDK client prevents a concurrent sign-in in
    // another tab from changing which account this password request updates.
    const recoveryClient = createPasswordRecoveryClient();
    const established = await recoveryClient.setSession({
      access_token: recovery.session.access_token,
      refresh_token: recovery.session.refresh_token,
    });
    if (established.error || !established.data.session) {
      throw established.error
        ? authFailure(established.error, 'The recovery session could not be restored.')
        : new AuthServiceError('recovery_session_invalid', 'This recovery link is invalid or has expired.');
    }
    const { error } = await recoveryClient.updateUser({ password: input.password });
    if (error) throw authFailure(error, 'The password could not be updated.');
    if (passwordRecovery.read(recovery.session)) clearPasswordRecoveryReturn();
    passwordRecovery.clear(recovery.session);
  },

  async attachProfile(profileId) {
    const client = requireSupabase();
    const owner = await currentProviderUser();
    // The profile's account_id is already authoritative. Re-read it instead of
    // writing redundant metadata through a potentially changed auth session.
    const { data: sessionData } = await client.auth.getSession();
    const mapped = await toAuthSession(sessionData.session);
    const { data: currentData } = await client.auth.getSession();
    if (!mapped || mapped.user.id !== owner.id || mapped.user.profileId !== profileId || currentData.session?.user.id !== owner.id) {
      throw new AuthServiceError('reauthentication_required', 'Sign in again to finish linking your profile.');
    }
    return mapped;
  },

  async getAccountDeletionCapability() {
    return accountDeletionEnabled
      ? {
          isAvailable: true,
          removes: [
            'Your account and sign-in credentials',
            'Your creator profile, categories, projects, and uploaded files',
            'Your follows and saved activity',
            'Your own message content and attachments; shared chats and other people’s messages remain',
          ],
        }
      : {
          isAvailable: false,
          reason: 'Account deletion is temporarily disabled while we update how shared conversations are preserved. Your account and files have not been changed.',
          removes: [],
        };
  },

  async deleteAccount(input) {
    if (!accountDeletionEnabled) {
      throw new AuthServiceError('deletion_unavailable', 'Account deletion is not enabled for this deployment.');
    }
    const user = await currentProviderUser();
    if (!user.email?.trim() || user.id !== input.accountId || user.email.toLowerCase() !== input.confirmation.trim().toLowerCase()) {
      throw new AuthServiceError('confirmation_mismatch', 'That does not match the email address on this account.');
    }
    const { data, error } = await requireSupabase().functions.invoke('delete-account', {
      body: { action: 'request', confirmation: input.confirmation },
    });
    if (error) {
      const response = error.context instanceof Response ? error.context : null;
      const details = response ? await response.clone().json().catch(() => null) as { message?: string } | null : null;
      const code = response?.status === 400 ? 'confirmation_mismatch' : response?.status === 401 ? 'reauthentication_required' : 'network';
      throw new AuthServiceError(code, details?.message ?? 'The deletion request could not be confirmed. Check its status before trying again.');
    }
    const result = data as { isDeleted?: boolean; status?: string; deleteAfter?: string; message?: string } | null;
    if (result?.status === 'completed' && result.isDeleted === true) return { isDeleted: true, status: 'completed', message: result.message ?? 'Your account has been deleted. You can register again with the same email address.' };
    if (result?.status === 'processing') return { isDeleted: false, status: 'processing', message: result.message ?? 'Deletion is processing. Your email becomes available after completion.' };
    if (result?.status !== 'pending' || !result.deleteAfter) throw new AuthServiceError('network', 'Check your deletion status before trying again.');
    return { isDeleted: false, status: 'pending', deleteAfter: result.deleteAfter, message: result.message ?? 'Deletion scheduled. You can cancel before permanent deletion starts.' };
  },

  async getAccountDeletionStatus() {
    const { data, error } = await requireSupabase().functions.invoke('delete-account', { body: { action: 'status' } });
    if (error) throw new AuthServiceError('deletion_unavailable', 'Deletion status is currently unavailable.');
    if (!data?.status) return null;
    if (!['pending', 'processing', 'completed'].includes(data.status)) return null;
    return { isDeleted: false, status: data.status, deleteAfter: data.deleteAfter, message: data.status === 'pending' ? 'Deletion is scheduled. You can cancel before permanent deletion starts.' : 'Permanent deletion has started.' };
  },

  async cancelAccountDeletion() {
    const { data, error } = await requireSupabase().functions.invoke('delete-account', { body: { action: 'cancel' } });
    if (error || data?.status !== 'cancelled') throw new AuthServiceError('network', 'Cancellation could not be confirmed. Check your deletion status.');
    return { isDeleted: false, status: 'cancelled', message: 'Deletion cancelled. Your account and content are restored.' };
  },

  async getAccountSecurityCapability() {
    return {
      canChangePassword: true,
      canChangeEmail: true,
      canSendVerificationEmail: true,
      emailChangeRequiresVerification: true,
    };
  },

  async signOutOtherSessions(accountId) {
    const client = requireSupabase();
    const generation = sessionGeneration;
    const { data, error } = await client.auth.getSession();
    if (error) throw authFailure(error, 'Your session could not be checked.');
    if (!data.session || data.session.user.id !== accountId) {
      throw new AuthServiceError('reauthentication_required', 'Sign in again to manage your sessions.');
    }
    await assertCurrentAccount(accountId, generation);
    // Bind revocation to the captured account even if another tab changes identity.
    const bound = createPasswordRecoveryClient();
    const established = await bound.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    if (established.error) throw authFailure(established.error, 'Your session could not be checked.');
    if (established.data.session?.user.id !== accountId) throw new AuthServiceError('reauthentication_required', 'Sign in again to manage your sessions.');
    await assertCurrentAccount(accountId, generation);
    const result = await bound.signOut({ scope: 'others' });
    if (result.error) throw authFailure(result.error, 'Other sessions could not be signed out.');
  },

  async listAccountSessions(accountId, cursor) {
    const generation = sessionGeneration;
    await assertCurrentAccount(accountId, generation);
    const { data, error } = await requireSupabase().rpc('list_my_account_sessions', {
      p_before: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null,
    });
    await assertCurrentAccount(accountId, generation);
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') throw new AuthServiceError('unsupported', 'The device list is not available yet. You can still use the session sign-out controls below.');
      throw authFailure(error, 'Your signed-in sessions could not be loaded.');
    }
    const rows = (data ?? []) as { id: string; user_agent: string | null; created_at: string; refreshed_at: string | null; is_current: boolean }[];
    const sessions = rows.slice(0, 50).map(row => ({ id: row.id, userAgent: row.user_agent, createdAt: row.created_at, refreshedAt: row.refreshed_at, isCurrent: row.is_current }));
    const last = sessions.at(-1);
    return { sessions, nextCursor: rows.length > 50 && last ? { createdAt: last.createdAt, id: last.id } : null };
  },

  async revokeAccountSession(accountId, sessionId) {
    const generation = sessionGeneration;
    await assertCurrentAccount(accountId, generation);
    const { data, error } = await requireSupabase().rpc('revoke_my_account_session', { p_session_id: sessionId });
    await assertCurrentAccount(accountId, generation);
    if (error) throw authFailure(error, 'This session could not be signed out.');
    if (typeof data !== 'boolean') throw new AuthServiceError('unknown', 'The session sign-out could not be confirmed. Refresh the list before trying again.');
    return data;
  },

  async getAccountSecurityState(): Promise<AccountSecurityState> {
    const user = await currentProviderUser();
    const providerUser = user as User & { new_email?: string; email_change_sent_at?: string };
    return {
      email: user.email ?? '',
      isEmailVerified: Boolean(user.email_confirmed_at),
      pendingEmailChange: providerUser.new_email
        ? {
            newEmail: providerUser.new_email,
            requestedAt: providerUser.email_change_sent_at ?? new Date().toISOString(),
            deliveryConfirmed: true,
          }
        : null,
      hasPassword: true,
    };
  },

  async changePassword(input) {
    const generation = sessionGeneration;
    const user = await currentProviderUser();
    if (user.id !== input.accountId || !user.email) {
      throw new AuthServiceError('reauthentication_required', 'Sign in again before changing your password.');
    }
    const verifier = createPasswordRecoveryClient();
    const verified = await verifier.signInWithPassword({
      email: user.email,
      password: input.currentPassword,
    });
    if (verified.error) throw authFailure(verified.error, 'The current password is incorrect.');
    try {
      if (verified.data.user?.id !== input.accountId) throw new AuthServiceError('reauthentication_required', 'Sign in again before changing your password.');
      await assertCurrentAccount(input.accountId, generation);
      const { error } = await verifier.updateUser({ password: input.newPassword });
      if (error) throw authFailure(error, 'The password could not be changed.');
    } finally {
      // This temporary verification session never replaces the app's session.
      await verifier.signOut({ scope: 'local' }).catch(() => undefined);
    }
    return {
      isChanged: true,
      message: 'Your password has been changed.',
      didSignOutOtherSessions: false,
    };
  },

  async requestEmailChange(input) {
    const generation = sessionGeneration;
    const user = await currentProviderUser();
    if (user.id !== input.accountId) {
      throw new AuthServiceError('reauthentication_required', 'Sign in again before changing your email address.');
    }
    const email = input.newEmail.trim().toLowerCase();
    if (email === user.email?.toLowerCase()) throw new AuthServiceError('invalid_email', 'That is already the address on this account.');
    const current = await requireSupabase().auth.getSession();
    if (current.error) throw authFailure(current.error, 'Your session could not be checked.');
    if (!current.data.session || current.data.session.user.id !== input.accountId) throw new AuthServiceError('reauthentication_required', 'Sign in again before changing your email address.');
    const bound = createPasswordRecoveryClient();
    const established = await bound.setSession({ access_token: current.data.session.access_token, refresh_token: current.data.session.refresh_token });
    if (established.error) throw authFailure(established.error, 'Your session could not be checked.');
    if (established.data.session?.user.id !== input.accountId) throw new AuthServiceError('reauthentication_required', 'Sign in again before changing your email address.');
    await assertCurrentAccount(input.accountId, generation);
    const { error } = await bound.updateUser({ email }, { emailRedirectTo: authReturnOrigin(window.location.origin) });
    if (error) throw authFailure(error, 'The email change could not be requested.');
    return {
      status: 'pending',
      email,
      deliveryConfirmed: true,
      message: 'Confirm the new address from the verification email to finish the change.',
    };
  },

  async resendVerification(input) {
    const user = await currentProviderUser();
    if (user.id !== input.accountId || !user.email) {
      throw new AuthServiceError('reauthentication_required', 'Sign in again before requesting another email.');
    }
    const providerUser = user as User & { new_email?: string };
    const email = input.target === 'pending-email' ? providerUser.new_email ?? user.email : user.email;
    const { error } = await requireSupabase().auth.resend({
      type: input.target === 'pending-email' ? 'email_change' : 'signup',
      email,
      options: { emailRedirectTo: authReturnOrigin(window.location.origin) },
    });
    if (error) throw authFailure(error, 'The verification email could not be sent.');
    return { status: 'sent', email, message: 'A verification email has been sent.' };
  },
};
