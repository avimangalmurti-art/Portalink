import { useEffect, useRef, useState, type RefObject } from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const WHEEL_ZOOM_STEP = 0.12;
const WHEEL_THRESHOLD = 36;
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
  onExit
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  active: boolean;
  onExit: () => void;
}) {
  const [zoom, setZoomState] = useState(MIN_ZOOM);
  const zoomRef = useRef(MIN_ZOOM);
  const wheelDeltaRef = useRef(0);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const onExitRef = useRef(onExit);

  onExitRef.current = onExit;

  const setZoom = (next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    zoomRef.current = clamped;
    setZoomState(clamped);
  };

  useEffect(() => {
    zoomRef.current = MIN_ZOOM;
    setZoomState(MIN_ZOOM);
    wheelDeltaRef.current = 0;
    pinchStartRef.current = null;
  }, [active]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!active || !surface) {
      return undefined;
    }

    const exit = () => {
      zoomRef.current = MIN_ZOOM;
      setZoomState(MIN_ZOOM);
      wheelDeltaRef.current = 0;
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
        ? 18
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? 100
          : 1;
      wheelDeltaRef.current += event.deltaY * deltaScale;
      if (Math.abs(wheelDeltaRef.current) < WHEEL_THRESHOLD) return;

      const zoomDirection = wheelDeltaRef.current < 0 ? 1 : -1;
      wheelDeltaRef.current = 0;
      if (zoomDirection < 0 && zoomRef.current <= MIN_ZOOM) {
        exit();
        return;
      }
      setZoom(zoomRef.current + zoomDirection * WHEEL_ZOOM_STEP);
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
  }, [active, surfaceRef]);

  return zoom;
}
