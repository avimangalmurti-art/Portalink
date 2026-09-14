import { useRef } from 'react';
import type { PointerEvent } from 'react';

type Sample = { x: number; y: number; time: number };
type Gesture = Sample & { id: number; axis: 'pending' | 'x' | 'y' };

/** A deliberate horizontal drag or quick flick; vertical scrolling always wins. */
export function navigationSwipe(start: Sample, end: Sample): 'left' | 'right' | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.abs(dx);
  if (distance < 24 || distance < Math.abs(dy) * 1.5) return null;
  if (distance < 56 && distance / Math.max(1, end.time - start.time) < 0.35) return null;
  return dx < 0 ? 'left' : 'right';
}

/** Applied only to navigation surfaces, never to the document/media viewers. */
export function useNavigationSwipe(direction: 'left' | 'right', onSwipe: () => void) {
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  return {
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      suppressClick.current = false;
      if (!event.isPrimary || event.pointerType === 'mouse') return;
      // React portal events bubble through this component even when the menu
      // lives outside its DOM. Such gestures belong to the menu, not the rail.
      const target = event.target as Element;
      if (!event.currentTarget.contains(target) || target.closest('[role="menu"], [role="dialog"], [role="alertdialog"], input, textarea, select, [contenteditable="true"]')) return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, axis: 'pending' };
    },
    onPointerMoveCapture(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start || event.pointerId !== start.id) return;
      const dx = Math.abs(event.clientX - start.x), dy = Math.abs(event.clientY - start.y);
      if (start.axis === 'pending' && Math.max(dx, dy) > 8) {
        start.axis = dx > dy * 1.5 ? 'x' : 'y';
        if (start.axis === 'x') event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    onPointerUpCapture(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      gesture.current = null;
      if (!start || start.id !== event.pointerId || start.axis === 'y') return;
      const result = navigationSwipe(start, { x: event.clientX, y: event.clientY, time: event.timeStamp });
      if (result === direction) {
        suppressClick.current = true;
        onSwipe();
      }
    },
    onPointerCancel() { gesture.current = null; },
    onClickCapture(event: React.MouseEvent<HTMLElement>) {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
