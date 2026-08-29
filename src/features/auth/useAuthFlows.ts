import { useCallback, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
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
  const {
    auth
  } = useServices();
  const [result, setResult] = useState<SignUpResult | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const action = useAsyncAction(async (email: string, password: string) => {
    setError(null);
    try {
      setResult(await auth.signUp({
        email,
        password
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
    submit: (email: string, password: string) => action.run(email, password),
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
  const {
    auth
  } = useServices();
  const [recovery, setRecovery] = useState<AuthRecoverySession | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const loadRecovery = useAsyncAction(async () => {
    setError(null);
    setRecovery(await auth.getRecoverySession());
  });
  const action = useAsyncAction(async (password: string) => {
    setError(null);
    try {
      await auth.updatePassword({
        password
      });
      setIsComplete(true);
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