import { useEffect, useRef } from 'react';
import { navigationSwipe } from './useNavigationSwipe';
import { markMobileBackNavigation } from './backNavigationTransition';

const reserved = 'input, textarea, select, [contenteditable="true"], [role="slider"], [role="menu"], [role="dialog"], [role="alertdialog"], video, audio, canvas, iframe, model-viewer, [draggable="true"], [data-inline-project-pages], .inline-project-pages, [data-premium-project-viewer], [data-studio-row], [data-mobile-focused-view], [data-focused-page-scroll], [inert], [aria-hidden="true"]';

type Gesture = { id: number; x: number; y: number; time: number; horizontal: boolean; root: HTMLElement; path: string };

/** A rightward content swipe uses the screen's Back action, including local steps. */
export function useMobileBackSwipe(enabled: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!enabled) return;
    let gesture: Gesture | null = null;
    let suppressClick = false;
    const path = () => window.location.href;
    const modalOpen = () => Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"], [role="menu"]'))
      .some(node => node.getClientRects().length > 0 && !node.closest('[inert], [aria-hidden="true"]'));
    const cancel = () => { gesture = null; };
    const start = (event: TouchEvent) => {
      cancel();
      suppressClick = false;
      if (event.touches.length !== 1 || modalOpen() || window.getSelection()?.isCollapsed === false) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest(reserved)) return;
      const root = target.closest<HTMLElement>('.codex-shell[data-presentation="mobile"]');
      if (!root) return;
      const touch = event.touches[0];
      // Native browser edge navigation keeps ownership of its own gesture.
      if (touch.clientX < 20 || window.innerWidth - touch.clientX < 20) return;
      for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
        if (node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return;
      }
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp, horizontal: false, root, path: path() };
    };
    const currentTouch = (event: TouchEvent) => event.touches.length === 1 && event.touches[0].identifier === gesture?.id ? event.touches[0] : undefined;
    const move = (event: TouchEvent) => {
      const touch = currentTouch(event), current = gesture;
      if (!touch || !current || !current.root.isConnected || current.path !== path()) { cancel(); return; }
      const dx = touch.clientX - current.x, dy = Math.abs(touch.clientY - current.y);
      if (!current.horizontal && Math.max(Math.abs(dx), dy) > 10) {
        if (dx <= dy * 1.5) { cancel(); return; }
        current.horizontal = true;
      }
      if (!current.horizontal) return;
      if (!event.cancelable) { cancel(); return; }
      event.preventDefault();
      suppressClick = true;
    };
    const end = (event: TouchEvent) => {
      const current = gesture;
      cancel();
      if (!current?.horizontal || event.touches.length || !current.root.isConnected || current.path !== path() || modalOpen()) return;
      const touch = Array.from(event.changedTouches).find(item => item.identifier === current.id);
      if (touch && navigationSwipe(current, { x: touch.clientX, y: touch.clientY, time: event.timeStamp }) === 'right') {
        markMobileBackNavigation();
        latest.current();
      }
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') { cancel(); suppressClick = false; }
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && suppressClick) { event.preventDefault(); event.stopPropagation(); }
    };
    const click = (event: MouseEvent) => {
      if (event.detail === 0) { suppressClick = false; return; }
      if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener('touchstart', start, { capture: true, passive: true });
    document.addEventListener('touchmove', move, { capture: true, passive: false });
    document.addEventListener('touchend', end, { capture: true, passive: true });
    document.addEventListener('touchcancel', cancel, true);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('pointerup', pointerUp, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('touchstart', start, true);
      document.removeEventListener('touchmove', move, true);
      document.removeEventListener('touchend', end, true);
      document.removeEventListener('touchcancel', cancel, true);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointerup', pointerUp, true);
      document.removeEventListener('click', click, true);
    };
  }, [enabled]);
}
