import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { navigationSwipe } from '../../presentation/mobile/useNavigationSwipe';

type Sample = { x: number; y: number; time: number };
type Gesture = Sample & { id: number; axis: 'pending' | 'x' | 'y'; origin: number; width: number };
export type StudioSwipeOutcome = 'left' | 'right' | 'primary' | 'closed';

/** Reuse the navigation gesture's deliberate-drag / flick and vertical-scroll rules. */
export function studioSwipeOutcome(start: Sample, end: Sample, width: number, leftCount: number, hasPrimary: boolean, origin = 0): StudioSwipeOutcome {
  const direction = navigationSwipe(start, end);
  if (!direction) return 'closed';
  const dx = end.x - start.x;
  if (hasPrimary && Math.abs(dx) >= Math.max(144, width * 0.67)) return 'primary';
  const position = origin + dx;
  if (direction === 'left' && position < -24 && leftCount > 0) return 'left';
  if (direction === 'right' && position > 24 && hasPrimary) return 'right';
  return 'closed';
}

const actionWidth = 72;
const excludedControls = '[data-studio-row-control], input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="menu"]';

/** Row-only gestures: never attach to the page, category scroller or navigation dock. */
export function useStudioRowGesture({ enabled, leftCount, hasPrimary, onPrimary, onMenu }: {
  enabled: boolean;
  leftCount: number;
  hasPrimary: boolean;
  onPrimary: () => void;
  onMenu: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const menuOpened = useRef(false);
  const latest = useRef({ enabled, leftCount, hasPrimary, onPrimary, onMenu });
  latest.current = { enabled, leftCount, hasPrimary, onPrimary, onMenu };

  const clearPress = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const close = useCallback(() => { clearPress(); gesture.current = null; setDragging(false); setOffset(0); }, [clearPress]);
  useEffect(() => {
    if (!enabled) close();
    return () => clearPress();
  }, [enabled, close, clearPress]);

  const handlers = {
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      clearPress();
      const interrupted = gesture.current !== null;
      gesture.current = null;
      setDragging(false);
      suppressClick.current = false;
      menuOpened.current = false;
      // A second finger abandons the partially moved row instead of leaving it
      // stuck between its closed and revealed positions.
      if (!event.isPrimary) { close(); suppressClick.current = interrupted; return; }
      if (!latest.current.enabled || event.pointerType === 'mouse') return;
      const target = event.target as Element;
      if (!event.currentTarget.contains(target) || target.closest(excludedControls)) return;
      // The browser owns its Back/Forward edge gestures.
      if (event.clientX < 20 || window.innerWidth - event.clientX < 20) return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, axis: 'pending', origin: offset, width: event.currentTarget.getBoundingClientRect().width };
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!gesture.current || gesture.current.axis !== 'pending' || !latest.current.enabled) return;
        gesture.current = null;
        suppressClick.current = true;
        menuOpened.current = true;
        setOffset(0);
        latest.current.onMenu();
      }, 500);
    },
    onPointerMoveCapture(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId || !latest.current.enabled) return;
      const dx = event.clientX - start.x, dy = Math.abs(event.clientY - start.y);
      if (Math.max(Math.abs(dx), dy) > 8) clearPress();
      if (start.axis === 'pending' && Math.max(Math.abs(dx), dy) > 8) {
        start.axis = Math.abs(dx) > dy * 1.5 ? 'x' : 'y';
        if (start.axis === 'x') {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }
      }
      if (start.axis !== 'x') return;
      suppressClick.current = true;
      const maxLeft = latest.current.leftCount > 0 ? start.width * 0.85 : 0;
      const maxRight = latest.current.hasPrimary ? start.width * 0.85 : 0;
      setOffset(Math.max(-maxLeft, Math.min(maxRight, start.origin + dx)));
    },
    onPointerUpCapture(event: PointerEvent<HTMLElement>) {
      clearPress();
      const start = gesture.current;
      gesture.current = null;
      setDragging(false);
      if (!start || start.id !== event.pointerId || !latest.current.enabled || start.axis === 'y') return;
      const outcome = studioSwipeOutcome(start, { x: event.clientX, y: event.clientY, time: event.timeStamp }, start.width, latest.current.leftCount, latest.current.hasPrimary, start.origin);
      // Tapping the shifted content dismisses its actions. Consume that tap
      // before the closed row rerenders and could interpret it as Open.
      if (outcome !== 'closed' || start.origin !== 0) suppressClick.current = true;
      if (outcome === 'primary') {
        setOffset(0);
        latest.current.onPrimary();
      } else setOffset(outcome === 'left' ? -Math.min(3, latest.current.leftCount) * actionWidth : outcome === 'right' ? actionWidth : 0);
    },
    onPointerCancel() { close(); },
    onLostPointerCapture() { if (gesture.current) close(); },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      // Keyboard activation never inherits suppression from a prior touch gesture.
      if (event.detail === 0) { suppressClick.current = false; return; }
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onContextMenu(event: MouseEvent<HTMLElement>) {
      if (!latest.current.enabled || (event.target as Element).closest(excludedControls)) return;
      event.preventDefault();
      clearPress();
      gesture.current = null;
      setDragging(false);
      setOffset(0);
      suppressClick.current = true;
      if (!menuOpened.current) latest.current.onMenu();
      menuOpened.current = true;
    },
  };
  return { offset: enabled ? offset : 0, dragging, close, handlers };
}
