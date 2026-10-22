import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { MoreHorizontalIcon } from 'lucide-react';
import { ModalPortal } from '../ui/ModalPortal';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { useModalFocus } from '../../hooks/useModalFocus';
import { positionAnchoredMenu } from '../../utils/anchoredMenu';

export function ProjectFilesMenu({ hasFiles, locked, showsRequirements, onRequirements, onRemoveAll, triggerRef, onboardingFiles = false, presentation = 'web' }: {
  hasFiles: boolean; locked: boolean; showsRequirements: boolean; onRequirements: () => void; onRemoveAll: () => void; triggerRef: RefObject<HTMLButtonElement>;
  onboardingFiles?: boolean; presentation?: 'mobile' | 'web';
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ReturnType<typeof positionAnchoredMenu> | null>(null);
  useModalFocus(open, menuRef, () => setOpen(false));
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current, menu = menuRef.current;
      if (!trigger || !menu) return;
      const viewport = window.visualViewport;
      const offsetTop = viewport?.offsetTop ?? 0;
      const anchor = trigger.getBoundingClientRect();
      const next = positionAnchoredMenu({ right: anchor.right, top: anchor.top - offsetTop, bottom: anchor.bottom - offsetTop }, menu.offsetWidth, menu.scrollHeight, viewport?.width ?? window.innerWidth, viewport?.height ?? window.innerHeight);
      setPosition({ ...next, top: next.top + offsetTop });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [open, hasFiles, showsRequirements, triggerRef]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, triggerRef]);
  const actionClass = 'flex w-full items-center px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:opacity-40';
  return <>
    <button ref={triggerRef} type="button" aria-label="Project file options" title="Project file options" aria-haspopup="menu" aria-expanded={open} data-ui-shape={onboardingFiles ? 'icon' : undefined} data-control-size={onboardingFiles ? 'sm' : undefined} onClick={() => setOpen((value) => !value)} className="shape-compact flex h-7 w-7 items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={MoreHorizontalIcon} size="sm" /></button>
    {open ? <ModalPortal><div ref={menuRef} role="menu" aria-label="Project file options" tabIndex={-1} data-onboarding-files-manager={onboardingFiles || undefined} data-presentation={onboardingFiles ? presentation : undefined} data-ui-shape={onboardingFiles ? 'popup' : undefined} style={position ?? { visibility: 'hidden' }} className="fixed z-[100] w-[208px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] py-1 shadow-[0_12px_28px_rgba(15,23,42,0.2)] outline-none" onKeyDown={(event) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const index = items.findIndex((item) => item === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? (event.key === 'ArrowUp' ? items.length - 1 : 0) : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    }}>
      <button type="button" role="menuitem" data-ui-shape={onboardingFiles ? 'row' : undefined} className={`${actionClass} text-[var(--text-primary)]`} onClick={() => { setOpen(false); onRequirements(); }}>{showsRequirements ? 'Hide file requirements' : 'File requirements'}</button>
      {hasFiles ? <button type="button" role="menuitem" data-ui-shape={onboardingFiles ? 'row' : undefined} disabled={locked} className={`${actionClass} text-[var(--status-danger)]`} onClick={() => { if (locked) return; setOpen(false); onRemoveAll(); }}>Remove all files…</button> : null}
    </div></ModalPortal> : null}
  </>;
}
