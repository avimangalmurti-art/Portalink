import { useId, useRef, useState } from 'react';
import { XIcon } from 'lucide-react';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
import { ImageRepositioner, type ImageRepositionerProps } from './ImageRepositioner';

export function ImageRepositionDialog({ title, onClose, ...props }: Omit<ImageRepositionerProps, 'startEditing' | 'onCancel'> & { title: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const headingId = useId();
  const requestClose = () => { if (!savingRef.current) onClose(); };
  useModalFocus(true, ref, requestClose);
  return <ModalPortal><div className="modal-scrim fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId} className="shape-container flex max-h-[90dvh] w-full max-w-[600px] flex-col overflow-hidden bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl outline-none">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--hairline)] px-5 py-3">
        <h2 id={headingId} className="min-w-0 flex-1 text-[16px] font-semibold">{title}</h2>
        <button type="button" disabled={saving} onClick={requestClose} aria-label="Cancel image repositioning" className="shape-compact flex h-9 w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40"><InterfaceIcon icon={XIcon} /></button>
      </header>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-5"><ImageRepositioner {...props} startEditing onCancel={requestClose} onSavingChange={(value) => { savingRef.current = value; setSaving(value); props.onSavingChange?.(value); }} /></div>
    </div>
  </div></ModalPortal>;
}
