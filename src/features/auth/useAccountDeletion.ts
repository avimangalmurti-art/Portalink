import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { toAuthError } from '../../types/auth';
import type { AccountDeletionCapability, AuthError, DeleteAccountResult } from '../../types/auth';

/**
 * Account deletion, as the UI needs it.
 *
 * Two separate requests, because they answer two different questions and fail
 * independently: what deletion would remove and whether it is possible at all
 * (`capability`), and the deletion itself (`submit`). The capability is read
 * before any destructive control is shown, so the product can state plainly
 * that the operation cannot be performed rather than offering a button that
 * quietly does nothing.
 *
 * Everything backend-shaped stays behind `AuthService`; this hook holds only the
 * states a destructive flow must render — loading, error, retry, and an outcome
 * that is never assumed to be success.
 */
export function useAccountDeletion({
  accountEmail,
  accountId



}: {accountEmail: string | null;accountId: string | null;}) {
  const {
    auth
  } = useServices();
  const [capability, setCapability] = useState<AccountDeletionCapability | null>(null);
  const [result, setResult] = useState<DeleteAccountResult | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  // Guards the boundary itself, so a fast double submit cannot send two
  // destructive requests even if a control briefly re-enables.
  const isDeletingRef = useRef(false);
  const statusRequestRef = useRef(false);
  const isConfirmationMatched = Boolean(accountEmail?.trim()) && confirmation.trim().toLowerCase() === accountEmail?.trim().toLowerCase();
  const deletionStarted = result?.isDeleted || result?.status === 'processing';
  const canSubmit = capability?.isAvailable === true && Boolean(accountId) && isConfirmationMatched && !deletionStarted && !isDeletingRef.current && !statusRequestRef.current;
  const loadCapability = useAsyncAction(async () => {
    setCapability(await auth.getAccountDeletionCapability());
  });
  const refreshStatus = useCallback(async () => {
    if (!accountId || !auth.getAccountDeletionStatus || statusRequestRef.current || isDeletingRef.current) return;
    statusRequestRef.current = true;
    setIsCheckingStatus(true);
    setError(null);
    try {
      const outcome = await auth.getAccountDeletionStatus(accountId);
      if (outcome) setResult(current => current?.isDeleted ? current : outcome);
    } catch (caught) {
      setError(toAuthError(caught));
    } finally {
      statusRequestRef.current = false;
      setIsCheckingStatus(false);
    }
  }, [accountId, auth]);
  useEffect(() => {
    void loadCapability.run();
    // Read once per mount: the capability describes the implementation, not the
    // session, so it does not change while the sheet is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const action = useAsyncAction(async () => {
    if (!canSubmit || !accountId || isDeletingRef.current || statusRequestRef.current || deletionStarted) {
      return;
    }
    setError(null);
    isDeletingRef.current = true;
    try {
      const outcome = await auth.deleteAccount({
        accountId,
        confirmation
      });
      setResult(outcome);
    } catch (caught) {
      const authError = toAuthError(caught);
      // "No backend can do this" is an outcome, not a retryable failure: there
      // is nothing to try again, and the honest thing to report is that the
      // account is untouched.
      if (authError.code === 'deletion_unavailable') {
        setResult({
          isDeleted: false,
          message: authError.message
        });
        return;
      }
      setError(authError);
      // A mismatch belongs on the field that caused it, not only in a banner.
      if (authError.code === 'confirmation_mismatch') {
        setFieldError(authError.message);
      }
      throw caught;
    } finally {
      // Released on failure too, so Try again works without reopening the flow.
      isDeletingRef.current = false;
    }
  });

  /** True only when the typed confirmation exactly matches the account email. */
  const submit = useCallback(() => {
    if (!capability?.isAvailable || !accountId || isDeletingRef.current || statusRequestRef.current || deletionStarted) return false;
    if (!isConfirmationMatched) {
      // Stated on the field rather than silently refusing.
      setFieldError(`Type ${accountEmail ?? 'your email address'} exactly to confirm.`);
      return false;
    }
    setFieldError(null);
    void action.run();
    return true;
  }, [isConfirmationMatched, accountEmail, accountId, capability, action, deletionStarted]);
  return {
    capability,
    /** True while the capability is still being read. */
    isCheckingCapability: loadCapability.status === 'idle' || loadCapability.status === 'loading',
    /** The capability itself could not be read, so nothing should be offered. */
    capabilityError: loadCapability.status === 'error',
    confirmation,
    setConfirmation: useCallback((value: string) => {
      setConfirmation(value);
      setFieldError(null);
    }, []),
    fieldError,
    isConfirmationMatched,
    canSubmit,
    isDeleting: action.isLoading,
    hasFailed: action.status === 'error',
    error,
    result,
    refreshStatus,
    isCheckingStatus,
    canCheckStatus: Boolean(accountId && auth.getAccountDeletionStatus),
    submit,
    retry: submit,
    reset: useCallback(() => {
      setConfirmation('');
      setFieldError(null);
      setError(null);
      setResult((current) => current?.isDeleted || current?.status === 'processing' ? current : null);
      action.reset();
    }, [action])
  };
}
