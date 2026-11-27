import { useId, useRef, useState, type ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
import { ImageRepositioner, type ImageRepositionerProps, type ImageRepositionSave } from './ImageRepositioner';
import { ErrorState, LoadingState } from '../ui/StateViews';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { usePresentation } from '../../presentation/usePresentation';
import '../publishing/project-dialog.css';

type ImageRepositionDialogProps = Omit<ImageRepositionerProps, keyof ImageRepositionSave | 'startEditing' | 'onCancel' | 'pinchToZoom'>
  & ImageRepositionSave
  & { title: string; onClose: () => void; controls?: ReactNode; preparing?: boolean; preparationError?: string | null; onRetryPreparation?: () => void; mobileAuthoring?: boolean };

export function ImageRepositionDialog({ title, onClose, controls, preparing = false, preparationError, onRetryPreparation, mobileAuthoring = false, ...props }: ImageRepositionDialogProps) {
  const isMobile = usePresentation() === 'mobile' && mobileAuthoring;
  const ref = useRef<HTMLDivElement>(null);
  const overlayRef = useDialogViewport();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const headingId = useId();
  const requestClose = () => { if (!savingRef.current) onClose(); };
  useModalFocus(true, ref, requestClose);
  return <ModalPortal>{isMobile && <div className="mobile-upload-surface-backdrop" aria-hidden="true" />}<div ref={overlayRef} data-mobile-upload-surface={isMobile ? 'cover' : undefined} className="image-reposition-overlay modal-scrim z-[80] bg-black/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" data-material={isMobile ? 'content' : undefined} aria-labelledby={headingId} className="image-reposition-dialog shape-container flex flex-col bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl outline-none">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--hairline)] px-5 py-3">
        <h2 id={headingId} className="min-w-0 flex-1 text-[16px] font-semibold">{title}</h2>
        <button type="button" disabled={saving} onClick={requestClose} aria-label="Cancel image repositioning" data-ui-control="icon" data-control-size="sm" data-control-variant="ghost" className="shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={XIcon} /></button>
      </header>
      <div className="image-reposition-body">{preparing ? preparationError ? <ErrorState title="The preview could not be prepared" description={preparationError} onRetry={onRetryPreparation} /> : <LoadingState label="Preparing project preview…" /> : <>
        {controls ? <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">{controls}</fieldset> : null}
        <ImageRepositioner {...props} pinchToZoom={isMobile} instructions={isMobile ? 'Drag to reposition. Pinch or use the slider to zoom.' : props.instructions} saveLabel={props.saveLabel ?? (isMobile ? 'Save cover' : undefined)} startEditing onCancel={requestClose} onSavingChange={(value) => { savingRef.current = value; setSaving(value); props.onSavingChange?.(value); }} />
      </>}</div>
    </div>
  </div></ModalPortal>;
}
