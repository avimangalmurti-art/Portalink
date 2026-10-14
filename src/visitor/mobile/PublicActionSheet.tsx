import React, { useId, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ModalPortal } from '../../components/ui/ModalPortal';
import type { ContextAction, ContextActions } from '../../presentation/mobile/contextActions';
import { useSheetMotion } from '../../presentation/motion/useSheetMotion';

/** Public project menus retain shared permissions/handlers, but own their UI. */
export function PublicActionSheet({ model, onClose, onAction, children }: {
  model: ContextActions; onClose: () => void; onAction: (action: ContextAction) => void; children?: React.ReactNode;
}) {
  const motion = useSheetMotion(onClose);
  const dialog = useRef<HTMLDivElement>(null), viewport = useDialogViewport(), title = useId();
  useModalFocus(true, dialog, () => motion.close(), true);
  return <ModalPortal><div data-presentation="mobile" ref={viewport} className="public-actions-overlay" data-motion-scrim="" data-motion-closing={motion.closing || undefined} onClick={event => { if (event.target === event.currentTarget) motion.close(); }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title} className="public-actions-sheet" data-motion-sheet="" data-motion-closing={motion.closing || undefined}>
      <header><h2 id={title}>{model.title}</h2><button type="button" aria-label="Close actions" onClick={() => motion.close()}><InterfaceIcon icon={XIcon} /></button></header>
      <div className="public-actions-body">
        {[model.primary, ...model.groups].filter(group => group.length).map((group, index) => <div className="public-actions-group" key={index}>
          {group.map(action => <button type="button" key={action.id} data-destructive={action.destructive || undefined} onClick={event => motion.close(() => onAction(action),event.currentTarget.closest<HTMLElement>('[data-motion-scrim]'))}><span>{action.label}</span><InterfaceIcon icon={action.icon} /></button>)}
        </div>)}
        {children}
      </div>
    </section>
  </div></ModalPortal>;
}

