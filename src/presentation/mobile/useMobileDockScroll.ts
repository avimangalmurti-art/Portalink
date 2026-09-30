import { useEffect, type RefObject } from 'react';

// Brief reading pauses should not repeatedly flash navigation over the work.
const IDLE_DELAY = 700;
const excluded = '.mobile-navigation-layer, [data-mobile-project-view], [role="dialog"], [role="menu"], [inert], .screen-exit, [aria-hidden="true"], input, textarea, select, [contenteditable="true"]';

/** Browsing hides only the dock; project reading owns its separate tap-to-reveal state. */
export function useMobileDockScroll(enabled: boolean, pathname: string, dockRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dock = dockRef.current;
    const frame = dock?.closest('[data-presentation="mobile"]');
    if (!enabled || !dock || !frame) return;

    let timer: number | undefined;
    let intent = false;
    let hidden = false;
    let previousInert = false;
    let gesture: { id: number; x: number; y: number } | null = null;
    const overlayOpen = () => Boolean(document.querySelector('[aria-modal="true"], [role="menu"]'));
    const eligible = (target: EventTarget | null): target is HTMLElement => target instanceof HTMLElement && frame.contains(target) && !target.closest(excluded);
    const restore = () => {
      window.clearTimeout(timer);
      timer = undefined;
      intent = false;
      if (!hidden) return;
      hidden = false;
      dock.inert = previousInert;
      dock.removeAttribute('data-scrolling');
      dock.removeAttribute('aria-hidden');
    };
    const scroll = (event: Event) => {
      const documentScroll = event.target === document;
      const target = documentScroll ? document.scrollingElement as HTMLElement | null : event.target;
      if (!target || !intent || (!documentScroll && !eligible(target)) || overlayOpen() || dock.querySelector(':focus-visible') ||
        document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') ||
        ((target as HTMLElement).scrollHeight <= (target as HTMLElement).clientHeight + 1 && (target as HTMLElement).scrollWidth <= (target as HTMLElement).clientWidth + 1)) return;
      if (!hidden) { previousInert = dock.inert; hidden = true; dock.inert = true; }
      dock.setAttribute('data-scrolling', '');
      dock.setAttribute('aria-hidden', 'true');
      window.clearTimeout(timer);
      timer = window.setTimeout(restore, IDLE_DELAY);
    };
    const wheel = (event: WheelEvent) => {
      intent = !event.ctrlKey && !event.metaKey && Boolean(event.deltaX || event.deltaY) && eligible(event.target) && !overlayOpen();
    };
    const down = (event: PointerEvent) => {
      intent = false;
      gesture = event.isPrimary && event.button === 0 && eligible(event.target) && !overlayOpen()
        ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    };
    const move = (event: PointerEvent) => {
      if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) intent = true;
    };
    const cancel = () => {
      // Native phone panning takes over after pointer cancellation.
      if (gesture) intent = true;
      gesture = null;
    };
    const up = (event: PointerEvent) => {
      const start = gesture;
      gesture = null;
      if (hidden && start?.id === event.pointerId && !intent &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 8) restore();
    };
    const key = () => restore();
    const focus = () => restore();
    document.addEventListener('scroll', scroll, { capture: true, passive: true });
    document.addEventListener('wheel', wheel, { capture: true, passive: true });
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('focusin', focus, true);
    return () => {
      restore();
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('wheel', wheel, true);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('focusin', focus, true);
    };
  }, [enabled, pathname, dockRef]);
}
