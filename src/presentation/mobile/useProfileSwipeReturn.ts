import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** A downward pull at the profile's top returns without borrowing browser overscroll. */
export function useProfileSwipeReturn(ref: RefObject<HTMLElement>, enabled: boolean, onReturn: () => void) {
  const latest = useRef(onReturn); latest.current = onReturn;
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    let start: { x: number; y: number } | null = null;
    let distance = 0;
    const begin = (event: TouchEvent) => {
      start = null; distance = 0;
      if (event.touches.length !== 1 || document.querySelector('[aria-modal="true"]')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || (target.closest('button,a,input,textarea,select,[contenteditable="true"]') && !target.closest('.profile-return-handle'))) return;
      const inHeader = Boolean(target.closest('.profile-header-region')); 
      for (let node: Element | null = target; node; node = node.parentElement) {
        if (!inHeader && node.scrollTop > 1) return;
      }
      if (!inHeader && window.scrollY > 1) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) { start = null; return; }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (Math.abs(dx) > 32 || dy < -8) { start = null; return; }
      if (dy > 8 && dy > Math.abs(dx)) {
        if (event.cancelable) event.preventDefault();
        distance = dy;
      }
    };
    const end = () => { const returnNow = Boolean(start) && distance >= 72; start = null; distance = 0; if (returnNow) latest.current(); };
    const cancel = () => { start = null; distance = 0; };
    root.addEventListener('touchstart', begin, { passive: true });
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', cancel);
    return () => {
      root.removeEventListener('touchstart', begin); root.removeEventListener('touchmove', move);
      root.removeEventListener('touchend', end); root.removeEventListener('touchcancel', cancel);
    };
  }, [ref, enabled]);
}
