import { useLayoutEffect, type RefObject } from 'react';

/** Send owns vertical gestures; only its recipient list may consume them. */
export function useRecipientScrollBoundary(enabled: boolean, ref: RefObject<HTMLDivElement>) {
  useLayoutEffect(() => {
    const screen = ref.current;
    if (!enabled || !screen) return;
    let touch: { x: number; y: number } | null = null;
    const canScroll = (target: EventTarget | null, delta: number) => {
      const list = target instanceof Element ? target.closest<HTMLElement>('[data-mobile-scroll-end]') : null;
      if (!list || !screen.contains(list)) return false;
      const range = Math.max(0, list.scrollHeight - list.clientHeight);
      return range > 0 && (delta < 0 ? list.scrollTop > 0 : list.scrollTop < range - 1);
    };
    const start = (event: TouchEvent) => {
      touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1) { touch = null; return; }
      const point = event.touches[0], previous = touch;
      touch = { x: point.clientX, y: point.clientY };
      if (!previous) return;
      const delta = previous.y - point.clientY;
      if (delta && Math.abs(delta) >= Math.abs(previous.x - point.clientX) && !canScroll(event.target, delta) && event.cancelable) event.preventDefault();
    };
    const end = () => { touch = null; };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (!canScroll(event.target, event.deltaY) && event.cancelable) event.preventDefault();
    };
    screen.addEventListener('touchstart', start, { passive: true });
    screen.addEventListener('touchmove', move, { passive: false });
    screen.addEventListener('touchend', end);
    screen.addEventListener('touchcancel', end);
    screen.addEventListener('wheel', wheel, { passive: false });
    return () => {
      screen.removeEventListener('touchstart', start);
      screen.removeEventListener('touchmove', move);
      screen.removeEventListener('touchend', end);
      screen.removeEventListener('touchcancel', end);
      screen.removeEventListener('wheel', wheel);
      touch = null;
    };
  }, [enabled, ref]);
}
