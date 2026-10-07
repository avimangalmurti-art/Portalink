import { useEffect, type RefObject } from 'react';

// Let short reading pauses settle before bringing interface chrome back.
const SCROLL_IDLE_DELAY = 700;
// Overview pages use a 320ms double-tap window. Wait before treating a tap as
// chrome control so both pointer-up events still reach their page renderer.
const SINGLE_TAP_DELAY = 340;

// Only interface surfaces: page/image buttons remain part of the artwork.
const controlsSelector = [
  '.mobile-navigation-layer', '.shared-profile-sidebar:not([data-mobile-shared-sidebar])', '.mobile-project-back', '.mobile-project-gesture-hint',
  '[data-mobile-project-view] [data-project-index-panel]',
  '[data-mobile-project-view] [data-project-response-rail]',
  '.mobile-project-index-dismiss', '[data-mobile-project-view] [data-project-file-strip]',
  '[data-mobile-project-view] [data-media-interaction]',
  '[data-mobile-project-view] .premium-viewer-exit-control',
  '[data-mobile-project-view] [data-viewer-page-control]',
  '[data-mobile-project-view] [data-focused-page-count]',
  '[data-mobile-project-view] [data-document-reader-header]',
  '[data-mobile-project-view] .mobile-project-density',
  // Page navigation remains available while all other reading controls hide.
  '[data-mobile-project-view] button:not([data-mobile-page-navigator] *)', '[data-mobile-project-view] audio',
].join(',');

/** One mobile reading state for app chrome and the media's native controls.
 * A single artwork tap toggles chrome; scrolling hides it through short pauses.
 */
