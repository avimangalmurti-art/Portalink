import React, { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { Button } from '../../components/ui/Button';
import { useModalFocus } from '../../hooks/useModalFocus';
import { accountDeletionEnabled } from '../../services/supabase/client';
import { useDeletionRecovery } from './useDeletionRecovery';
import { DELETION_RECOVERY_OPEN_EVENT } from './deletionRecoverySignal';

export function AccountDeletionRecovery() {
  return accountDeletionEnabled ? <AvailableDeletionRecovery /> : null;
}

function AvailableDeletionRecovery() {
  const auth = useAuth();
  const recovery = useDeletionRecovery({ enabled: accountDeletionEnabled, viewerAccountId: auth.user?.id ?? null,
    initializing: auth.isInitializing || Boolean(auth.pendingView) || Boolean(auth.session?.isPasswordRecovery) });
  const surface = useRef<HTMLElement>(null);
  useModalFocus(recovery.isOpen, surface, recovery.close);
  useEffect(() => { if (recovery.isOpen) window.dispatchEvent(new Event(DELETION_RECOVERY_OPEN_EVENT)); }, [recovery.isOpen]);
  if (!recovery.isOpen) return null;
  const completed = recovery.result?.status === 'completed' && recovery.result.isDeleted === true;
  const message = completed ? 'Account deletion is complete.' : recovery.unavailable
    ? 'Deletion status is unavailable. This does not confirm completion or cancel deletion. Try again, or contact support if it stays unavailable.'
    : recovery.checking ? 'Checking deletion status…' : recovery.none
      ? 'No deletion is in progress for this receipt.' : 'Deletion is in progress. Closing this window does not cancel it.';
  return <ModalPortal><div className="modal-scrim fixed inset-0 z-[1100] flex items-center justify-center bg-black/55 p-4">
    <section ref={surface} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="deletion-recovery-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-[460px] overflow-y-auto rounded-[24px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-5 text-[var(--text-primary)] shadow-xl focus:outline-none">
      <h2 id="deletion-recovery-title" className="text-[20px] font-semibold">Deletion status</h2>
      <p role="status" aria-live="polite" className="mt-3 text-[14px] leading-relaxed">{message}</p>
      {recovery.unavailable && <a className="mt-3 inline-flex min-h-[44px] items-center underline" href="mailto:avi@portalinknetworks.com">Contact support</a>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {!completed && <Button disabled={recovery.checking} onClick={() => { void recovery.refresh(); }}>Check again</Button>}
        <Button onClick={recovery.close}>Close</Button>
      </div>
    </section>
  </div></ModalPortal>;
}
