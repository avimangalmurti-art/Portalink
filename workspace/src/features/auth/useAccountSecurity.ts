import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { toAuthError } from '../../types/auth';
import { validateEmail, validateNewPassword, validatePasswordConfirmation, validateRequiredPassword } from './validation';
import type { AccountSecurityCapability, AccountSecurityState, AuthError, ChangeEmailResult, ChangePasswordResult, ResendVerificationInput, ResendVerificationResult } from '../../types/auth';

/**
 * Credentials on an already-authenticated account: the confirmed address, the
 * password, and any confirmation still outstanding.
 *
 * UI → this hook → `AuthService` → implementation. The Security page receives
 * plain state and callbacks; it never touches a service, and it never decides
 * whether an operation succeeded.
 *
 * Two rules this hook exists to enforce:
 *
 * 1. THE CONFIRMED EMAIL IS NEVER MOVED OPTIMISTICALLY. A request that comes back
 *    `pending` is stored as a pending change; only the authoritative session (or a
 *    re-read of the security state) may replace the confirmed address.
 * 2. DELIVERY IS NEVER ASSUMED. "Sent" is shown only when the service reports
 *    `status: 'sent'`; `unavailable` and `rate-limited` are distinct outcomes with
 *    their own wording, not failures.
 *
 * The client validates format and matching only. It cannot prove a current
 * password, so it never behaves as though it had — verification happens at the
 * service, and `invalid_credentials` comes back from there.
 */
