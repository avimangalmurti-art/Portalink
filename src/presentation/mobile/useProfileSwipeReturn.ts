import { useMobileScreenActive } from './MobileBackNavigation';
import { preparePullSurface, revealPullUnderlay, commitPullDismiss, cancelPullDismiss, finishPullDismiss } from './pullDismissMotion';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** A downward pull at the profile's top returns without borrowing browser overscroll. */
export function useProfileSwipeReturn(ref: RefObject<HTMLElement>, enabled: boolean, onReturn: () => void) {
  const active = useMobileScreenActive();
  const canReturn = enabled && active;
  const latest = useRef(onReturn); latest.current = onReturn;
  useEffect(() => {
    const root = ref.current;
    if (!canReturn || !root) return;
    let start: { x: number; y: number } | null = null;
    let distance = 0;
    let dismissing = false;
    let stage: ReturnType<typeof preparePullSurface> | null = null;
    let animation: Animation | undefined;
    const restore = () => { stage?.restore(); stage = null; finishPullDismiss(); root.removeAttribute('data-profile-pulling'); root.style.removeProperty('--profile-pull-offset'); };
    const begin = (event: TouchEvent) => {
      if (dismissing || (window.history.state?.idx ?? 0) === 0 && !document.querySelector('[data-mobile-screen-underlay]')) return;
      start = null; distance = 0; restore();
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
      if (event.touches.length !== 1) { start = null; restore(); return; }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (Math.abs(dx) > 32 || dy < -8) { start = null; restore(); return; }
      if (dy > 8 && dy > Math.abs(dx)) {
        if (event.cancelable) event.preventDefault();
        distance = dy;
        if (!stage) { stage = preparePullSurface(root); revealPullUnderlay(); }
        stage.surface.setAttribute('data-profile-pulling', '');
        stage.surface.style.setProperty('--profile-pull-offset', `${Math.min(dy, window.innerHeight * .65)}px`);
      }
    };
    const end = (event: TouchEvent) => { if (distance > 8 && event.cancelable) event.preventDefault(); if (dismissing) return; const returnNow = Boolean(start) && distance >= 72; start = null; if (returnNow && stage) { dismissing = true; animation = commitPullDismiss(stage.surface, Math.min(distance, window.innerHeight * .65), () => latest.current()); } else if (stage) { dismissing = true; animation = cancelPullDismiss(stage.surface, Math.min(distance, window.innerHeight * .65), () => { restore(); dismissing = false; }); } else restore(); distance = 0; };
    const cancel = () => { if (dismissing) return; start = null; distance = 0; restore(); };
    root.addEventListener('touchstart', begin, { passive: true });
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('touchend', end, { passive: false });
    root.addEventListener('touchcancel', cancel);
    return () => {
      animation?.cancel();
      restore();
      root.removeEventListener('touchstart', begin); root.removeEventListener('touchmove', move);
      root.removeEventListener('touchend', end); root.removeEventListener('touchcancel', cancel);
    };
  }, [ref, canReturn]);
}
