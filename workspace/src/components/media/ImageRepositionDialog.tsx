import { useId, useRef, useState, type ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
import { ImageRepositioner, type ImageRepositionerProps } from './ImageRepositioner';
import { ErrorState, LoadingState } from '../ui/StateViews';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import '../publishing/project-dialog.css';

export function ImageRepositionDialog({ title, onClose, controls, preparing = false, preparationError, onRetryPreparation, ...props }: Omit<ImageRepositionerProps, 'startEditing' | 'onCancel'> & { title: string; onClose: () => void; controls?: ReactNode; preparing?: boolean; preparationError?: string | null; onRetryPreparation?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const overlayRef = useDialogViewport();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const headingId = useId();
  const requestClose = () => { if (!savingRef.current) onClose(); };
  useModalFocus(true, ref, requestClose);
  return <ModalPortal><div ref={overlayRef} className="image-reposition-overlay modal-scrim z-[80] bg-black/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId} className="image-reposition-dialog shape-container flex flex-col bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl outline-none">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--hairline)] px-5 py-3">
        <h2 id={headingId} className="min-w-0 flex-1 text-[16px] font-semibold">{title}</h2>
        <button type="button" disabled={saving} onClick={requestClose} aria-label="Cancel image repositioning" className="shape-compact flex h-9 w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40"><InterfaceIcon icon={XIcon} /></button>
      </header>
      <div className="image-reposition-body">{preparing ? preparationError ? <ErrorState title="The preview could not be prepared" description={preparationError} onRetry={onRetryPreparation} /> : <LoadingState label="Preparing project preview…" /> : <>
        {controls ? <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">{controls}</fieldset> : null}
        <ImageRepositioner {...props} startEditing onCancel={requestClose} onSavingChange={(value) => { savingRef.current = value; setSaving(value); props.onSavingChange?.(value); }} />
      </>}</div>
    </div>
  </div></ModalPortal>;
}
