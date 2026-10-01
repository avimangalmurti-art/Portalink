import { useEffect, useRef, type ReactNode } from 'react';
import { useModalFocus } from '../../hooks/useModalFocus';

/** Mount beside the form/sheet inside its useDialogViewport overlay, never inside its scroller. */
export function DiscardConfirmationLayer({ label, onKeep, children, className = 'p-5' }: {
  label: string;
  onKeep: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(true, ref, onKeep, true);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, []);
  return <div data-discard-confirmation-layer="" role="presentation"
    className="modal-scrim absolute inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
    onPointerDown={event => event.stopPropagation()}>
    <div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-label={label}
      className={`max-h-full w-full max-w-[340px] overflow-y-auto overscroll-contain rounded-[14px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[0_24px_60px_rgba(15,23,42,0.28)] outline-none ${className}`}>
      {children}
    </div>
  </div>;
}
