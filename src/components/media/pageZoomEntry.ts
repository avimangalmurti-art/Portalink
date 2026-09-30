import { beginContentPinch, touchMidpoint, type ContentPinchMotion } from './contentPinchMotion';

type Point = { x: number; y: number };
const clampZoom = (zoom: number) => Math.min(4, Math.max(1, zoom));
const distance = (touches: TouchList) => Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);

/** Enter from the page being enlarged, independently of an editable grid layout. */
export function installPageZoomEntry(surface: HTMLElement, onEnter: (pageNumber: number, zoom: number) => void) {
  let gesture: { page: number; origin: Point; distance: number; ratio: number; direction: 'pending' | 'enter' | 'density'; motion: ContentPinchMotion | null } | null = null;
  let entering = false;
  const isControl = (target: EventTarget | null) => Boolean((target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, [contenteditable="true"]'));
  const pageAt = (point: Point) => {
    const viewport = surface.getBoundingClientRect();
    let nearest: number | null = null, nearestDistance = Infinity;
    for (const page of surface.querySelectorAll<HTMLElement>('[data-project-page-number]')) {
      const box = page.getBoundingClientRect();
      const number = Number(page.dataset.projectPageNumber);
      if (!Number.isInteger(number) || number < 1 || box.width <= 0 || box.height <= 0 || box.bottom <= viewport.top || box.top >= viewport.bottom || box.right <= viewport.left || box.left >= viewport.right) continue;
      const delta = Math.hypot(Math.max(box.left - point.x, 0, point.x - box.right), Math.max(box.top - point.y, 0, point.y - box.bottom));
      if (delta < nearestDistance) { nearest = number; nearestDistance = delta; }
    }
    return nearest;
  };
  const consume = (event: Event) => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); };
  const handleWheel = (event: WheelEvent) => {
    if ((!event.ctrlKey && !event.metaKey) || event.deltaY >= 0 || isControl(event.target)) return;
    const page = pageAt({ x: event.clientX, y: event.clientY });
    if (page === null) return;
    consume(event);
    if (entering) return;
    entering = true;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 90 : 1;
    onEnter(page, clampZoom(Math.exp(Math.min(120, -event.deltaY * scale) * 0.0022)));
  };
  const handleStart = (event: TouchEvent) => {
    gesture?.motion?.cancel();
    gesture = null;
    if (event.touches.length !== 2 || isControl(event.target)) return;
    const startDistance = distance(event.touches);
    const page = pageAt(touchMidpoint(event.touches));
    if (startDistance <= 0 || page === null) return;
    gesture = { page, origin: touchMidpoint(event.touches), distance: startDistance, ratio: 1, direction: 'pending', motion: null };
  };
  const handleMove = (event: TouchEvent) => {
    if (!gesture || event.touches.length !== 2) return;
    gesture.ratio = distance(event.touches) / gesture.distance;
    if (gesture.direction === 'pending') {
      if (gesture.ratio >= 1.04) gesture.direction = 'enter';
      else if (gesture.ratio <= 0.96) gesture.direction = 'density';
    }
    // Lock intent for the gesture: an inward density pinch can reverse without
    // two different handlers taking ownership of the same content transforms.
    if (gesture.direction === 'density') return;
    consume(event);
    if (gesture.direction === 'enter') {
      gesture.motion ??= beginContentPinch(surface, gesture.origin);
      gesture.motion?.update(clampZoom(gesture.ratio), touchMidpoint(event.touches));
    }
  };
  const handleEnd = (event: TouchEvent) => {
    if (event.type !== 'touchcancel' && event.touches.length >= 2) return;
    const current = gesture;
    gesture = null;
    if (!current || current.direction !== 'enter') return;
    consume(event);
    current.motion?.cancel();
    if (event.type === 'touchcancel' || current.ratio < 1.04 || entering) return;
    // Keep touch targets mounted until release; replacing them mid-pinch drops
    // subsequent touch events in browsers. This same gesture supplies the zoom.
    entering = true;
    onEnter(current.page, clampZoom(current.ratio));
  };
  const handlePointerUp = (event: PointerEvent) => {
    // Two fingers lifting are not a double-tap on the page beneath them.
    if (gesture && event.pointerType === 'touch') consume(event);
  };
  surface.addEventListener('wheel', handleWheel, { passive: false });
  surface.addEventListener('touchstart', handleStart, { passive: true });
  surface.addEventListener('touchmove', handleMove, { passive: false });
  surface.addEventListener('touchend', handleEnd, { passive: false });
  surface.addEventListener('touchcancel', handleEnd, { passive: false });
  surface.addEventListener('pointerup', handlePointerUp, true);
  return () => {
    gesture?.motion?.cancel();
    gesture = null;
    surface.removeEventListener('wheel', handleWheel);
    surface.removeEventListener('touchstart', handleStart);
    surface.removeEventListener('touchmove', handleMove);
    surface.removeEventListener('touchend', handleEnd);
    surface.removeEventListener('touchcancel', handleEnd);
    surface.removeEventListener('pointerup', handlePointerUp, true);
  };
}
