import { motionSeconds } from '../../presentation/motion/motion';
import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangleIcon, Loader2Icon, XIcon } from 'lucide-react';
import { AuthField } from '../../components/auth/AuthField';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { InteractionSafePresence } from '../../components/ui/InteractionSafePresence';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useAuth } from '../../contexts/AuthContext';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useAccountDeletion } from './useAccountDeletion';

export function DeleteAccountDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const auth = useAuth();
  const sheetRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const deletion = useAccountDeletion({ accountEmail: auth.user?.email ?? null, accountId: auth.user?.id ?? null });
  const completeAccountDeletion = auth.completeAccountDeletion;
  const refreshDeletionStatus = deletion.refreshStatus;
  useEffect(() => {
    if (isOpen && auth.user?.id) void refreshDeletionStatus();
  }, [isOpen, auth.user?.id, refreshDeletionStatus]);
  useEffect(() => {
    if (deletion.result?.isDeleted) completeAccountDeletion();
  }, [deletion.result?.isDeleted, completeAccountDeletion]);

  function close() {
    if (deletion.isDeleting) return;
    deletion.reset();
    onClose();
  }
  useModalFocus(isOpen, sheetRef, close);

  return <ModalPortal><InteractionSafePresence isPresent={isOpen}>
    {isOpen && <motion.div className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : motionSeconds('base') }} onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section ref={sheetRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" aria-busy={deletion.isDeleting} className="max-h-[calc(100dvh-2rem)] w-full max-w-[460px] overflow-y-auto rounded-[18px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-5 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(0,0,0,0.32)] focus:outline-none sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="delete-account-title" className="flex items-center gap-2 text-[20px] font-semibold leading-tight">
            <AlertTriangleIcon className="h-5 w-5 shrink-0 text-[var(--status-danger)]" aria-hidden="true" />
            {deletion.result?.isDeleted ? 'Account deleted' : deletion.result?.status === 'pending' ? 'Deletion scheduled' : 'Delete account'}
          </h2>
          <Button variant="ghost" size="lg" onClick={close} disabled={deletion.isDeleting} aria-label="Close"><InterfaceIcon icon={XIcon} /></Button>
        </div>
        {deletion.result ? <div className="mt-4 space-y-5">
          <p id="delete-account-description" role="status" className="text-[14px] leading-relaxed text-[var(--text-secondary)]">{deletion.result.message}</p>
          {deletion.result.deleteAfter ? <p className="text-[13px] text-[var(--text-secondary)]">Permanent deletion can start after {new Date(deletion.result.deleteAfter).toLocaleString()}.</p> : null}
          {deletion.result.status === 'pending' ? <Button onClick={() => void deletion.cancel()}>Cancel deletion</Button> : null}
          {deletion.error ? <p role="alert" className="text-[13px] text-[var(--status-danger)]">{deletion.error.message}</p> : null}
          <div className="flex justify-end"><Button size="lg" onClick={close}>Close</Button></div>
        </div> : <>
          <p id="delete-account-description" className="mt-4 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {deletion.capability?.isAvailable && !deletion.isCheckingCapability && !deletion.capabilityError
              ? 'Deletion starts immediately after confirmation and cannot be undone once processing begins. Your profile, projects, and your own uploaded files are removed. Shared conversations and other participants’ messages and attachments stay available to them. Your messages are marked as removed and attributed to Deleted User.'
              : 'Account deletion is currently unavailable. Your account and content remain in place.'}
          </p>
          {deletion.isCheckingCapability ? <p role="status" className="mt-4 flex items-center gap-2 text-[13px] text-[var(--text-secondary)]"><Loader2Icon className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Checking availability…</p>
          : deletion.capabilityError ? <p role="alert" className="mt-4 text-[13px] text-[var(--text-secondary)]">We couldn’t check account deletion. Close this window and try again.</p>
          : deletion.capability?.isAvailable ? <>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {deletion.capability.removes.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); deletion.submit(); }}>
              <AuthField id="delete-account-confirmation" label="Confirm your email address" type="email" value={deletion.confirmation} autoComplete="off" hint={`Type ${auth.user?.email ?? 'your email address'} to confirm.`} error={deletion.fieldError} disabled={deletion.isDeleting} onChange={deletion.setConfirmation} />
              {deletion.hasFailed && deletion.error?.code !== 'confirmation_mismatch' && <p role="alert" className="text-[13px] leading-relaxed text-[var(--status-danger)]">{deletion.error?.message}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="lg" onClick={close} disabled={deletion.isDeleting}>Cancel</Button>
                <Button type="submit" variant="danger" size="lg" isLoading={deletion.isDeleting} disabled={!deletion.canSubmit}>{deletion.isDeleting ? 'Scheduling…' : 'Schedule deletion'}</Button>
              </div>
            </form>
          </> : <div className="mt-4 space-y-5">
            <p role="status" className="text-[13px] leading-relaxed text-[var(--text-secondary)]">{deletion.capability?.reason ?? 'Account deletion is temporarily unavailable. Please try again later.'}</p>
            <div className="flex justify-end"><Button size="lg" onClick={close}>Close</Button></div>
          </div>}
        </>}
      </section>
    </motion.div>}
  </InteractionSafePresence></ModalPortal>;
}
