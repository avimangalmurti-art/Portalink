import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';

type Options = { open: boolean; menuRef: RefObject<HTMLElement>; triggerRef: RefObject<HTMLButtonElement>;
  onOpen: () => void; onClose: () => void; mode?: 'menu' | 'dialog'; childSelector?: string };
function itemsIn(surface: HTMLElement, mode: 'menu' | 'dialog') {
  return Array.from(surface.querySelectorAll<HTMLElement>(mode === 'menu' ? '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]' : 'button,a[href],input,select,textarea,[tabindex]'))
    .filter(el => !el.matches(':disabled,[aria-disabled="true"]') && !el.closest('[hidden],[inert],[aria-hidden="true"]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && (mode === 'menu' ? el.closest('[role="menu"]') === surface : el.tabIndex >= 0));
}

/** Nonmodal menu focus. Mixed controls retain ordinary keyboard navigation. */
export function useMenuFocus({ open, menuRef, triggerRef, onOpen, onClose, mode = 'menu', childSelector }: Options) {
  const actions = useRef({ onOpen, onClose }); actions.current = { onOpen, onClose };
  const last = useRef(false);
  useEffect(() => {
    const surface = menuRef.current;
    if (!open || !surface) return;
    let restore = true;
    const focusTrigger = () => triggerRef.current?.focus({ preventScroll: true });
    const frame = requestAnimationFrame(() => {
      const items = itemsIn(surface, mode);
      (last.current ? items[items.length - 1] ?? surface : items[0] ?? surface).focus({ preventScroll: true }); last.current = false;
    });
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || surface.contains(event.target) || triggerRef.current?.contains(event.target) || (childSelector && event.target.closest(childSelector))) return;
      restore = false; actions.current.onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (childSelector && document.querySelector(childSelector))) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); focusTrigger(); actions.current.onClose(); return; }
      const items = itemsIn(surface, mode);
      if (event.key === 'Tab') {
        const active = document.activeElement;
        if (mode === 'dialog' && active !== surface && (event.shiftKey ? active !== items[0] : active !== items[items.length - 1])) return;
        restore = false; focusTrigger(); flushSync(() => actions.current.onClose()); return;
      }
      if (mode !== 'menu' || !items.length || !['ArrowDown','ArrowUp','Home','End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const index = items.findIndex(item => item === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? (event.key === 'ArrowUp' ? items.length - 1 : 0) : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next].focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside); surface.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside); surface.removeEventListener('keydown', key);
      if (restore && (document.activeElement === document.body || surface.contains(document.activeElement))) focusTrigger();
    };
  }, [open, menuRef, triggerRef, mode, childSelector]);
  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (mode !== 'menu' || !['ArrowDown','ArrowUp'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); last.current = event.key === 'ArrowUp';
    if (!open) actions.current.onOpen();
    else if (menuRef.current) { const items = itemsIn(menuRef.current, mode); (last.current ? items[items.length - 1] : items[0])?.focus({ preventScroll: true }); last.current = false; }
  }
  return { onTriggerKeyDown };
}
