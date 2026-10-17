import { motionSeconds } from '../../presentation/motion/motion';
import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangleIcon, Loader2Icon, XIcon } from 'lucide-react';
import { AuthField } from '../../components/auth/AuthField';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { InteractionSafePresence } from '../../components/ui/InteractionSafePresence';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { DeferredDialog } from '../../components/ui/DeferredDialog';
import { useAuth } from '../../contexts/AuthContext';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useAccountDeletion } from './useAccountDeletion';

const ExportSheet = React.lazy(() => import('../references/ExportSheet').then(module => ({ default: module.ExportSheet })));

export function DeleteAccountDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const auth = useAuth();
  // Typed consent and a late deletion result belong to one account only.
  return <AccountDeletionDialog key={auth.user?.id ?? 'guest'} isOpen={isOpen} onClose={onClose} />;
}

function AccountDeletionDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const auth = useAuth();
  const sheetRef = useRef<HTMLElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const deletion = useAccountDeletion({ accountEmail: auth.user?.email ?? null, accountId: auth.user?.id ?? null });
  const isCompleted = deletion.result?.status === 'completed' && deletion.result.isDeleted;
  const completeAccountDeletion = auth.completeAccountDeletion;
  const refreshDeletionStatus = deletion.refreshStatus;
  useEffect(() => {
    if (isOpen && auth.user?.id) void refreshDeletionStatus();
  }, [isOpen, auth.user?.id, refreshDeletionStatus]);
  useEffect(() => {
    if (isCompleted) completeAccountDeletion();
  }, [isCompleted, completeAccountDeletion]);

  function close() {
    if (deletion.isDeleting) return;
    deletion.reset();
    onClose();
  }
  useModalFocus(isOpen, sheetRef, close);

  return <><ModalPortal><InteractionSafePresence isPresent={isOpen}>
    {isOpen && <motion.div className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : motionSeconds('base') }} onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section ref={sheetRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" aria-busy={deletion.isDeleting} className="max-h-[calc(100dvh-2rem)] w-full max-w-[460px] overflow-y-auto rounded-[18px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-5 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(0,0,0,0.32)] focus:outline-none sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="delete-account-title" className="flex items-center gap-2 text-[20px] font-semibold leading-tight">
            <AlertTriangleIcon className="h-5 w-5 shrink-0 text-[var(--status-danger)]" aria-hidden="true" />
            {isCompleted ? 'Account deleted' : deletion.isDeleting || deletion.result?.status === 'processing' ? 'Deletion in progress' : 'Delete account'}
          </h2>
          <Button variant="ghost" size="lg" onClick={close} disabled={deletion.isDeleting} aria-label="Close"><InterfaceIcon icon={XIcon} /></Button>
        </div>
        {deletion.result ? <div className="mt-4 space-y-5">
          <p id="delete-account-description" role="status" className="text-[14px] leading-relaxed text-[var(--text-secondary)]">{deletion.result.message}</p>
          {deletion.error ? <p role="alert" className="text-[13px] text-[var(--status-danger)]">{deletion.error.message}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {deletion.result.status === 'processing' && deletion.canCheckStatus && <Button size="lg" isLoading={deletion.isCheckingStatus} disabled={deletion.isCheckingStatus} onClick={() => void deletion.refreshStatus()}>Check status</Button>}
            <Button size="lg" onClick={close} disabled={deletion.isDeleting}>Close</Button>
          </div>
        </div> : <>
          <p id="delete-account-description" className="mt-4 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {deletion.capability?.isAvailable && !deletion.isCheckingCapability && !deletion.capabilityError
              ? 'Deletion starts immediately when you confirm and cannot be undone. Export anything you want to keep first. Your profile, projects, and your own uploaded files are removed. Shared conversations and other participants’ messages and attachments stay available to them. Your messages are marked as removed and attributed to Deleted User.'
              : 'Account deletion is currently unavailable. Your account and content remain in place.'}
          </p>
          {deletion.isCheckingCapability ? <p role="status" className="mt-4 flex items-center gap-2 text-[13px] text-[var(--text-secondary)]"><Loader2Icon className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Checking availability…</p>
          : deletion.capabilityError ? <p role="alert" className="mt-4 text-[13px] text-[var(--text-secondary)]">We couldn’t check account deletion. Close this window and try again.</p>
          : deletion.capability?.isAvailable ? <>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {deletion.capability.removes.map((item) => <li key={item}>{item}</li>)}
            </ul>
            {auth.viewerProfileId && <div className="mt-4 space-y-2">
              <Button size="lg" disabled={deletion.isDeleting || deletion.isCheckingStatus} onClick={() => setExportOpen(true)}>Export</Button>
              <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">Export your bibliography or public Portfolio PDF before confirming. The PDF excludes private and hidden work; these exports are not a complete archive of your account or uploaded files. Save original files separately before deletion.</p>
            </div>}
            <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); deletion.submit(); }}>
              <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">You must have signed in within the last five minutes. Sign in again if needed before confirming deletion.</p>
              <AuthField id="delete-account-confirmation" label="Confirm your email address" type="email" value={deletion.confirmation} autoComplete="off" hint={`Type ${auth.user?.email ?? 'your email address'} to confirm.`} error={deletion.fieldError} disabled={deletion.isDeleting} onChange={deletion.setConfirmation} />
              {deletion.hasFailed && deletion.error?.code !== 'confirmation_mismatch' && <p role="alert" className="text-[13px] leading-relaxed text-[var(--status-danger)]">{deletion.error?.message}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="lg" onClick={close} disabled={deletion.isDeleting}>Close</Button>
                <Button type="submit" variant="danger" size="lg" isLoading={deletion.isDeleting} disabled={!deletion.canSubmit}>{deletion.isDeleting ? 'Deleting…' : 'Delete account'}</Button>
              </div>
            </form>
          </> : <div className="mt-4 space-y-5">
            <p role="status" className="text-[13px] leading-relaxed text-[var(--text-secondary)]">{deletion.capability?.reason ?? 'Account deletion is temporarily unavailable. Please try again later.'}</p>
            <div className="flex justify-end"><Button size="lg" onClick={close}>Close</Button></div>
          </div>}
        </>}
      </section>
    </motion.div>}
  </InteractionSafePresence></ModalPortal>
    <DeferredDialog active={exportOpen && isOpen} onClose={() => setExportOpen(false)}>{exportOpen && isOpen && auth.viewerProfileId && <ExportSheet profileId={auth.viewerProfileId} onClose={() => setExportOpen(false)} />}</DeferredDialog>
  </>;
}
