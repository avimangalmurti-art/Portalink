import React, { useId, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ModalPortal } from '../../components/ui/ModalPortal';
import type { ContextAction, ContextActions } from '../../presentation/mobile/contextActions';

/** Public project menus retain shared permissions/handlers, but own their UI. */
export function PublicActionSheet({ model, onClose, onAction, children }: {
  model: ContextActions; onClose: () => void; onAction: (action: ContextAction) => void; children?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null), viewport = useDialogViewport(), title = useId();
  useModalFocus(true, dialog, onClose, true);
  return <ModalPortal><div data-presentation="mobile" ref={viewport} className="public-actions-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title} className="public-actions-sheet">
      <header><h2 id={title}>{model.title}</h2><button type="button" aria-label="Close actions" onClick={onClose}><InterfaceIcon icon={XIcon} /></button></header>
      <div className="public-actions-body">
        {[model.primary, ...model.groups].filter(group => group.length).map((group, index) => <div className="public-actions-group" key={index}>
          {group.map(action => <button type="button" key={action.id} data-destructive={action.destructive || undefined} onClick={() => onAction(action)}><span>{action.label}</span><InterfaceIcon icon={action.icon} /></button>)}
        </div>)}
        {children}
      </div>
    </section>
  </div></ModalPortal>;
}

