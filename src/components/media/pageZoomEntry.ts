import { beginContentPinch, touchMidpoint, type ContentPinchMotion } from './contentPinchMotion';

type Point = { x: number; y: number };
const clampZoom = (zoom: number) => Math.min(4, Math.max(1, zoom));
const distance = (touches: TouchList) => Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
const isControl = (target: EventTarget | null) => Boolean((target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, [contenteditable="true"]'));

/** Only two stationary, single-finger taps on the same overview page open it. */
export function installOverviewPageTaps(surface: HTMLElement, onOpen: (pageNumber: number) => void) {
  const owner = surface.ownerDocument;
  let contact: { id: number; page: number; x: number; y: number; time: number } | null = null;
  let previous: { page: number; x: number; y: number; time: number } | null = null;
  let lastTouch = -Infinity;
  const reset = () => { contact = previous = null; };
  const interrupt = (event: TouchEvent) => { if (event.touches.length > 1) reset(); };
  const pageOf = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (isControl(target)) return NaN;
    return Number(target?.closest?.<HTMLElement>('[data-project-page-number]')?.dataset.projectPageNumber);
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') { lastTouch = -Infinity; reset(); return; }
    lastTouch = performance.now();
    const page = pageOf(event);
    if (!event.isPrimary || !Number.isInteger(page) || page < 1) { reset(); return; }
    contact = { id: event.pointerId, page, x: event.clientX, y: event.clientY, time: lastTouch };
  };
  const moved = (event: PointerEvent) => contact && contact.id === event.pointerId &&
    Math.hypot(event.clientX - contact.x, event.clientY - contact.y) > 10;
  const move = (event: PointerEvent) => { if (moved(event)) reset(); };
  const up = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    const page = pageOf(event);
    if (!Number.isInteger(page) || page < 1) { reset(); return; }
    // Own page taps here so the individual tiles cannot count a pinch release.
    event.stopPropagation();
    const now = performance.now();
    lastTouch = now;
    if (!contact || contact.id !== event.pointerId || contact.page !== page || moved(event) || now - contact.time >= 320) { reset(); return; }
    contact = null;
    const tap = { page, x: event.clientX, y: event.clientY, time: now };
    if (previous?.page === page && now - previous.time < 320 && Math.hypot(tap.x - previous.x, tap.y - previous.y) < 24) {
      previous = null;
      event.preventDefault();
      onOpen(page);
      return;
    }
    previous = tap;
  };
  const doubleClick = (event: MouseEvent) => {
    if (!Number.isInteger(pageOf(event)) || performance.now() - lastTouch >= 500) return;
    event.preventDefault();
    event.stopPropagation();
  };
  surface.addEventListener('pointerdown', down, true);
  surface.addEventListener('pointermove', move, true);
  surface.addEventListener('pointerup', up, true);
  surface.addEventListener('pointercancel', reset, true);
  surface.addEventListener('dblclick', doubleClick, true);
  owner.addEventListener('touchstart', interrupt, { capture: true, passive: true });
  owner.addEventListener('touchmove', interrupt, { capture: true, passive: true });
  return () => {
    surface.removeEventListener('pointerdown', down, true);
    surface.removeEventListener('pointermove', move, true);
    surface.removeEventListener('pointerup', up, true);
    surface.removeEventListener('pointercancel', reset, true);
    surface.removeEventListener('dblclick', doubleClick, true);
    owner.removeEventListener('touchstart', interrupt, true);
    owner.removeEventListener('touchmove', interrupt, true);
  };
}

/** Enter from the page being enlarged, independently of an editable grid layout. */
export function installPageZoomEntry(surface: HTMLElement, onEnter: (pageNumber: number, zoom: number) => void) {
  let gesture: { page: number; origin: Point; distance: number; ratio: number; direction: 'pending' | 'enter' | 'density'; motion: ContentPinchMotion | null } | null = null;
  let entering = false;
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
