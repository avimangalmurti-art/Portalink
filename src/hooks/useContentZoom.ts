import { useCallback, useEffect, useRef, useState } from 'react';
import { pinchDistance, pinchSteps } from '../utils/pinchGesture';
import { normalizeProjectGridColumns as clampColumns } from '../utils/projectGridDensity';
import { usePresentation, type Presentation } from '../presentation/usePresentation';

/** Ordinary wheels and one-finger swipes scroll; deliberate zoom chooses density.
 * An optional Home projection bounds gestures; rendering a fallback never commits it. */
export function useContentZoom<T extends HTMLElement>(baseColumns: number, enabled = true, resetKey?: number, onColumnsChange?: (columns: number) => void, projectColumns?: (columns:number)=>number) {
  const presentation = usePresentation();
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  const ref = useRef<T | null>(null);
  const [selection, setSelection] = useState<{ columns: number; key?: number; presentation: Presentation } | null>(null);
  const baseline = clampColumns(projectColumns?.(clampColumns(baseColumns)) ?? baseColumns);
  // Disabling gestures for reorder must not discard the current layout.
  // Only an explicit saved-density change supersedes the local choice.
  const selected = selection?.presentation === presentation && selection.key === resetKey ? selection.columns : undefined;
  const columns = clampColumns(projectColumns?.(selected ?? baseline) ?? (selected ?? baseline));
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const onColumnsChangeRef = useRef(onColumnsChange);
  onColumnsChangeRef.current = onColumnsChange;
  const resetKeyRef = useRef(resetKey);
  resetKeyRef.current = resetKey;
  const projectionRef = useRef(projectColumns);
  projectionRef.current = projectColumns;
  const [isAdjusting, setIsAdjusting] = useState(false);
  const explicitChoiceVersion = useRef(0);
  useEffect(() => { setSelection(null); setIsAdjusting(false); }, [resetKey, presentation]);

  useEffect(() => {
    if (!enabled) { setIsAdjusting(false); return; }
    const element = ref.current;
    if (!element) return;
    let pinch: { distance: number; columns: number } | null = null;
    let timeout: number | undefined;
    let commitTimeout: number | undefined;
    let pendingColumns: number | undefined;
    let pendingVersion = explicitChoiceVersion.current;
    const commit = () => {
      window.clearTimeout(commitTimeout);
      if (pendingColumns === undefined) return;
      const next = pendingColumns;
      pendingColumns = undefined;
      // A breakpoint change must not send the old gesture to the new view's callback.
      if (presentationRef.current === presentation && resetKeyRef.current === resetKey && pendingVersion === explicitChoiceVersion.current) onColumnsChangeRef.current?.(next);
    };
    const choose = (value: number) => {
      if (presentationRef.current !== presentation) return;
      const next = clampColumns(projectionRef.current?.(clampColumns(value)) ?? value);
      if (next === columnsRef.current) return;
      columnsRef.current = next;
      pendingColumns = next;
      pendingVersion = explicitChoiceVersion.current;
      setSelection({ columns: next, key: resetKey, presentation });
      setIsAdjusting(true);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setIsAdjusting(false), 900);
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (event.deltaY !== 0) {
        choose(columnsRef.current + (event.deltaY < 0 ? -1 : 1));
        window.clearTimeout(commitTimeout);
        commitTimeout = window.setTimeout(commit, 220);
      }
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
    const endTouch = () => { pinch = null; commit(); };
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
      // A route change or entry into reorder must not lose the last choice.
      commit();
    };
  }, [enabled, resetKey, presentation]);

  const reset = useCallback(() => setSelection(null), []);
  const chooseColumns = useCallback((value: number) => {
    if (!enabled || presentationRef.current !== presentation) return;
    const next = clampColumns(projectionRef.current?.(clampColumns(value)) ?? value);
    explicitChoiceVersion.current += 1;
    columnsRef.current = next;
    setSelection({ columns: next, key: resetKeyRef.current, presentation });
    setIsAdjusting(false);
    onColumnsChangeRef.current?.(next);
  }, [enabled, presentation]);
  return { ref, columns, isZoomed: selected !== undefined, isAdjusting: selected !== undefined && isAdjusting, reset, chooseColumns, label: columns + ' per row' };
}