export function useProjectScrollActivity(enabled: boolean, pathname: string, navigation: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const frame = navigation.current?.closest<HTMLElement>('[data-presentation="mobile"]');
    if (!enabled || !frame) return;
    let hidden = false, scrollIntent = false;
    let idleTimer: number | undefined, tapTimer: number | undefined;
    let pendingTap: { target: Element; x: number; y: number; time: number } | null = null;
    let gesture: { id: number; x: number; y: number; time: number; moved: boolean; stage: boolean; tap: boolean; doubleTap: boolean; reveal: boolean } | null = null;
    const controls = new Map<HTMLElement, boolean | null>();
    const videos = new Map<HTMLVideoElement, boolean>();
    const modalOpen = () => Boolean(frame.querySelector('[aria-modal="true"], [role="menu"]'));
    const inFrame = (target: EventTarget | null): target is Element => target instanceof Element && frame.contains(target);
    const inStage = (target: EventTarget | null): target is Element => {
      if (!inFrame(target)) return false;
      const view = target.closest('[data-project-stage]')?.closest('[data-mobile-project-view]');
      // PDF canvases are intentionally aria-hidden inside their labelled page.
      // Only a hidden outgoing viewer excludes the artwork from scroll gestures.
      return Boolean(view && !view.closest('[inert], .screen-exit, [aria-hidden="true"]')) &&
        !target.closest('[inert], [data-project-reading-control], input, textarea, select, [contenteditable="true"]');
    };
    const tapSurface = (target: Element) => target.closest('[role="button"], [data-focused-page-scroll]') ?? target.closest('[data-project-stage]');
    const clearTap = () => { window.clearTimeout(tapTimer); tapTimer = undefined; pendingTap = null; };
    const clearIdle = () => { window.clearTimeout(idleTimer); idleTimer = undefined; };
    const syncControls = () => {
      frame.querySelectorAll<HTMLElement>(controlsSelector).forEach(element => {
        // Back must remain usable at every scroll position; the portal/index
        // opener still follows the rest of the reader's temporary chrome.
        if (element.matches('.mobile-project-back:not(.mobile-project-portal-preview)')) return;
        if (!controls.has(element)) { controls.set(element, null); element.setAttribute('data-project-reading-control', ''); }
        if (hidden && controls.get(element) === null) { controls.set(element, element.inert); element.inert = true; }
      });
      if (hidden) frame.querySelectorAll<HTMLVideoElement>('[data-mobile-project-view] [data-project-stage] video').forEach(video => {
        if (!videos.has(video)) { videos.set(video, video.controls); video.controls = false; }
      });
    };
    const restore = () => {
      clearTap(); clearIdle();
      hidden = false; scrollIntent = false;
      frame.removeAttribute('data-project-reading');
      controls.forEach((previous, element) => {
        if (previous !== null) { element.inert = previous; controls.set(element, null); }
      });
      videos.forEach((previous, video) => {
        // A first tap (or queue selection) may change the player's desired
        // controls while scrolling. Restore that state, never the stale one.
        const requested = video.getAttribute('data-video-controls-requested');
        video.controls = requested === null ? previous : requested === 'true';
      }); videos.clear();
    };
    const hide = () => {
      hidden = true;
      syncControls();
      frame.setAttribute('data-project-reading', '');
    };
    const scroll = (event: Event) => {
      const documentOverview = event.target === document && Boolean(frame.querySelector('[data-mobile-page-reader]:not(:has([data-mobile-focused-view]))'));
      if (!scrollIntent || (!documentOverview && !inStage(event.target)) || modalOpen() ||
        frame.querySelector('[data-project-reading-control]:focus-visible, [data-project-reading-control] :focus-visible')) return;
      clearTap();
      hide();
      clearIdle();
      idleTimer = window.setTimeout(restore, SCROLL_IDLE_DELAY);
    };
    const wheel = (event: WheelEvent) => {
      clearTap();
      scrollIntent = !event.ctrlKey && !event.metaKey && Boolean(event.deltaX || event.deltaY) && inStage(event.target) && !modalOpen();
    };
    const down = (event: PointerEvent) => {
      const previous = pendingTap;
      clearTap();
      if (!event.isPrimary) { gesture = null; scrollIntent = false; return; }
      if (event.button !== 0 || !inFrame(event.target) || modalOpen()) { gesture = null; return; }
      scrollIntent = false;
      const stage = inStage(event.target);
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, moved: false, stage, reveal: hidden,
        // Let media players, links, editing fields and 3D canvases own their taps.
        tap: stage && !event.target.closest('audio, iframe, model-viewer, canvas[role="img"], a[href], button, [role="slider"], [role="menu"], [role="dialog"], [contenteditable="true"]') &&
          (!event.target.closest('video') || hidden),
        doubleTap: Boolean(previous && event.timeStamp - previous.time < 320 &&
          Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 24 && tapSurface(previous.target) === tapSurface(event.target)) };
    };
    const move = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
        gesture.moved = true;
        if (gesture.stage) scrollIntent = true;
      }
    };
    const cancel = () => {
      // Browsers cancel pointer events when native panning takes over.
      if (gesture?.stage) scrollIntent = true;
      gesture = null;
    };
    const up = (event: PointerEvent) => {
      const start = gesture; gesture = null;
      if (!start || !start.tap || start.doubleTap || start.id !== event.pointerId || start.moved || !inStage(event.target) ||
        event.timeStamp - start.time > 450 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8 || modalOpen()) return;
      const target = event.target;
      pendingTap = { target, x: event.clientX, y: event.clientY, time: event.timeStamp };
      tapTimer = window.setTimeout(() => {
        clearTap();
        if (!target.isConnected || !inStage(target) || modalOpen()) return;
        // The tapped page may gain focus before pointer-up. Preserve the tap's
        // original intent instead of hiding controls that focus just revealed.
        if (start.reveal) restore(); else hide();
      }, SINGLE_TAP_DELAY);
    };
    const key = (event: KeyboardEvent) => {
      clearTap();
      if (!hidden || !['Tab', 'Escape'].includes(event.key)) return;
      restore();
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
    };
    const focus = () => { if (hidden) restore(); };
    syncControls();
    const observer = new MutationObserver(() => { if (hidden && modalOpen()) restore(); syncControls(); });
    observer.observe(frame, { childList: true, subtree: true });
    document.addEventListener('scroll', scroll, { capture: true, passive: true });
    document.addEventListener('wheel', wheel, { capture: true, passive: true });
    // Observe the original content gesture alongside nonmodal navigation;
    // closing navigation does not consume the page's scroll or tap intent.
    window.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('focusin', focus, true);
    return () => {
      observer.disconnect(); restore();
      controls.forEach((_, element) => element.removeAttribute('data-project-reading-control'));
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('wheel', wheel, true);
      window.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('focusin', focus, true);
    };
  }, [enabled, pathname, navigation]);
}
