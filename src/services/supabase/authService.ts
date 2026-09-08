import type { Session, User } from '@supabase/supabase-js';
import type { AuthService } from '../interfaces';
import { AuthServiceError } from '../../types/auth';
import type {
  AccountSecurityState,
  AuthRecoverySession,
  AuthSession,
  AuthUser,
} from '../../types/auth';
import { accountDeletionEnabled, requireSupabase } from './client';

let recoverySession: AuthRecoverySession | null = null;

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

async function profileIdentity(accountId: string): Promise<{
  profileId: string;
  displayName: string;
}> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('id,name')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    throw new AuthServiceError('network', error.message);
  }

  const row = data as unknown as { id: string; name: string } | null;
  return {
    profileId: row?.id ?? '',
    displayName: row?.name ?? '',
  };
}

async function toAuthSession(session: Session | null): Promise<AuthSession | null> {
  if (!session) {
    return null;
  }

  const user = session.user;
  // Ownership always comes from the RLS-protected profile row. User metadata is
  // editable by the account and must never be trusted as an authorization fact.
  const identity = await profileIdentity(user.id);
  const email = user.email ?? '';
  const displayName = identity.displayName || textMetadata(user, 'display_name') || textMetadata(user, 'full_name') || email.split('@')[0] || 'Creator';
  const mapped: AuthUser = {
    id: user.id,
    email,
    profileId: identity.profileId,
    displayName,
    initials: initialsFor(displayName),
    isEmailVerified: Boolean(user.email_confirmed_at),
  };

  return { user: mapped, isPrototype: false };
}

function authFailure(error: { message: string; status?: number | null }, fallback: string): AuthServiceError {
  const message = error.message || fallback;
  const normalized = message.toLowerCase();
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
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user.email) {
        recoverySession = { email: session.user.email, isPrototype: false };
      }
      // Supabase recommends keeping its auth callback synchronous. Resolve the
      // profile identity on the next task, outside the auth client's lock.
      window.setTimeout(() => {
        if (!active) return;
        void toAuthSession(session)
          .then((mapped) => active && listener(mapped))
          .catch(() => active && listener(null));
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

  async signUp(input) {
    const client = requireSupabase();
    const email = input.email.trim().toLowerCase();
    const { data, error } = await client.auth.signUp({
      email,
      password: input.password,
      options: { emailRedirectTo: window.location.origin },
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

  async signOut() {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw authFailure(error, 'Sign out failed.');
  },

  async requestPasswordReset(input) {
    const email = input.email.trim().toLowerCase();
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw authFailure(error, 'The reset email could not be requested.');
    return {
      email,
      deliveryConfirmed: true,
      message: 'A password reset link has been sent if that address belongs to an account.',
    };
  },

  async getRecoverySession() {
    return recoverySession;
  },

  async updatePassword(input) {
    if (!recoverySession) {
      throw new AuthServiceError('recovery_session_invalid', 'This recovery link is invalid or has expired.');
    }
    const { error } = await requireSupabase().auth.updateUser({ password: input.password });
    if (error) throw authFailure(error, 'The password could not be updated.');
    recoverySession = null;
  },

  async attachProfile(profileId) {
    const client = requireSupabase();
    const { data: profileData, error: profileError } = await client
      .from('profiles')
      .select('name')
      .eq('id', profileId)
      .single();
    if (profileError) throw authFailure(profileError, 'The creator profile could not be linked.');
    const profile = profileData as unknown as { name: string };
    const { error } = await client.auth.updateUser({
      data: { profile_id: profileId, display_name: profile.name },
    });
    if (error) throw authFailure(error, 'The creator profile could not be linked.');
    const { data: sessionData } = await client.auth.getSession();
    const mapped = await toAuthSession(sessionData.session);
    if (!mapped) {
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
    const result = data as { status?: string; deleteAfter?: string; message?: string } | null;
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
    const client = requireSupabase();
    const user = await currentProviderUser();
    if (user.id !== input.accountId || !user.email) {
      throw new AuthServiceError('reauthentication_required', 'Sign in again before changing your password.');
    }
    const verified = await client.auth.signInWithPassword({
      email: user.email,
      password: input.currentPassword,
    });
    if (verified.error) throw authFailure(verified.error, 'The current password is incorrect.');
    const { error } = await client.auth.updateUser({ password: input.newPassword });
    if (error) throw authFailure(error, 'The password could not be changed.');
    return {
      isChanged: true,
      message: 'Your password has been changed.',
      didSignOutOtherSessions: false,
    };
  },

  async requestEmailChange(input) {
    const user = await currentProviderUser();
    if (user.id !== input.accountId) {
      throw new AuthServiceError('reauthentication_required', 'Sign in again before changing your email address.');
    }
    const email = input.newEmail.trim().toLowerCase();
    const { error } = await requireSupabase().auth.updateUser({ email });
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
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw authFailure(error, 'The verification email could not be sent.');
    return { status: 'sent', email, message: 'A verification email has been sent.' };
  },
};
