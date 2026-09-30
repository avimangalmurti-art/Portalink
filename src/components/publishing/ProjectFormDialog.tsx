import { useRef, type ReactNode, type RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircleIcon, XIcon } from 'lucide-react';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ModalPortal } from '../ui/ModalPortal';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { Button } from '../ui/Button';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import './project-dialog.css';

/** The existing New project presentation, shared with editing published work. */
export function ProjectFormDialog({ title, titleId, description, onClose, closeDisabled = false, dialogRef, confirmation, children, mobileFlow = false }: {
  title: string;
  titleId: string;
  description?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  dialogRef?: RefObject<HTMLElement>;
  confirmation?: ReactNode;
  children: ReactNode;
  mobileFlow?: boolean;
}) {
  const localRef = useRef<HTMLElement>(null);
  const overlayRef = useDialogViewport();
  const ref = dialogRef ?? localRef;
  const reduceMotion = useReducedMotion();
  const requestClose = () => { if (!closeDisabled) onClose(); };
  useModalFocus(true, ref, requestClose);
  const transition = { duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] as const };
  return <ModalPortal>
    <motion.div ref={overlayRef} data-mobile-publish-flow={mobileFlow || undefined} className="project-form-overlay modal-scrim z-[80] bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={transition} onPointerDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <motion.section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="project-form-dialog flex flex-col rounded-[16px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[0_24px_60px_rgba(15,23,42,0.28)] outline-none" initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={transition}>
        <div className="project-form-heading flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[20px] font-semibold leading-tight">{title}</h2>
            {description ? <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">{description}</p> : null}
          </div>
          <button type="button" onClick={requestClose} disabled={closeDisabled} aria-label="Close" data-ui-control="icon" data-control-size="sm" data-control-variant="ghost" className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={XIcon} weight="medium" /></button>
        </div>
        {children}
      </motion.section>
      {confirmation}
    </motion.div>
  </ModalPortal>;
}

export function ProjectDiscardConfirmation({ title, description, error, busy = false, onKeep, onDiscard }: {
  title: string;
  description: string;
  error?: string | null;
  busy?: boolean;
  onKeep: () => void;
  onDiscard: () => void | Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(true, ref, () => { if (!busy) onKeep(); });
  return <div role="presentation" className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4">
    <div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-[340px] rounded-[14px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-5 text-[var(--text-primary)] shadow-[0_24px_60px_rgba(15,23,42,0.28)] outline-none">
      <h3 className="text-[16px] font-semibold leading-tight">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">{description}</p>
      {error ? <p role="alert" className="mt-3 flex items-start gap-2 rounded-[10px] border border-[var(--status-danger)] px-3 py-2.5 text-[13px] leading-relaxed"><AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span></p> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onKeep}>Keep editing</Button>
        <Button variant="danger" isLoading={busy} disabled={busy} onClick={() => void onDiscard()}>{error ? 'Try again' : 'Discard changes'}</Button>
      </div>
    </div>
  </div>;
}
