import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircleIcon, AlertTriangleIcon, InfoIcon, Loader2Icon, XIcon } from 'lucide-react';
import { AuthField } from '../../components/auth/AuthField';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { InteractionSafePresence } from '../../components/ui/InteractionSafePresence';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useAuth } from '../../contexts/AuthContext';
import { useAccountDeletion } from './useAccountDeletion';

/**
 * Permanently deleting an account.
 *
 * The flow is deliberately hard to activate by accident: it lives behind an
 * explicit control, opens a modal that states every consequence read from the
 * service's own capability, and refuses to submit until the person has typed
 * their full email address. The destructive control is disabled until then, so
 * no single keystroke or stray click can trigger it.
 *
 * It never claims a deletion it did not perform: while no account service is
 * connected, the flow says so up front and again as the outcome.
 */
export function DeleteAccountDialog({
  isOpen,
  onClose



}: {isOpen: boolean;onClose: () => void;}) {
  const auth = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const deletion = useAccountDeletion({
    accountEmail: auth.user?.email ?? null,
    accountId: auth.user?.id ?? null
  });
  const canPerformDeletion = deletion.capability?.isAvailable === true;

  // Focus enters the confirmation field, so the destructive button is never the
  // first thing a keyboard or screen-reader user lands on.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => confirmationRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Escape closes, except while a destructive request is in flight.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deletion.isDeleting) {
        onClose();
        return;
      }
      // A modal keeps focus inside itself rather than letting Tab reach the
      // settings page behind the scrim.
      if (event.key !== 'Tab' || !sheetRef.current) {
        return;
      }
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !sheetRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, deletion.isDeleting, onClose]);
  function close() {
    if (deletion.isDeleting) {
      return;
    }
    deletion.reset();
    onClose();
  }
  return <ModalPortal><InteractionSafePresence isPresent={isOpen}>
      {isOpen && <motion.div className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/55 px-4 py-8" initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} transition={{
      duration: shouldReduceMotion ? 0 : 0.18,
      ease: [0.22, 1, 0.36, 1]
    }} onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        close();
      }
    }}>
          <motion.section ref={sheetRef} role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" className="w-full max-w-[460px] rounded-[18px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-6 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(0,0,0,0.32)]" initial={shouldReduceMotion ? {
        opacity: 0
      } : {
        opacity: 0,
        scale: 0.98
      }} animate={{
        opacity: 1,
        scale: 1
      }} exit={shouldReduceMotion ? {
        opacity: 0
      } : {
        opacity: 0,
        scale: 0.99
      }} transition={{
        duration: shouldReduceMotion ? 0 : 0.18,
        ease: [0.22, 1, 0.36, 1]
      }}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="delete-account-title" className="flex items-center gap-2 text-[20px] font-semibold leading-tight">
                <AlertTriangleIcon className="h-5 w-5 shrink-0 text-[var(--status-danger)]" aria-hidden="true" />
                Delete account
              </h2>
              <button type="button" onClick={close} disabled={deletion.isDeleting} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40 motion-reduce:transition-none">
                <InterfaceIcon icon={XIcon} weight="medium" />
              </button>
            </div>

            {deletion.result ? <div className="mt-5 flex flex-col gap-4">
                {/* The outcome is reported exactly as the service described it.
               A prototype cannot delete an account, so this never
               congratulates anyone on a deletion that did not happen. */}
                <div role="status" className="flex items-start gap-2 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3 py-3 text-[13px] leading-relaxed">
                  <InfoIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="block font-semibold">{deletion.result.isDeleted ? 'Account deleted' : 'Nothing was deleted'}</span>
                    <span className="mt-1 block text-[var(--text-secondary)]">{deletion.result.message}</span>
                  </span>
                </div>
                <Button variant="secondary" size="lg" fullWidth onClick={close}>Close</Button>
              </div> : <>
                <p id="delete-account-description" className="mt-4 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  This permanently deletes <span className="font-semibold text-[var(--text-primary)]">{auth.user?.email}</span> and everything belonging to it. It cannot be undone, and nothing can be recovered afterwards.
                </p>

                {/* What is removed is read from the service, never guessed. */}
                {deletion.isCheckingCapability ? <p role="status" className="mt-4 flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                    <Loader2Icon className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Checking what deletion would remove…
                  </p> : deletion.capabilityError ? <p role="alert" className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed">
                    <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
                    We could not confirm what deleting this account would remove, so the deletion is not offered. Close this and try again.
                  </p> : <>
                    <ul className="mt-4 flex flex-col gap-1.5 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-3.5 py-3">
                      {deletion.capability?.removes.map((item) => <li key={item} className="flex items-start gap-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                          <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
                          {item}
                        </li>)}
                    </ul>

                    {/* Stated before the person invests effort in the flow. */}
                    {!canPerformDeletion && <p role="status" className="mt-4 flex items-start gap-2 rounded-[10px] border border-[var(--hairline-strong)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                        <InfoIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {deletion.capability?.reason} You can review this flow, but submitting it will not delete anything and your account will stay exactly as it is.
                      </p>}

                    <form className="mt-5 flex flex-col gap-4" onSubmit={(event) => {
              event.preventDefault();
              deletion.submit();
            }}>
                      {/* Typing the full address is the safeguard: the
                   destructive control cannot be reached without it. */}
                      <AuthField ref={confirmationRef} id="delete-account-confirmation" label="Confirm your email address" type="email" value={deletion.confirmation} autoComplete="off" hint={`Type ${auth.user?.email ?? 'your email address'} to enable deletion.`} error={deletion.fieldError} disabled={deletion.isDeleting} onChange={deletion.setConfirmation} />

                      {deletion.hasFailed && deletion.error?.code !== 'confirmation_mismatch' && <p role="alert" className="flex items-start gap-2 text-[12px] font-medium leading-relaxed">
                          <AlertCircleIcon className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{deletion.error?.message} Your account is unchanged. <button type="button" onClick={deletion.retry} className="font-semibold underline focus:outline-none">Try again</button></span>
                        </p>}

                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="lg" fullWidth onClick={close} disabled={deletion.isDeleting}>Cancel</Button>
                        <Button type="submit" variant="danger" size="lg" fullWidth isLoading={deletion.isDeleting} disabled={!deletion.isConfirmationMatched}>
                          {deletion.isDeleting ? 'Deleting…' : 'Delete permanently'}
                        </Button>
                      </div>
                    </form>
                  </>}
              </>}
          </motion.section>
        </motion.div>}
    </InteractionSafePresence></ModalPortal>;
}
