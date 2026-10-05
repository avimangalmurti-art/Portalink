import { useRef, type PointerEvent, type MouseEvent } from 'react';

/** Touch taps activate from pointer events without cancelable/hit-test gates. Keep a
 * separate click guard: preventDefault on pointerup alone does not suppress
 * the browser's compatibility click on every mobile browser. */
export function useTouchTap(activate: () => void, enabled = true) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const consumed = useRef(false);
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      consumed.current = false;
      start.current = enabled && event.pointerType === 'touch' && event.isPrimary && event.button === 0
        ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (start.current && (event.pointerId !== start.current.id || Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8)) start.current = null;
    },
    onPointerCancel() { start.current = null; },
    onPointerLeave() { start.current = null; },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const began = start.current;
      start.current = null;
      if (!enabled || !began || event.pointerId !== began.id || !event.isPrimary ||
        Math.hypot(event.clientX - began.x, event.clientY - began.y) > 8) return;
      consumed.current = true;
      event.stopPropagation();
      activate();
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      const duplicate = consumed.current && event.detail !== 0;
      consumed.current = false;
      if (duplicate) { event.preventDefault(); event.stopPropagation(); }
    },
  };
}
