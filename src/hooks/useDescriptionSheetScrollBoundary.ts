import { useEffect, type RefObject } from 'react';

/** Keep native scrolling inside the description without locking the whole app. */
export function useDescriptionSheetScrollBoundary(ref: RefObject<HTMLDivElement>) {
  useEffect(() => {
    const overlay = ref.current;
    if (!overlay) return;
    let touchY: number | null = null;
    const canScroll = (target: EventTarget | null, delta: number) => {
      const scrollable = '.project-description-body, .project-description-editor, .project-description-discard, textarea';
      let element = target instanceof Element ? target.closest<HTMLElement>(scrollable) : null;
      while (element && overlay.contains(element)) {
        const available = Math.max(0, element.scrollHeight - element.clientHeight);
        if (available > 0 && (delta < 0 ? element.scrollTop > 0 : element.scrollTop < available - 1)) return true;
        element = element.parentElement?.closest<HTMLElement>(scrollable) ?? null;
      }
      return false;
    };
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches.length === 1 ? event.touches[0].clientY : null; };
    const onTouchMove = (event: TouchEvent) => {
      // Leave browser pinch accessibility intact; the grabber owns its drag.
      if (event.touches.length !== 1) { touchY = null; return; }
      const y = event.touches[0].clientY;
      const delta = touchY === null ? 0 : touchY - y;
      touchY = y;
      if (delta !== 0 && !canScroll(event.target, delta) && event.cancelable) event.preventDefault();
    };
    const onTouchEnd = () => { touchY = null; };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !canScroll(event.target, event.deltaY) && event.cancelable) event.preventDefault();
    };
    overlay.addEventListener('touchstart', onTouchStart, { passive: true });
    overlay.addEventListener('touchmove', onTouchMove, { passive: false });
    overlay.addEventListener('touchend', onTouchEnd);
    overlay.addEventListener('touchcancel', onTouchEnd);
    overlay.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      overlay.removeEventListener('touchstart', onTouchStart);
      overlay.removeEventListener('touchmove', onTouchMove);
      overlay.removeEventListener('touchend', onTouchEnd);
      overlay.removeEventListener('touchcancel', onTouchEnd);
      overlay.removeEventListener('wheel', onWheel);
    };
  }, [ref]);
}
