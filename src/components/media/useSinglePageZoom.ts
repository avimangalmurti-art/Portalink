import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { readViewerMemory, updateViewerMemory } from './viewerMemory';
import { usePresentation } from '../../presentation/usePresentation';
import { beginContentPinch, touchMidpoint, type ContentPinchMotion } from './contentPinchMotion';
import { installPageZoomEntry } from './pageZoomEntry';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const WHEEL_ZOOM_SENSITIVITY = 0.0022;
const WHEEL_EXIT_PULL = 56;
const PINCH_EXIT_THRESHOLD = 0.9;

type PendingZoomAnchor = {
  element: HTMLElement;
  viewportX: number;
  viewportY: number;
  contentX: number;
  contentY: number;
  scrollWidth: number;
  scrollHeight: number;
};

/**
 * Natural, control-free zoom for an isolated page.
 *
 * Trackpad pinches arrive as modified wheel input, while ordinary mouse-wheel
 * and two-finger vertical movement arrive without a modifier. Only the former
 * is captured for zoom. Plain vertical movement remains native scrolling; at
 * the fitted size it also releases the isolated page back to the page overview.
 * Touchscreen pinch remains a two-touch gesture.
 */
export function useSinglePageZoom({
  surfaceRef,
  active,
  onEnter,
  entryReady = true,
  onExit,
  memoryKey
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  active: boolean;
  onEnter?: (pageNumber: number, zoom: number) => void;
  entryReady?: boolean;
  onExit: () => void;
  memoryKey?: string;
}) {
  const isMobile = usePresentation() === 'mobile';
  const initialZoom = memoryKey ? readViewerMemory(memoryKey).zoom ?? MIN_ZOOM : MIN_ZOOM;
  const [zoom, setZoomState] = useState(() => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, initialZoom)));
  const zoomRef = useRef(MIN_ZOOM);
  const exitPullRef = useRef(0);
  const pinchStartRef = useRef<{ distance: number; zoom: number; next: number; motion: ContentPinchMotion | null } | null>(null);
  const settlingMotionRef = useRef<ContentPinchMotion | null>(null);
  const pendingAnchorRef = useRef<PendingZoomAnchor | null>(null);
  const onExitRef = useRef(onExit);
  const onEnterRef = useRef(onEnter);

  onExitRef.current = onExit;
  onEnterRef.current = onEnter;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (active || !entryReady || !surface || !onEnterRef.current) return;
    return installPageZoomEntry(surface, (page, nextZoom) => onEnterRef.current?.(page, nextZoom));
  }, [active, entryReady, memoryKey, surfaceRef]);

  const setZoom = useCallback((next: number, clientX?: number, clientY?: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const surface = surfaceRef.current;
    const scrollElement = surface?.querySelector<HTMLElement>('[data-focused-page-scroll]') ?? surface;
    if (scrollElement && Math.abs(clamped - zoomRef.current) > 0.0001) {
      const bounds = scrollElement.getBoundingClientRect();
      const viewportX = Math.min(scrollElement.clientWidth, Math.max(0, clientX === undefined ? scrollElement.clientWidth / 2 : clientX - bounds.left));
      const viewportY = Math.min(scrollElement.clientHeight, Math.max(0, clientY === undefined ? scrollElement.clientHeight / 2 : clientY - bounds.top));
      pendingAnchorRef.current = {
        element: scrollElement,
        viewportX,
        viewportY,
        contentX: scrollElement.scrollLeft + viewportX,
        contentY: scrollElement.scrollTop + viewportY,
        scrollWidth: Math.max(1, scrollElement.scrollWidth),
        scrollHeight: Math.max(1, scrollElement.scrollHeight)
      };
    }
    zoomRef.current = clamped;
    setZoomState(clamped);
    if (memoryKey) updateViewerMemory(memoryKey, { zoom: clamped });
  }, [memoryKey, surfaceRef]);

  useLayoutEffect(() => {
    if (settlingMotionRef.current) {
      settlingMotionRef.current.settle();
      settlingMotionRef.current = null;
      return;
    }
    const anchor = pendingAnchorRef.current;
    if (!anchor || !anchor.element.isConnected) return;
    pendingAnchorRef.current = null;
    const widthRatio = anchor.element.scrollWidth / anchor.scrollWidth;
    const heightRatio = anchor.element.scrollHeight / anchor.scrollHeight;
    anchor.element.scrollLeft = anchor.contentX * widthRatio - anchor.viewportX;
    anchor.element.scrollTop = anchor.contentY * heightRatio - anchor.viewportY;
  }, [zoom]);

  useEffect(() => {
    pinchStartRef.current?.motion?.cancel();
    settlingMotionRef.current?.cancel();
    settlingMotionRef.current = null;
    const remembered = active && memoryKey ? readViewerMemory(memoryKey).zoom ?? MIN_ZOOM : MIN_ZOOM;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, remembered));
    zoomRef.current = next;
    setZoomState(next);
    exitPullRef.current = 0;
    pinchStartRef.current = null;
    pendingAnchorRef.current = null;
  }, [active, memoryKey]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!active || !entryReady || !surface) {
      return undefined;
    }

    const exit = () => {
      pinchStartRef.current?.motion?.cancel();
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

      // Hardware detection is unreliable in browsers, but gesture intent is
      // not: trackpad pinch and explicit keyboard zoom carry a modifier. Never
      // consume an unmodified wheel event as zoom, so a mouse wheel and a
      // two-finger vertical swipe keep their native scrolling behavior.
      const isZoomGesture = event.ctrlKey || event.metaKey;
      if (!isZoomGesture) {
        exitPullRef.current = 0;
        if (zoomRef.current <= MIN_ZOOM + 0.005) exit();
        return;
      }

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
      setZoom(delta > 0 && requestedZoom <= MIN_ZOOM + 0.012 ? MIN_ZOOM : requestedZoom, event.clientX, event.clientY);
    };
    const handleTouchStart = (event: TouchEvent) => {
      pinchStartRef.current?.motion?.cancel();
      pinchStartRef.current = null;
      if (event.touches.length !== 2) return;
      const distance = distanceBetween(event.touches[0], event.touches[1]);
      if (distance <= 0) return;
      pinchStartRef.current = {
        distance, zoom: zoomRef.current, next: zoomRef.current,
        motion: isMobile ? beginContentPinch(surface, touchMidpoint(event.touches), true) : null
      };
    };
    const handleTouchMove = (event: TouchEvent) => {
      const start = pinchStartRef.current;
      if (!start || event.touches.length !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      const ratio = distanceBetween(event.touches[0], event.touches[1]) / start.distance;
      const requestedZoom = start.zoom * ratio;
      if (isMobile && start.motion) {
        start.next = requestedZoom;
        start.motion.update(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedZoom)) / start.zoom, touchMidpoint(event.touches));
        return;
      }
      if (start.zoom <= MIN_ZOOM && requestedZoom < PINCH_EXIT_THRESHOLD) {
        exit();
        return;
      }
      const clientX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const clientY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      setZoom(requestedZoom, clientX, clientY);
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.type !== 'touchcancel' && event.touches.length >= 2) return;
      const start = pinchStartRef.current;
      pinchStartRef.current = null;
      if (!start?.motion) return;
      if (event.type === 'touchcancel') { start.motion.settle(false); return; }
      if (start.zoom <= MIN_ZOOM && start.next < PINCH_EXIT_THRESHOLD) {
        start.motion.cancel(); exit(); return;
      }
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.next));
      if (Math.abs(next - zoomRef.current) < 0.0001) { start.motion.settle(); return; }
      settlingMotionRef.current = start.motion;
      setZoom(next);
      pendingAnchorRef.current = null; // The media's focal point owns this commit.
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
      pinchStartRef.current?.motion?.cancel();
      pinchStartRef.current = null;
      settlingMotionRef.current?.cancel();
      settlingMotionRef.current = null;
      surface.removeEventListener('wheel', handleWheel);
      surface.removeEventListener('touchstart', handleTouchStart);
      surface.removeEventListener('touchmove', handleTouchMove);
      surface.removeEventListener('touchend', handleTouchEnd);
      surface.removeEventListener('touchcancel', handleTouchEnd);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, entryReady, memoryKey, setZoom, surfaceRef, isMobile]);

  return zoom;
}
