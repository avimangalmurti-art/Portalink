import { useCallback, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useAuth } from '../../contexts/AuthContext';
import { type RegistrationProfile } from './registration';
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
  const session = useAuth();
  const {
    auth
  } = useServices();
  const [result, setResult] = useState<SignUpResult | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const action = useAsyncAction(async (email: string, password: string, registration?: RegistrationProfile) => {
    setError(null);
    try {
      const next = await auth.signUp({
        email,
        password,
        registration
      });
      setResult(next);
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
    submit: (email: string, password: string, registration?: RegistrationProfile) => action.run(email, password, registration),
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
