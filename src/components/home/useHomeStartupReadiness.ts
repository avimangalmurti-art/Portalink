import { useEffect, type RefObject } from 'react';

type Bounds = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>;

/** Inspect the rendered viewport, including saved-scroll and measured-grid changes. */
export function inspectHomeStartupArtwork(root: HTMLElement, projectCount: number, viewport: Bounds, documentProjects: ReadonlySet<string> = new Set()) {
  const cards = [...root.querySelectorAll<HTMLElement>('[data-project-preview]')];
  const images: HTMLImageElement[] = [];
  let ready = cards.length === projectCount;
  let paintPending = false;
  const bounds = root.getBoundingClientRect();
  const clip = { top: Math.max(bounds.top, viewport.top), right: Math.min(bounds.right, viewport.right), bottom: Math.min(bounds.bottom, viewport.bottom), left: Math.max(bounds.left, viewport.left) };
  if (clip.right <= clip.left || clip.bottom <= clip.top) ready = false;
  for (const card of cards) {
    const artwork = card.querySelector<HTMLElement>('.project-preview-artwork');
    if (!artwork) { ready = false; continue; }
    const box = artwork.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) { ready = false; continue; }
    if (box.bottom <= clip.top || box.top >= clip.bottom || box.right <= clip.left || box.left >= clip.right) continue;
    // Removing a skeleton can fade its containing section as well as each img.
    for (let element: HTMLElement | null = artwork; element; element = element.parentElement) {
      if (Number(getComputedStyle(element).opacity) < 0.99) { ready = false; paintPending = true; }
      if (element === root) break;
    }
    const bitmaps = [...artwork.querySelectorAll<HTMLImageElement>('img')];
    for (const image of bitmaps) {
      // An img without a source is still waiting for ResponsiveImage's measurement.
      if (!(image.currentSrc || image.getAttribute('src')) || !image.complete) { ready = false; continue; }
      if (image.naturalWidth <= 0) continue; // The renderer's unavailable-artwork fallback is terminal.
      images.push(image);
      if (Number(getComputedStyle(image).opacity) < 0.99) { ready = false; paintPending = true; }
    }
    // Autoplay previews use a poster and can be blocked by browser policy.
    for (const video of artwork.querySelectorAll<HTMLVideoElement>('video:not([data-feed-cover-video])')) {
      if (!video.error && video.readyState < 2) ready = false;
    }
    const pdf = artwork.querySelector<HTMLElement>('.pdf-page-viewport');
    if (pdf?.getAttribute('aria-busy') === 'true') ready = false;
    if (!bitmaps.length && !pdf && documentProjects.has(artwork.getAttribute('data-project-continuity-id') ?? '')) ready = false;
    for (const canvas of artwork.querySelectorAll<HTMLCanvasElement>('canvas')) {
      // Failed PDFs keep their truthful file placeholder instead of visible canvas paint.
      if (pdf && pdf.getAttribute('aria-busy') !== 'true' && Number(getComputedStyle(canvas).opacity) === 0) continue;
      if (canvas.width <= 0 || canvas.height <= 0 || Number(getComputedStyle(canvas).opacity) < 0.99) { ready = false; paintPending = true; }
    }
  }
  return { ready, images, paintPending };
}

type Options = {
  enabled: boolean;
  attempt: number;
  ref: RefObject<HTMLElement | null>;
  settled: boolean;
  terminalError: boolean;
  projectCount: number;
  documentProjects: ReadonlySet<string>;
  onReady?: (ready: boolean) => void;
};

/** A launch-only paint check; it performs no fetches and never gates later navigation. */
export function useHomeStartupReadiness({ enabled, attempt, ref, settled, terminalError, projectCount, documentProjects, onReady }: Options) {
  useEffect(() => {
    if (!enabled || !onReady) return;
    let active = true, frame = 0, poll = 0, stableFrames = 0, reported = false;
    const decoded = new WeakMap<HTMLImageElement, { source: string; complete: boolean }>();
    // Capture this attempt's callback: a decode finishing between a new render
    // and passive cleanup must not report into the next account/attempt scope.
    onReady(false);
    const schedule = () => { if (active && !frame) frame = requestAnimationFrame(check); };
    const check = () => {
      frame = 0;
      if (!active) return;
      let ready = terminalError || settled;
      let paintPending = false;
      if (ready && !terminalError && projectCount > 0) {
        const root = ref.current;
        if (!root) ready = false;
        else {
          const visual = window.visualViewport;
          const inspection = inspectHomeStartupArtwork(root, projectCount, { top: 0, left: 0, right: visual?.width ?? window.innerWidth, bottom: visual?.height ?? window.innerHeight }, documentProjects);
          ready = inspection.ready;
          paintPending = inspection.paintPending;
          for (const image of inspection.images) {
            const source = image.currentSrc || image.getAttribute('src') || '';
            let entry = decoded.get(image);
            if (!entry || entry.source !== source) {
              entry = { source, complete: false };
              decoded.set(image, entry);
              const current = entry;
              Promise.resolve().then(() => image.decode?.()).then(() => {
                if (active && decoded.get(image) === current) { current.complete = true; schedule(); }
              }, () => {
                // A decode rejection is terminal; source changes get their own new check.
                if (active && decoded.get(image) === current) { current.complete = true; schedule(); }
              });
            }
            if (!entry.complete) ready = false;
          }
        }
      }
      if (!ready) {
        stableFrames = 0;
        if (reported) { reported = false; onReady(false); }
        // ImageMotion transitions opacity after decode. Source/loading/geometry
        // changes wake through DOM/media events; poll only an active paint fade.
        if (paintPending && !poll) poll = window.setTimeout(() => { poll = 0; schedule(); }, 50);
        return;
      }
      if (++stableFrames < 2) { schedule(); return; }
      if (!reported) { reported = true; onReady(true); }
    };
    const root = ref.current;
    const observer = root && typeof MutationObserver !== 'undefined' ? new MutationObserver(() => { stableFrames = 0; schedule(); }) : null;
    if (root) observer?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'sizes', 'class', 'style', 'aria-busy', 'data-motion-image-ready', 'data-motion-content-ready'] });
    const events = ['load', 'error', 'loadeddata', 'transitionend', 'animationend', 'scroll'];
    for (const event of events) root?.addEventListener(event, schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      window.clearTimeout(poll);
      observer?.disconnect();
      for (const event of events) root?.removeEventListener(event, schedule, true);
      window.removeEventListener('resize', schedule);
      // Completion unmounts this observer. Do not revoke its accepted ready report.
    };
  }, [enabled, attempt, ref, settled, terminalError, projectCount, documentProjects, onReady]);
}
