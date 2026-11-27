import { useLayoutEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import { usePresentation } from '../../presentation/usePresentation';

/** Fitted MOBILE pages swipe sideways to turn and down to exit; zoomed pages pan. */
export function useFocusedPageSwipe({ active, zoom, onMove, onExit, readingMode = false }: {
  active: boolean;
  readingMode?: boolean;
  zoom: number;
  onMove: (direction: -1 | 1) => void;
  onExit: () => void;
}) {
  const isMobile = usePresentation() === 'mobile';
  const startRef = useRef<{ id: number; x: number; y: number; axis?: 'x' | 'y' } | null>(null);
  const multitouchRef = useRef(false);
  useLayoutEffect(() => {
    if (!isMobile || !active) return;
    const trackTouches = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        // A second finger can land outside the reader, and the first pointer
        // can release before the native pinch commits its zoom.
        startRef.current = null;
        multitouchRef.current = true;
      } else if (event.touches.length === 0) {
        multitouchRef.current = false;
      }
    };
    const events = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;
    for (const type of events) document.addEventListener(type, trackTouches, { capture: true, passive: true });
    return () => {
      for (const type of events) document.removeEventListener(type, trackTouches, true);
      startRef.current = null;
      multitouchRef.current = false;
    };
  }, [active, isMobile]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    startRef.current = null;
    if (!active || event.pointerType !== 'touch' || zoom > 1.01) return;
    if (isMobile) {
      const target = event.target;
      if (multitouchRef.current || !event.isPrimary || !(target instanceof Element) ||
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
    if (zoom > 1.01) {
      startRef.current = null;
    } else if (!start.axis && Math.max(dx, dy) > 10) {
      start.axis = dy >= dx ? 'y' : 'x';
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    startRef.current = null;
    if (!active || !start || event.pointerType !== 'touch' || zoom > 1.01 ||
      (isMobile && start.id !== event.pointerId)) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!readingMode && isMobile && start.axis !== 'x' && dy > 56 && dy > Math.abs(dx) * 1.25) {
      event.preventDefault();
      event.stopPropagation();
      onExit();
    } else if ((!isMobile || start.axis !== 'y') && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      if (isMobile) { event.preventDefault(); event.stopPropagation(); }
      onMove(dx < 0 ? 1 : -1);
    }
  };
  // Native pan-y cancels the pointer before a downward swipe can complete.
  // Only the fitted page owns both axes; zoomed content keeps native scrolling.
  const touchAction = isMobile && active && zoom <= 1.01 ? readingMode ? 'pan-y' : 'none' : 'pan-x pan-y';
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
