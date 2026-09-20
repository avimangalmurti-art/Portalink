type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
type Page = { element: HTMLElement; key: string; box: Box; layout: Box; transform: string; origin: string; transition: string; willChange: string };
const animations = new WeakMap<HTMLElement, Animation[]>();
const boxOf = (element: HTMLElement): Box => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

export const touchMidpoint = (touches: TouchList): Point => ({
  x: (touches[0].clientX + touches[1].clientX) / 2,
  y: (touches[0].clientY + touches[1].clientY) / 2
});

function stopAnimations(surface: HTMLElement) {
  animations.get(surface)?.forEach(animation => animation.cancel());
  animations.delete(surface);
}

/** Preview only painted content; layout, controls and React state stay still. */
export function beginContentPinch(surface: HTMLElement, origin: Point, focused = false) {
  const selector = focused ? '.premium-focused-media[data-media-page-surface]' : '[data-project-page-number]';
  const viewport = surface.getBoundingClientRect();
  const elements = Array.from(surface.querySelectorAll<HTMLElement>(selector));
  // Preserve the current visible pose if a new pinch interrupts settling.
  const visible = new Map(elements.map(element => [element, boxOf(element)]));
  stopAnimations(surface);
  const pages: Page[] = elements.flatMap((element, index) => {
    const box = visible.get(element) ?? boxOf(element);
    // Include one viewport of overscan so shrinking can reveal adjacent pages.
    if (box.width <= 0 || box.height <= 0 || box.y > viewport.bottom + viewport.height || box.y + box.height < viewport.top - viewport.height) return [];
    return [{ element, key: focused ? 'focused' : element.dataset.projectPageNumber ?? String(index), box, layout: boxOf(element),
      transform: element.style.transform, origin: element.style.transformOrigin,
      transition: element.style.transition, willChange: element.style.willChange }];
  });
  if (!pages.length) return null;
  const distance = ({ box }: Page) => Math.hypot(Math.max(box.x - origin.x, 0, origin.x - box.x - box.width), Math.max(box.y - origin.y, 0, origin.y - box.y - box.height));
  const anchor = pages.reduce((nearest, page) => distance(page) < distance(nearest) ? page : nearest);
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const anchorFraction = { x: clamp((origin.x - anchor.box.x) / anchor.box.width), y: clamp((origin.y - anchor.box.y) / anchor.box.height) };
  let scroll: HTMLElement | null = anchor.element.parentElement;
  while (scroll && scroll !== surface && !/(auto|scroll)/.test(getComputedStyle(scroll).overflowY)) scroll = scroll.parentElement;
  const scroller = scroll ?? surface;
  let ratio = 1, center = origin, frame: number | null = null, disposed = false;
  for (const { element } of pages) {
    element.style.transformOrigin = '0 0';
    element.style.transition = 'none';
    element.style.willChange = 'transform';
  }
  const projected = (box: Box): Box => ({
    x: center.x + (box.x - origin.x) * ratio,
    y: center.y + (box.y - origin.y) * ratio,
    width: box.width * ratio, height: box.height * ratio
  });
  const paint = () => {
    frame = null;
    if (disposed) return;
    // Read nothing here: touch events are coalesced into one compositor update.
    for (const { element, box, layout } of pages) {
      const next = projected(box);
      element.style.transform = `translate3d(${next.x - layout.x}px, ${next.y - layout.y}px, 0) scale(${next.width / layout.width}, ${next.height / layout.height})`;
    }
  };
  const restore = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    for (const page of pages) {
      page.element.style.transform = page.transform;
      page.element.style.transformOrigin = page.origin;
      page.element.style.transition = page.transition;
      page.element.style.willChange = page.willChange;
    }
    disposed = true;
  };
  paint();
  return {
    update(scale: number, point: Point) {
      if (disposed || !Number.isFinite(scale) || scale <= 0) return;
      ratio = scale; center = point;
      if (frame === null) frame = requestAnimationFrame(paint);
    },
    cancel() { restore(); stopAnimations(surface); },
    /** Call after the final React layout, before paint. */
    settle(preserveAnchor = true) {
      if (disposed) return;
      const previous = new Map(pages.map(page => [page.key, projected(page.box)]));
      restore();
      const targets = Array.from(surface.querySelectorAll<HTMLElement>(selector));
      const keyOf = (element: HTMLElement, index: number) => focused ? 'focused' : element.dataset.projectPageNumber ?? String(index);
      const nextAnchor = targets.find((element, index) => keyOf(element, index) === anchor.key);
      if (preserveAnchor && nextAnchor && scroller.isConnected) {
        const rect = boxOf(nextAnchor);
        scroller.scrollLeft += rect.x + anchorFraction.x * rect.width - center.x;
        scroller.scrollTop += rect.y + anchorFraction.y * rect.height - center.y;
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const running = targets.flatMap((element, index) => {
        const before = previous.get(keyOf(element, index));
        if (!before) return [];
        const after = boxOf(element);
        if (!after.width || !after.height || typeof element.animate !== 'function') return [];
        return [element.animate([
          { transformOrigin: '0 0', transform: `translate3d(${before.x - after.x}px, ${before.y - after.y}px, 0) scale(${before.width / after.width}, ${before.height / after.height})` },
          { transformOrigin: '0 0', transform: 'none' }
        ], { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })];
      });
      animations.set(surface, running);
      void Promise.allSettled(running.map(animation => animation.finished)).then(() => {
        if (animations.get(surface) === running) animations.delete(surface);
      });
    }
  };
}

export type ContentPinchMotion = NonNullable<ReturnType<typeof beginContentPinch>>;
