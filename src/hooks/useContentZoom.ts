import { useCallback, useEffect, useRef, useState } from 'react';
import { pinchDistance, pinchSteps } from '../utils/pinchGesture';

const MIN_COLUMNS = 2;
const MAX_COLUMNS = 13;
const clampColumns = (value: number) => Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.round(value)));

/** Viewer-only project density. Ordinary wheels and one-finger swipes still scroll. */
export function useContentZoom<T extends HTMLElement>(baseColumns: number, enabled = true, resetKey?: number) {
  const ref = useRef<T | null>(null);
  const [selection, setSelection] = useState<{ columns: number; key?: number } | null>(null);
  const baseline = clampColumns(baseColumns);
  // Responsive resize preserves an explicit reading choice. Changing the
  // profile's density control supersedes it; reordering uses readable cards.
  const selected = enabled && selection?.key === resetKey ? selection?.columns : undefined;
  const columns = selected ?? baseline;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const [isAdjusting, setIsAdjusting] = useState(false);
  useEffect(() => { setSelection(null); setIsAdjusting(false); }, [resetKey]);

  useEffect(() => {
    if (!enabled) { setIsAdjusting(false); return; }
    const element = ref.current;
    if (!element) return;
    let pinch: { distance: number; columns: number } | null = null;
    let timeout: number | undefined;
    const choose = (value: number) => {
      const next = clampColumns(value);
      columnsRef.current = next;
      setSelection({ columns: next, key: resetKey });
      setIsAdjusting(true);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setIsAdjusting(false), 900);
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (event.deltaY !== 0) choose(columnsRef.current + (event.deltaY < 0 ? -1 : 1));
    };
    const onTouchStart = (event: TouchEvent) => {
      const distance = pinchDistance(event.touches);
      pinch = distance === null ? null : { distance, columns: columnsRef.current };
    };
    const onTouchMove = (event: TouchEvent) => {
      const distance = pinchDistance(event.touches);
      if (!pinch || distance === null) return;
      if (event.cancelable) event.preventDefault();
      const next = clampColumns(pinch.columns - pinchSteps(distance, pinch.distance));
      if (next !== columnsRef.current) choose(next);
    };
    const endTouch = () => { pinch = null; };
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', endTouch, { passive: true });
    element.addEventListener('touchcancel', endTouch, { passive: true });
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', endTouch);
      element.removeEventListener('touchcancel', endTouch);
      window.clearTimeout(timeout);
    };
  }, [enabled, resetKey]);

  const reset = useCallback(() => setSelection(null), []);
  return { ref, columns, isZoomed: selected !== undefined, isAdjusting, reset, label: columns + ' per row' };
}
