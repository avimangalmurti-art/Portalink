import { useEffect, useRef, type RefObject } from 'react';

/** Observe content interaction without taking ownership of the original gesture. */
export function useNavigationOutsideTap(open: boolean, layer: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    let dismissed = false;
    const outside = (target: EventTarget | null) => {
      const navigation = layer.current;
      if (!navigation || navigation.closest('[inert], [aria-hidden="true"]')) return false;
      if (target === document || target === window) return true;
      return target instanceof Element && !navigation.contains(target) &&
        !target.closest('[role="menu"], [role="dialog"], [role="alertdialog"], .modal-scrim');
    };
    const dismiss = (event: Event) => {
      if (dismissed || !outside(event.target)) return;
      dismissed = true;
      // No prevention, propagation stop, pointer capture or focus restoration:
      // the same down must reach the page's controls, pan and pinch handlers.
      close.current();
    };
    const down = (event: PointerEvent) => {
      if (event.isPrimary && event.button === 0) dismiss(event);
    };
    const click = (event: MouseEvent) => {
      // Keyboard / assistive activation has no pointerdown. Pointer gestures
      // that began inside navigation must stay with it even if released outside.
      if (event.detail === 0) dismiss(event);
    };
    const options = { capture: true, passive: true };
    window.addEventListener('pointerdown', down, options);
    window.addEventListener('click', click, options);
    window.addEventListener('scroll', dismiss, options);
    window.addEventListener('wheel', dismiss, options);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('wheel', dismiss, true);
    };
  }, [open, layer]);
}
