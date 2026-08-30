import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { readViewerMemory, updateViewerMemory } from './viewerMemory';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const WHEEL_ZOOM_SENSITIVITY = 0.0022;
const WHEEL_EXIT_PULL = 56;
const PINCH_EXIT_THRESHOLD = 0.9;

/**
 * Natural, control-free zoom for an isolated page.
 *
 * A mouse wheel and a trackpad gesture both arrive as wheel input, while a
 * touchscreen pinch arrives as a two-touch gesture. One-finger swipes are never
 * cancelled, so a zoomed page can still be panned normally. Pulling back past
 * the fitted size returns to the multi-page layout.
 */
export function useSinglePageZoom({
  surfaceRef,
  active,
  onExit,
  memoryKey
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  active: boolean;
  onExit: () => void;
  memoryKey?: string;
}) {
  const initialZoom = memoryKey ? readViewerMemory(memoryKey).zoom ?? MIN_ZOOM : MIN_ZOOM;
  const [zoom, setZoomState] = useState(() => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, initialZoom)));
  const zoomRef = useRef(MIN_ZOOM);
  const exitPullRef = useRef(0);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const onExitRef = useRef(onExit);

  onExitRef.current = onExit;

  const setZoom = useCallback((next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    zoomRef.current = clamped;
    setZoomState(clamped);
    if (memoryKey) updateViewerMemory(memoryKey, { zoom: clamped });
  }, [memoryKey]);

  useEffect(() => {
    const remembered = active && memoryKey ? readViewerMemory(memoryKey).zoom ?? MIN_ZOOM : MIN_ZOOM;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, remembered));
    zoomRef.current = next;
    setZoomState(next);
    exitPullRef.current = 0;
    pinchStartRef.current = null;
  }, [active, memoryKey]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!active || !surface) {
      return undefined;
    }

    const exit = () => {
      zoomRef.current = MIN_ZOOM;
      setZoomState(MIN_ZOOM);
      if (memoryKey) updateViewerMemory(memoryKey, { zoom: MIN_ZOOM });
      exitPullRef.current = 0;
      pinchStartRef.current = null;
      onExitRef.current();
    };
    const distanceBetween = (first: Touch, second: Touch) => Math.hypot(
      second.clientX - first.clientX,
      second.clientY - first.clientY
    );
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      event.stopPropagation();

      const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? 90
          : 1;
      const delta = Math.max(-120, Math.min(120, event.deltaY * deltaScale));

      // Once the page is fully fitted, continuing the same zoom-out gesture
      // gently releases back to the overview. A small accumulated pull prevents
      // trackpad noise from dismissing the focused page accidentally.
      if (delta > 0 && zoomRef.current <= MIN_ZOOM + 0.005) {
        exitPullRef.current += delta;
        if (exitPullRef.current >= WHEEL_EXIT_PULL) {
          exit();
        }
        return;
      }

      exitPullRef.current = 0;
      const requestedZoom = zoomRef.current * Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
      setZoom(requestedZoom <= MIN_ZOOM + 0.012 ? MIN_ZOOM : requestedZoom);
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      pinchStartRef.current = {
        distance: distanceBetween(event.touches[0], event.touches[1]),
        zoom: zoomRef.current
      };
    };
    const handleTouchMove = (event: TouchEvent) => {
      const start = pinchStartRef.current;
      if (!start || event.touches.length !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      const ratio = distanceBetween(event.touches[0], event.touches[1]) / start.distance;
      const requestedZoom = start.zoom * ratio;
      if (start.zoom <= MIN_ZOOM && requestedZoom < PINCH_EXIT_THRESHOLD) {
        exit();
        return;
      }
      setZoom(requestedZoom);
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchStartRef.current = null;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exit();
    };

    surface.addEventListener('wheel', handleWheel, { passive: false });
    surface.addEventListener('touchstart', handleTouchStart, { passive: true });
    surface.addEventListener('touchmove', handleTouchMove, { passive: false });
    surface.addEventListener('touchend', handleTouchEnd, { passive: true });
    surface.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      surface.removeEventListener('wheel', handleWheel);
      surface.removeEventListener('touchstart', handleTouchStart);
      surface.removeEventListener('touchmove', handleTouchMove);
      surface.removeEventListener('touchend', handleTouchEnd);
      surface.removeEventListener('touchcancel', handleTouchEnd);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, memoryKey, setZoom, surfaceRef]);

  return zoom;
}
