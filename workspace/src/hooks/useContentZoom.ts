import { useCallback, useEffect, useRef, useState } from 'react';
import { pinchDistance, pinchSteps } from '../utils/pinchGesture';

/**
 * How large the viewer wants the work drawn, as a width multiplier. One step
 * either side is a noticeable change without being a jump, and the ladder is
 * bounded so the work can never be zoomed into uselessness or shrunk to
 * thumbnails.
 */
const STEPS = [0.4, 0.55, 0.75, 1, 1.4, 2, 2.8] as const;
const REST_INDEX = STEPS.indexOf(1);

/**
 * Viewer-side zoom over a content area.
 *
 * This is a READING preference, not a property of the work: it changes how much
 * width each piece is given, never the piece's own proportions, its order, or
 * anything the creator set. Whatever page or column count a creator chose stays
 * exactly as chosen — this scales it, so the two are independent.
 *
 * Bound to ⌘/Ctrl + wheel and to trackpad pinch (which browsers report as a
 * wheel event with `ctrlKey`), deliberately NOT to a bare wheel: a bare wheel
 * has to keep scrolling, or the viewer loses the ability to move through the
 * work at all. It only acts while the pointer is genuinely inside the area,
 * because the listener lives on that element rather than on the window.
 *
 * The listener is registered non-passively so the browser's own page zoom can
 * be prevented; React's `onWheel` is passive and cannot.
 */
export function useContentZoom<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);
  const [index, setIndex] = useState(REST_INDEX);
  const indexRef = useRef(index);
  indexRef.current = index;
  /** Shown briefly after a change, so the viewer can see where they are. */
  const [isAdjusting, setIsAdjusting] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsAdjusting(false);
      return;
    }
    const element = ref.current;
    if (!element) {
      return;
    }
    let pinch: { distance: number; index: number } | null = null;
    const showAdjustment = () => {
      setIsAdjusting(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setIsAdjusting(false), 900);
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        // An ordinary wheel keeps scrolling the work.
        return;
      }
      event.preventDefault();
      setIndex((current) => {
        const next = Math.min(STEPS.length - 1, Math.max(0, current + (event.deltaY < 0 ? 1 : -1)));
        return next;
      });
      showAdjustment();
    };
    const onTouchStart = (event: TouchEvent) => {
      const distance = pinchDistance(event.touches);
      pinch = distance === null ? null : { distance, index: indexRef.current };
    };
    const onTouchMove = (event: TouchEvent) => {
      const distance = pinchDistance(event.touches);
      if (!pinch || distance === null) return;
      if (event.cancelable) event.preventDefault();
      const next = Math.min(STEPS.length - 1, Math.max(0, pinch.index + pinchSteps(distance, pinch.distance)));
      if (next === indexRef.current) return;
      indexRef.current = next;
      setIndex(next);
      showAdjustment();
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
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled]);

  const zoom = STEPS[index];
  /**
   * Applies the preference to a base column count. Wider pieces mean fewer
   * across, so the multiplier divides — and the result is clamped to at least
   * one column, because zero columns would render nothing.
   */
  const scaleColumns = useCallback((base: number) => Math.max(1, Math.round(base / zoom)), [zoom]);
  const reset = useCallback(() => setIndex(REST_INDEX), []);

  return {
    ref,
    zoom,
    scaleColumns,
    /** True while the viewer is not at the default size. */
    isZoomed: index !== REST_INDEX,
    isAdjusting,
    reset,
    /** For an accessible announcement, e.g. "140%". */
    label: `${Math.round(zoom * 100)}%`
  };
}