export type PasswordFieldKey = 'currentPassword' | 'newPassword' | 'confirmPassword';
export type SensitivePhase = 'idle' | 'submitting' | 'succeeded' | 'failed';
export type VerificationPhase = 'idle' | 'sending' | 'sent' | 'unavailable' | 'rate-limited' | 'failed';
const EMPTY_PASSWORD_FORM = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
};
export function useAccountSecurity() {
  const {
    auth: authService
  } = useServices();
  const {
    user,
    isAuthenticated
  } = useAuth();
  const accountId = user?.id ?? null;
  const [capability, setCapability] = useState<AccountSecurityCapability | null>(null);
  const [isLoadingCapability, setIsLoadingCapability] = useState(false);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [state, setState] = useState<AccountSecurityState | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);

  // Password form.
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Partial<Record<PasswordFieldKey, string>>>({});
  const [passwordPhase, setPasswordPhase] = useState<SensitivePhase>('idle');
  const [passwordError, setPasswordError] = useState<AuthError | null>(null);
  const [passwordResult, setPasswordResult] = useState<ChangePasswordResult | null>(null);
  const isChangingPasswordRef = useRef(false);

  // Email form.
  const [emailDraft, setEmailDraft] = useState('');
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [emailPhase, setEmailPhase] = useState<SensitivePhase>('idle');
  const [emailError, setEmailError] = useState<AuthError | null>(null);
  const [emailResult, setEmailResult] = useState<ChangeEmailResult | null>(null);
  const isChangingEmailRef = useRef(false);

  // Verification resend.
  const [verificationPhase, setVerificationPhase] = useState<VerificationPhase>('idle');
  const [verificationResult, setVerificationResult] = useState<ResendVerificationResult | null>(null);
  const [verificationError, setVerificationError] = useState<AuthError | null>(null);
  const lastResendTargetRef = useRef<ResendVerificationInput['target']>('account');
  const isResendingRef = useRef(false);
  const loadCapability = useCallback(async () => {
    setIsLoadingCapability(true);
    setCapabilityError(null);
    try {
      setCapability(await authService.getAccountSecurityCapability());
    } catch (caught) {
      // A capability that cannot be read promises nothing: the controls stay
      // withheld rather than being offered on an assumption.
      setCapability(null);
      setCapabilityError(toAuthError(caught).message);
    } finally {
      setIsLoadingCapability(false);
    }
  }, [authService]);
  const loadState = useCallback(async () => {
    if (!isAuthenticated) {
      setState(null);
      return;
    }
    setIsLoadingState(true);
    setStateError(null);
    try {
      setState(await authService.getAccountSecurityState());
    } catch (caught) {
      setState(null);
      setStateError(toAuthError(caught).message);
    } finally {
      setIsLoadingState(false);
    }
  }, [authService, isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    void loadCapability();
    void loadState();
  }, [isAuthenticated, loadCapability, loadState]);
  const setPasswordField = useCallback((key: PasswordFieldKey, value: string) => {
    setPasswordForm((current) => ({
      ...current,
      [key]: value
    }));
    setPasswordFieldErrors((current) => ({
      ...current,
      [key]: undefined
    }));
  }, []);

  /**
   * Format and matching only. A wrong current password is not detectable here and
   * is deliberately left to the service.
   */
  const validatePasswordForm = useCallback((): PasswordFieldKey | null => {
    const next: Partial<Record<PasswordFieldKey, string>> = {
      currentPassword: validateRequiredPassword(passwordForm.currentPassword) ?? undefined,
      newPassword: validateNewPassword(passwordForm.newPassword) ?? undefined,
      confirmPassword: validatePasswordConfirmation(passwordForm.newPassword, passwordForm.confirmPassword) ?? undefined
    };
    setPasswordFieldErrors(next);
    const order: PasswordFieldKey[] = ['currentPassword', 'newPassword', 'confirmPassword'];
    return order.find((key) => next[key]) ?? null;
  }, [passwordForm]);

  /** Returns the field that needs focus when the attempt could not be made. */
  const changePassword = useCallback(async (): Promise<PasswordFieldKey | null> => {
    if (!accountId || isChangingPasswordRef.current) {
      return null;
    }
    const invalid = validatePasswordForm();
    if (invalid) {
      return invalid;
    }
    isChangingPasswordRef.current = true;
    setPasswordPhase('submitting');
    setPasswordError(null);
    setPasswordResult(null);
    try {
      const result = await authService.changePassword({
        accountId,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordResult(result);
      if (result.isChanged) {
        // Confirmed success is the only point at which the credential leaves
        // memory. Nothing is ever displayed back.
        setPasswordForm(EMPTY_PASSWORD_FORM);
        setPasswordPhase('succeeded');
      } else {
        setPasswordPhase('failed');
        setPasswordError({
          code: 'unknown',
          message: result.message
        });
      }
      return null;
    } catch (caught) {
      const error = toAuthError(caught);
      setPasswordError(error);
      setPasswordPhase('failed');
      // The offending field keeps its value so a recoverable mistake costs one
      // correction rather than the whole form.
      if (error.code === 'invalid_credentials' || error.code === 'reauthentication_required') {
        setPasswordFieldErrors((current) => ({
          ...current,
          currentPassword: error.message
        }));
        return 'currentPassword';
      }
      if (error.code === 'weak_password' || error.code === 'same_password') {
        setPasswordFieldErrors((current) => ({
          ...current,
          newPassword: error.message
        }));
        return 'newPassword';
      }
      return null;
    } finally {
      isChangingPasswordRef.current = false;
    }
  }, [accountId, authService, passwordForm, validatePasswordForm]);
  const resetPasswordForm = useCallback(() => {
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setPasswordFieldErrors({});
    setPasswordPhase('idle');
    setPasswordError(null);
    setPasswordResult(null);
  }, []);
  const changeEmail = useCallback(async (): Promise<boolean> => {
    if (!accountId || isChangingEmailRef.current) {
      return false;
    }
    const invalid = validateEmail(emailDraft);
    setEmailFieldError(invalid);
    if (invalid) {
      return false;
    }
    isChangingEmailRef.current = true;
    setEmailPhase('submitting');
    setEmailError(null);
    setEmailResult(null);
    try {
      const result = await authService.requestEmailChange({
        accountId,
        newEmail: emailDraft.trim()
      });
      setEmailResult(result);
      if (result.status === 'unavailable') {
        setEmailPhase('failed');
        setEmailError({
          code: 'unsupported',
          message: result.message
        });
        return false;
      }
      setEmailPhase('succeeded');
      // Re-read rather than patch: the service owns which address is confirmed
      // and which is merely pending, so nothing is inferred here.
      await loadState();
      setEmailDraft('');
      return true;
    } catch (caught) {
      const error = toAuthError(caught);
      setEmailError(error);
      setEmailPhase('failed');
      if (error.code === 'invalid_email' || error.code === 'email_taken') {
        setEmailFieldError(error.message);
      }
      // The typed address survives, so a retry costs nothing.
      return false;
    } finally {
      isChangingEmailRef.current = false;
    }
  }, [accountId, authService, emailDraft, loadState]);
  const resetEmailForm = useCallback(() => {
    setEmailDraft('');
    setEmailFieldError(null);
    setEmailPhase('idle');
    setEmailError(null);
    setEmailResult(null);
  }, []);
  const resendVerification = useCallback(async (target: ResendVerificationInput['target']) => {
    if (!accountId || isResendingRef.current) {
      return;
    }
    isResendingRef.current = true;
    lastResendTargetRef.current = target;
    setVerificationPhase('sending');
    setVerificationError(null);
    setVerificationResult(null);
    try {
      const result = await authService.resendVerification({
        accountId,
        target
      });
      setVerificationResult(result);
      // 'sent' is the only outcome that may read as sent. The other two are real
      // answers, not failures, and each says its own thing.
      setVerificationPhase(result.status === 'sent' ? 'sent' : result.status === 'rate-limited' ? 'rate-limited' : 'unavailable');
    } catch (caught) {
      setVerificationError(toAuthError(caught));
      setVerificationPhase('failed');
    } finally {
      isResendingRef.current = false;
    }
  }, [accountId, authService]);
  const retryResend = useCallback(() => resendVerification(lastResendTargetRef.current), [resendVerification]);
  return {
    capability,
    isLoadingCapability,
    capabilityError,
    retryCapability: loadCapability,
    state,
    isLoadingState,
    stateError,
    reloadState: loadState,
    password: {
      form: passwordForm,
      fieldErrors: passwordFieldErrors,
      phase: passwordPhase,
      error: passwordError,
      result: passwordResult,
      isSubmitting: passwordPhase === 'submitting',
      setField: setPasswordField,
      submit: changePassword,
      reset: resetPasswordForm
    },
    email: {
      draft: emailDraft,
      fieldError: emailFieldError,
      phase: emailPhase,
      error: emailError,
      result: emailResult,
      isSubmitting: emailPhase === 'submitting',
      setDraft: (value: string) => {
        setEmailDraft(value);
        setEmailFieldError(null);
      },
      submit: changeEmail,
      reset: resetEmailForm
    },
    verification: {
      phase: verificationPhase,
      result: verificationResult,
      error: verificationError,
      isSending: verificationPhase === 'sending',
      resend: resendVerification,
      retry: retryResend
    }
  };
}
export type AccountSecurity = ReturnType<typeof useAccountSecurity>;