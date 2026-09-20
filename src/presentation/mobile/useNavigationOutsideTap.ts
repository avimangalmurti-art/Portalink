import { useEffect, useRef, type RefObject } from 'react';

/** Dismiss the nonmodal rail on a tap, without putting a hit target over content. */
export function useNavigationOutsideTap(open: boolean, layer: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    let press: { id: number; x: number; y: number; released: boolean } | null = null;
    const outside = (target: EventTarget | null) => target instanceof Element && layer.current &&
      !layer.current.contains(target) && !layer.current.closest('[inert], [aria-hidden="true"]') &&
      !target.closest('[role="menu"], [role="dialog"], [role="alertdialog"], .modal-scrim');
    const cancel = () => { press = null; };
    const down = (event: PointerEvent) => {
      press = event.isPrimary && event.button === 0 && outside(event.target)
        ? { id: event.pointerId, x: event.clientX, y: event.clientY, released: false } : null;
      // Do not start a content drag/long-press that a dismissal would leave
      // unfinished. Native panning still works: never preventDefault here.
      if (press) event.stopPropagation();
    };
    const move = (event: PointerEvent) => {
      if (press && event.pointerId === press.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) cancel();
    };
    const up = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      if (!outside(event.target) || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) { cancel(); return; }
      press.released = true;
      // Run before document/React page handlers: a dismissal tap must not also
      // enter a page's double-tap tracking or hide the restored bottom dock.
      // Down/move/cancel and real scrolling always retain their native behavior.
      event.stopPropagation();
    };
    const click = (event: MouseEvent) => {
      const dismiss = press?.released && outside(event.target);
      cancel();
      if (!dismiss) return;
      event.preventDefault();
      event.stopPropagation();
      close.current();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('click', click, true);
    window.addEventListener('scroll', cancel, { capture: true, passive: true });
    window.addEventListener('wheel', cancel, { capture: true, passive: true });
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('scroll', cancel, true);
      window.removeEventListener('wheel', cancel, true);
      window.removeEventListener('blur', cancel);
    };
  }, [open, layer]);
}
