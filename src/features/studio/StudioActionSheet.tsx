import React, { useId, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ModalPortal } from '../../components/ui/ModalPortal';
import type { StudioRowAction } from './StudioRow';

/** Same viewport, focus containment and dismissal lifecycle as mobile message options. */
export function StudioActionSheet({ title, actions, onClose }: { title: string; actions: StudioRowAction[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const viewportRef = useDialogViewport();
  const titleId = useId();
  useModalFocus(true, dialogRef, onClose, true);
  return <ModalPortal>
    <div ref={viewportRef} role="presentation" className="modal-scrim fixed inset-x-0 z-50 flex items-end justify-center overflow-hidden bg-black/40" style={{ top: 'var(--dialog-viewport-top, 0px)', height: 'var(--dialog-viewport-height, 100dvh)' }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex max-h-full w-full max-w-[480px] flex-col rounded-t-[22px] border border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl outline-none" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <header className="flex shrink-0 items-center gap-3 px-4 pt-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[16px] font-semibold">{title}</h2>
          <button type="button" aria-label="Close Studio options" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={XIcon} /></button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-y-contain px-4 pb-1">
          {actions.map(action => <button key={action.id} type="button" disabled={action.disabled} onClick={() => { onClose(); action.onAction(); }} data-keep-color={action.destructive ? '' : undefined} className={`flex min-h-[44px] w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[15px] font-medium hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 ${action.destructive ? 'text-[var(--status-danger)]' : ''}`}>
            {action.icon ? <InterfaceIcon icon={action.icon} /> : null}{action.label}
          </button>)}
        </div>
      </div>
    </div>
  </ModalPortal>;
}
