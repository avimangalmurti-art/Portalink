import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { usePresentation } from '../../presentation/usePresentation';

/** Reserve fitted MOBILE pages for horizontal swipes; zoomed pages still pan. */
export function useFocusedPageSwipe({ active, zoom, onMove }: {
  active: boolean;
  zoom: number;
  onMove: (direction: -1 | 1) => void;
}) {
  const isMobile = usePresentation() === 'mobile';
  const startRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    startRef.current = null;
    if (!active || event.pointerType !== 'touch' || zoom > 1.01) return;
    if (isMobile) {
      const target = event.target;
      if (!event.isPrimary || !(target instanceof Element) ||
        target.closest('button, a, input, textarea, select, [contenteditable="true"], [data-media-interaction], [role="dialog"], [role="menu"]')) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      // Leave the phone's edge navigation gesture available.
      if (event.clientX - bounds.left < 20 || bounds.right - event.clientX < 20) return;
    }
    startRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!isMobile || !start || start.id !== event.pointerId) return;
    const dx = Math.abs(event.clientX - start.x), dy = Math.abs(event.clientY - start.y);
    if (zoom > 1.01 || (dy > 10 && dy >= dx)) startRef.current = null;
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    startRef.current = null;
    if (!active || !start || event.pointerType !== 'touch' || zoom > 1.01 ||
      (isMobile && start.id !== event.pointerId)) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      if (isMobile) { event.preventDefault(); event.stopPropagation(); }
      onMove(dx < 0 ? 1 : -1);
    }
  };
  const touchAction = isMobile && active && zoom <= 1.01 ? 'pan-y' : 'pan-x pan-y';
  return {
    isMobile,
    swipeStyle: { touchAction, '--focused-page-touch-action': touchAction } as CSSProperties,
    swipeHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: () => { startRef.current = null; },
    },
  };
}
