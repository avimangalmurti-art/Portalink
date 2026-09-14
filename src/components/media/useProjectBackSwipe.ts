import { useEffect, useRef, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import { usePresentation } from '../../presentation/usePresentation';
import { navigationSwipe } from '../../presentation/mobile/useNavigationSwipe';
import { markMobileBackNavigation } from '../../presentation/mobile/backNavigationTransition';

type Gesture = { id: number; x: number; y: number; time: number; horizontal: boolean };
const controls = 'button, a, input, textarea, select, [contenteditable="true"], audio, iframe, model-viewer, [role="slider"], [role="menu"], [role="dialog"], [role="alertdialog"], [data-media-interaction]';

/** Overview content swipes Back; focused pages, scrolling and media controls own their gestures. */
export function useProjectBackSwipe(surfaceRef: RefObject<HTMLElement>, { enabled, scope, onBack }: {
  enabled: boolean;
  scope: string;
  onBack?: () => void;
}) {
  const active = usePresentation() === 'mobile' && enabled && Boolean(onBack);
  const latest = useRef({ active, scope, onBack });
  latest.current = { active, scope, onBack };
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const surface = surfaceRef.current;
    gesture.current = null;
    suppressClick.current = false;
    if (!active || !surface) return;
    const available = () => latest.current.active && latest.current.scope === scope;
    const cancel = () => { gesture.current = null; };
    const start = (event: TouchEvent) => {
      cancel();
      suppressClick.current = false;
      if (!available() || event.touches.length !== 1) return;
      const target = event.target;
      if (!(target instanceof Element) || !surface.contains(target) || target.closest(controls)) return;
      const touch = event.touches[0];
      // Leave native back/forward edge gestures to the browser, without firing Back twice.
      if (touch.clientX < 20 || window.innerWidth - touch.clientX < 20) return;
      const video = target.closest('video');
      // Do not turn a drag on the native transport/seek controls into navigation.
      if (video?.controls && touch.clientY >= video.getBoundingClientRect().bottom - 64) return;
      for (let element: Element | null = target; element && element !== surface; element = element.parentElement) {
        if (element.scrollWidth > element.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(element).overflowX)) return;
      }
      gesture.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp, horizontal: false };
    };
    const move = (event: TouchEvent) => {
      const current = gesture.current;
      if (!available() || event.touches.length !== 1) { cancel(); return; }
      const touch = event.touches[0];
      if (!current || current.id !== touch.identifier) return;
      const dx = touch.clientX - current.x, dy = Math.abs(touch.clientY - current.y);
      if (!current.horizontal && Math.max(Math.abs(dx), dy) > 10) {
        if (dx <= dy * 1.5) { cancel(); return; }
        current.horizontal = true;
      }
      if (!current.horizontal) return;
      if (!event.cancelable) { cancel(); return; }
      // A non-passive touch listener reserves just this rightward drag. A blanket
      // touch-action on the stage would also restrict zoomed pages and scrollers.
      event.preventDefault();
      suppressClick.current = true;
    };
    const end = (event: TouchEvent) => {
      const current = gesture.current;
      cancel();
      if (!available() || !current?.horizontal || event.touches.length !== 0) return;
      const touch = Array.from(event.changedTouches).find(item => item.identifier === current.id);
      if (touch && navigationSwipe(current, { x: touch.clientX, y: touch.clientY, time: event.timeStamp }) === 'right') {
        // Marked before navigating so the arriving screen animates on its first paint.
        markMobileBackNavigation();
        latest.current.onBack?.();
      }
    };
    surface.addEventListener('touchstart', start, { capture: true, passive: true });
    surface.addEventListener('touchmove', move, { capture: true, passive: false });
    surface.addEventListener('touchend', end, { capture: true, passive: true });
    surface.addEventListener('touchcancel', cancel, { capture: true, passive: true });
    return () => {
      cancel();
      surface.removeEventListener('touchstart', start, true);
      surface.removeEventListener('touchmove', move, true);
      surface.removeEventListener('touchend', end, true);
      surface.removeEventListener('touchcancel', cancel, true);
    };
  }, [active, scope, surfaceRef]);

  return {
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      if (event.pointerType !== 'touch') {
        gesture.current = null;
        suppressClick.current = false;
      }
    },
    onPointerUpCapture(event: PointerEvent<HTMLElement>) {
      // Page tiles interpret touch pointer-up as double-tap. Consume the drag
      // before their handlers, even on browsers that deliver it before touchend.
      if (active && event.pointerType === 'touch' && suppressClick.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (event.detail === 0) { suppressClick.current = false; return; }
      if (!active || !suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
