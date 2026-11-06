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
    let start: { x: number; y: number; offset: number } | null = null;
    let distance = 0;
    let settling = false, returned = false, revision = 0, origin = 0;
    let stage: ReturnType<typeof preparePullSurface> | null = null;
    let animation: Animation | undefined;
    const stopAnimation = () => { ++revision; const running = animation; animation = undefined; running?.cancel(); settling = false; };
    const restore = () => { stopAnimation(); stage?.restore(); stage = null; finishPullDismiss(); root.removeAttribute('data-profile-pulling'); root.style.removeProperty('--profile-pull-offset'); };
    const begin = (event: TouchEvent) => {
      if (returned || (window.history.state?.idx ?? 0) === 0 && !document.querySelector('[data-mobile-screen-underlay]')) return;
      if (event.touches.length !== 1 || document.querySelector('[aria-modal="true"]')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-inline-project-pages]') || (target.closest('button,a,input,textarea,select,[contenteditable="true"]') && !target.closest('.profile-return-handle'))) return;
      const inHeader = Boolean(target.closest('.profile-header-region')); 
      for (let node: Element | null = target; node; node = node.parentElement) {
        if (!inHeader && node.scrollTop > 1) return;
      }
      if (!inHeader && window.scrollY > 1) return;
      let offset = 0;
      if (stage && settling) {
        // Freeze the displayed frame before canceling its animation, then let
        // this touch take over without snapping to the previous drag position.
        offset = Math.max(0, stage.surface.getBoundingClientRect().top - origin);
        stage.surface.style.setProperty('--profile-pull-offset', `${offset}px`);
        stopAnimation(); revealPullUnderlay();
      } else { start = null; distance = 0; restore(); }
      distance = offset;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY, offset };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) { start = null; distance = 0; restore(); return; }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (Math.abs(dx) > 32 || start.offset === 0 && dy < -8) { start = null; distance = 0; restore(); return; }
      if (start.offset > 0 || dy > 8 && dy > Math.abs(dx)) {
        if (event.cancelable) event.preventDefault();
        distance = Math.max(0, Math.min(start.offset + dy, Math.max(start.offset, window.innerHeight * .65)));
        if (!stage) { stage = preparePullSurface(root); origin = stage.surface.getBoundingClientRect().top; revealPullUnderlay(); }
        stage.surface.setAttribute('data-profile-pulling', '');
        stage.surface.style.setProperty('--profile-pull-offset', `${distance}px`);
      }
    };
    const end = (event: TouchEvent) => {
      if (distance > 8 && event.cancelable) event.preventDefault();
      if (settling || returned) return;
      const returnNow = Boolean(start) && distance >= 72;
      start = null;
      if (stage) {
        settling = true;
        const current = ++revision, isCurrent = () => current === revision;
        animation = returnNow
          ? commitPullDismiss(stage.surface, distance, () => { if (returned) return; returned = true; latest.current(); }, isCurrent)
          : cancelPullDismiss(stage.surface, distance, restore, isCurrent);
      } else restore();
      distance = 0;
    };
    const cancel = () => { if (returned) return; start = null; distance = 0; restore(); };
    root.addEventListener('touchstart', begin, { passive: true });
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('touchend', end, { passive: false });
    root.addEventListener('touchcancel', cancel);
    return () => {
      restore();
      root.removeEventListener('touchstart', begin); root.removeEventListener('touchmove', move);
      root.removeEventListener('touchend', end); root.removeEventListener('touchcancel', cancel);
    };
  }, [ref, canReturn]);
}
