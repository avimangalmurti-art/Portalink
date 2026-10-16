import React, { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { usePresentation } from '../../presentation/usePresentation';
import { ModalPortal } from './ModalPortal';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import './confirmation-dialog.css';

export type ConfirmationDialogProps = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'standard' | 'destructive';
  pending?: boolean;
  pendingLabel?: string;
  confirmDisabled?: boolean;
  error?: string | null;
  onConfirm: () => void | boolean | Promise<void | boolean>;
  onCancel: () => void;
  /** Fullscreen media needs its existing fullscreen portal host. */
  host?: Element | null;
  returnFocusRef?: RefObject<HTMLElement>;
};

/** Decisions only. The caller closes after confirmed success; failures remain retryable. */
export function ConfirmationDialog({ title, description, confirmLabel, cancelLabel = 'Cancel', variant = 'standard', pending = false, pendingLabel = 'Working…', confirmDisabled = false, error, onConfirm, onCancel, host, returnFocusRef }: ConfirmationDialogProps) {
  const id = useId(), viewport = useDialogViewport(), dialog = useRef<HTMLElement>(null), safe = useRef<HTMLButtonElement>(null);
  const presentation = usePresentation();
  const lock = useRef(false), mounted = useRef(true);
  const [working, setWorking] = useState(false), [failure, setFailure] = useState('');
  const busy = pending || working;
  const cancel = () => { if (!busy && !lock.current) onCancel(); };
  useModalFocus(true, dialog, cancel, true);
  useEffect(() => { mounted.current = true; safe.current?.focus({ preventScroll: true }); return () => { mounted.current = false; if(returnFocusRef?.current?.isConnected)returnFocusRef.current.focus({preventScroll:true}); }; }, [returnFocusRef]);
  useEffect(() => {
    if(busy)dialog.current?.focus({preventScroll:true});
    else if(dialog.current && document.activeElement===dialog.current)safe.current?.focus({preventScroll:true});
  },[busy]);
  const confirm = async () => {
    if (busy || confirmDisabled || lock.current) return;
    lock.current = true; setWorking(true); setFailure('');
    try { if (await onConfirm() === false && mounted.current) setFailure('This action could not be completed. Try again or cancel.'); }
    catch (caught) { if (mounted.current) setFailure(caught instanceof Error ? caught.message : 'This action could not be completed. Try again or cancel.'); }
    finally { lock.current = false; if (mounted.current) setWorking(false); }
  };
  const content = <div ref={viewport} data-presentation={presentation} className="portalink-confirmation-overlay modal-scrim" role="presentation" onPointerDown={event => event.stopPropagation()}>
    <ScreenBack action={cancel}>{null}</ScreenBack>
    <section ref={dialog} tabIndex={-1} data-material="content" data-ui-surface="popup" className="portalink-confirmation" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={busy}>
      <h2 id={`${id}-title`}>{title}</h2>
      <div id={`${id}-description`} className="portalink-confirmation-description">{description}</div>
      {(error || failure) && <p role="alert" className="portalink-confirmation-error">{error || failure}</p>}
      <div className="portalink-confirmation-actions">
        <button data-ui-control="button" data-control-size="lg" data-control-variant="secondary" ref={safe} type="button" disabled={busy} onClick={cancel}>{cancelLabel}</button>
        <button type="button" data-ui-control="button" data-control-size="lg" data-control-variant={variant === 'destructive' ? 'danger' : 'primary'} data-keep-color="" data-variant={variant} disabled={busy || confirmDisabled} onClick={() => void confirm()}>{busy ? pendingLabel : confirmLabel}</button>
      </div>
    </section>
  </div>;
  const target = host ?? (typeof document !== 'undefined' ? document.fullscreenElement : null);
  return target ? createPortal(content, target) : <ModalPortal>{content}</ModalPortal>;
}
