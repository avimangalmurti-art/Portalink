import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { inlineDragOffset, inlineGestureAxis, inlineSwipePage, type InlineGestureSample } from './inlineProjectPageModel';

type Gesture = InlineGestureSample & { id: number; axis: 'pending' | 'x' | 'y'; width: number; host: HTMLElement };
const controls = 'a,button,input,textarea,select,video,audio,iframe,[contenteditable="true"],[role="slider"],[data-inline-media-interactive] canvas';

/** Drag detection also protects single slides from accidental opens.
 * Only enabled horizontal paging captures a gesture; native pan-y/edges stay intact. */
export function useInlineProjectSwipe(enabled: boolean, selected: number, total: number, onSelect: (index: number) => void) {
  const gesture = useRef<Gesture | null>(null);
  const suppressed = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ enabled, selected, total, onSelect });
  latest.current = { enabled, selected, total, onSelect };
  const settle = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    // A density change or interrupted gesture must not leave this host owning
    // the pointer. Clear our state first because release can emit capture loss.
    if (current?.host.hasPointerCapture(current.id)) current.host.releasePointerCapture(current.id);
    setDragging(false); setOffset(0);
  }, []);
  useEffect(() => { if (!enabled) settle(); }, [enabled, settle]);
  return { offset, dragging, handlers: {
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      const interrupted = gesture.current !== null;
      settle();
      suppressed.current = false;
      if (!event.isPrimary) { suppressed.current = interrupted; return; }
      if (event.button !== 0) return;
      const control = (event.target as Element).closest(controls);
      if (control && !control.hasAttribute('data-inline-project-open')) return;
      if (event.clientX < 24 || window.innerWidth - event.clientX < 24) return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, axis: 'pending', width: event.currentTarget.clientWidth, host: event.currentTarget };
    },
    onPointerMoveCapture(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 8) suppressed.current = true;
      if (!latest.current.enabled) return;
      if (start.axis === 'pending') {
        start.axis = inlineGestureAxis(dx, dy);
        if (start.axis === 'x') {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }
      }
      if (start.axis !== 'x') return;
      event.preventDefault();
      setOffset(inlineDragOffset(dx, latest.current.selected, latest.current.total, start.width));
    },
    onPointerUpCapture(event: PointerEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      settle();
      if (start.axis !== 'x' || !latest.current.enabled) return;
      const next = inlineSwipePage(start, { x: event.clientX, y: event.clientY, time: event.timeStamp }, latest.current.selected, latest.current.total);
      if (next !== latest.current.selected) latest.current.onSelect(next);
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (gesture.current?.id === event.pointerId) settle();
    },
    onLostPointerCapture(event: PointerEvent<HTMLElement>) {
      // Touch implicitly captures the initially touched image/link. Moving
      // capture to this host emits a bubbling loss from that descendant; only
      // losing the host's own capture cancels the horizontal gesture.
      if (event.target === event.currentTarget && gesture.current?.id === event.pointerId) settle();
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (event.detail === 0) { suppressed.current = false; return; }
      if (!suppressed.current) return;
      suppressed.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  } };
}
