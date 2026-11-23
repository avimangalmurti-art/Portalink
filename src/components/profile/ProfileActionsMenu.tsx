import React, { useLayoutEffect, useState, type RefObject } from 'react';
import { CheckIcon } from 'lucide-react';
import { useCatalogueCopyFeedback } from '../../features/sharing/useCatalogueCopyFeedback';
import type { ContextAction, ContextActions } from '../../presentation/mobile/contextActions';
import { positionAnchoredMenu } from '../../utils/anchoredMenu';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';

type Props = {
  id: string;
  model: ContextActions;
  triggerRef: RefObject<HTMLButtonElement>;
  menuRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onAction: (action: ContextAction) => unknown;
};

export function ProfileActionsMenu({ id, model, triggerRef, menuRef, onClose, onAction }: Props) {
  const [position, setPosition] = useState<ReturnType<typeof positionAnchoredMenu> | null>(null);
  const copy = useCatalogueCopyFeedback();

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const viewport = window.visualViewport;
    const update = () => {
      if (!trigger.getClientRects().length) { onClose(); return; }
      const anchor = trigger.getBoundingClientRect();
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      const next = positionAnchoredMenu(
        { right: anchor.right - x, top: anchor.top - y, bottom: anchor.bottom - y },
        menu.offsetWidth, menu.scrollHeight + menu.offsetHeight - menu.clientHeight,
        viewport?.width ?? window.innerWidth, viewport?.height ?? window.innerHeight,
      );
      setPosition({ left: next.left + x, top: next.top + y, maxHeight: next.maxHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(trigger);
    observer.observe(menu);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [triggerRef, menuRef, onClose]);

  return <ModalPortal>
    <div id={id} ref={menuRef} role="menu" aria-label={model.title} tabIndex={-1}
      className="profile-actions-menu" style={position ?? { visibility: 'hidden' }}>
      {[model.primary, ...model.groups].filter(group => group.length > 0).map(group =>
        <div key={group[0].id} role="group">
          {group.map(action => {
            const isCopy = action.id === 'copy';
            const copied = isCopy && copy.state === 'copied';
            const pending = isCopy && copy.state === 'pending';
            return <button key={action.id} type="button" role="menuitem" tabIndex={-1}
              aria-disabled={pending || undefined} aria-busy={pending || undefined}
              onClick={() => isCopy ? void copy.run(() => onAction(action)) : void onAction(action)}>
              <InterfaceIcon icon={copied ? CheckIcon : action.icon} size="sm" />
              <span>{copied ? 'Copied' : pending ? 'Copying…' : action.label}</span>
            </button>;
          })}
        </div>
      )}
      <span role="status" className="sr-only">{copy.state === 'copied' ? 'Public catalogue link copied' : ''}</span>
      {copy.error && <p role="alert">{copy.error}</p>}
    </div>
  </ModalPortal>;
}
