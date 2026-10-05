import { useRef, type TouchEvent } from 'react';

/** Activate a completed finger tap without waiting for a compatibility click.
 * Moving/cancelled touches remain native scrolling gestures. */
export function useTouchTap(activate: () => void, enabled = true) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      const touch = event.touches[0];
      start.current = enabled && event.touches.length === 1
        ? { id: touch.identifier, x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1 || !start.current || touch.identifier !== start.current.id ||
        Math.hypot(touch.clientX - start.current.x, touch.clientY - start.current.y) > 8) start.current = null;
    },
    onTouchCancel() { start.current = null; },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const began = start.current;
      start.current = null;
      const touch = event.changedTouches[0];
      if (!enabled || !began || event.touches.length || !touch || touch.identifier !== began.id ||
        Math.hypot(touch.clientX - began.x, touch.clientY - began.y) > 8 || !event.cancelable) return;
      const hit = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!hit || !event.currentTarget.contains(hit)) return;
      // Suppress the synthetic click so closing/selection happens exactly once.
      event.preventDefault();
      event.stopPropagation();
      activate();
    },
  };
}
