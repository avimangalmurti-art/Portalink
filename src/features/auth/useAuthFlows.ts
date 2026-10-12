import { useCallback, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useAuth } from '../../contexts/AuthContext';
import { useSignupTerms } from '../legal/signupTermsContext';
import { saveRegistrationDraft, markRegistrationVerification, type RegistrationProfile } from './registration';
import type { PreparedAvatar } from '../../types/profile';
import { toAuthError } from '../../types/auth';
import type { AuthError, AuthRecoverySession, PasswordResetRequestResult, SignUpResult } from '../../types/auth';

/**
 * The auth flows that do not change the current session: signing up, asking for
 * a reset, and setting a new password from a recovery context.
 *
 * They follow the same feature-hook pattern as `useFollows` — the hook talks to
 * the service through `useAsyncAction` and hands the presentation layer plain
 * state and callbacks, so no form component ever imports a service.
 */

export function useSignUp() {
  const terms = useSignupTerms();
  const session = useAuth();
  const {
    auth
  } = useServices();
  const [result, setResult] = useState<SignUpResult | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const action = useAsyncAction(async (email: string, password: string, registration?: RegistrationProfile, avatar: PreparedAvatar | null = null) => {
    setError(null);
    try {
      const legalVersions = await terms.requestConsent(email);
      if (legalVersions === null) return;
      if (registration) {
        try { await saveRegistrationDraft(registration, email, avatar); }
        catch { throw new Error('Your signup details could not be saved for email confirmation. Please try again before continuing.'); }
      }
      const next = await auth.signUp({
        email,
        password,
        registration,
        ...(legalVersions.length ? { legalVersions } : {})
      });
      setResult(next);
      if (registration && next.requiresEmailVerification) {
        // The complete draft was committed before signup. A status-cache failure
        // must not turn an accepted signup into a second account request.
        await markRegistrationVerification(registration.id).catch(() => undefined);
      }
      if (next.session) await session.refreshSession(next.session.user.id);
    } catch (caught) {
      setError(toAuthError(caught));
      throw caught;
    }
  });
  return {
    result,
    error,
    status: action.status,
    isLoading: action.isLoading,
    submit: (email: string, password: string, registration?: RegistrationProfile, avatar?: PreparedAvatar | null) => action.run(email, password, registration, avatar),
    retry: action.retry,
    reset: useCallback(() => {
      setResult(null);
      setError(null);
      action.reset();
    }, [action])
  };
}
export function usePasswordReset() {
  const {
    auth
  } = useServices();
  const [result, setResult] = useState<PasswordResetRequestResult | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const action = useAsyncAction(async (email: string) => {
    setError(null);
    try {
      setResult(await auth.requestPasswordReset({
        email
      }));
    } catch (caught) {
      setError(toAuthError(caught));
      throw caught;
    }
  });
  return {
    result,
    error,
    status: action.status,
    isLoading: action.isLoading,
    submit: (email: string) => action.run(email),
    retry: action.retry,
    reset: useCallback(() => {
      setResult(null);
      setError(null);
      action.reset();
    }, [action])
  };
}
export function usePasswordUpdate() {
  const session = useAuth();
  const {
    auth
  } = useServices();
  const [recovery, setRecovery] = useState<AuthRecoverySession | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const resolveRecovery = useCallback(async () => {
    setError(null);
    try {
      setRecovery(await auth.getRecoverySession());
    } catch (caught) {
      setError(toAuthError(caught));
      throw caught;
    }
  }, [auth]);
  const loadRecovery = useAsyncAction(resolveRecovery);
  const action = useAsyncAction(async (password: string) => {
    setError(null);
    try {
      await auth.updatePassword({
        password
      });
      setIsComplete(true);
      await session.refreshSession();
    } catch (caught) {
      setError(toAuthError(caught));
      throw caught;
    }
  });
  return {
    recovery,
    isComplete,
    error,
    status: action.status,
    isLoading: action.isLoading,
    recoveryStatus: loadRecovery.status,
    loadRecovery: loadRecovery.run,
    submit: (password: string) => action.run(password),
    retry: action.retry,
    reset: useCallback(() => {
      setIsComplete(false);
      setError(null);
      action.reset();
    }, [action])
  };
}
