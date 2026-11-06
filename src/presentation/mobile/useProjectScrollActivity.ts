import { useEffect, type RefObject } from 'react';
import { createNavigationScrollSettling, NAVIGATION_SCROLL_IDLE_DELAY } from './navigationScrollSettling';

// Match the page renderer's double-tap window without delaying the first tap.
const DOUBLE_TAP_WINDOW = 320;

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
 * A single artwork tap toggles chrome; scrolling returns it like the main dock.
 */
export function useProjectScrollActivity(enabled: boolean, pathname: string, navigation: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const frame = navigation.current?.closest<HTMLElement>('[data-presentation="mobile"]');
    if (!enabled || !frame) return;
    let hidden = false, scrolling = false, scrollIntent = false;
    let idleTimer: number | undefined;
    let idleDeadline: number | undefined;
    let scrollingTarget: EventTarget | null = null;
    const motion = createNavigationScrollSettling();
    let counterPress: number | undefined;
    let pendingTap: { target: Element; x: number; y: number; time: number; hidden: boolean; idleDeadline: number | undefined } | null = null;
    let gesture: { id: number; x: number; y: number; time: number; moved: boolean; stage: boolean; tap: boolean;
      doubleTapState: { hidden: boolean; idleDeadline: number | undefined } | null; reveal: boolean; idleDeadline: number | undefined } | null = null;
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
    const clearTap = () => { pendingTap = null; };
    const clearIdle = () => { window.clearTimeout(idleTimer); idleTimer = undefined; idleDeadline = undefined; };
    const syncControls = () => {
      frame.querySelectorAll<HTMLElement>(controlsSelector).forEach(element => {
        const back = element.matches('.mobile-project-back:not(.mobile-project-portal-preview)');
        // The scrolling counter must not inherit an inert header. Its other
        // controls still hide; an explicit artwork tap keeps the old behavior.
        const keepCounter = scrolling && element.matches('[data-document-reader-header]');
        if (!controls.has(element)) {
          controls.set(element, null);
          if (!back) element.setAttribute('data-project-reading-control', '');
        }
        const conceal = back ? scrolling : hidden && !keepCounter;
        const previous = controls.get(element) ?? null;
        if (conceal && previous === null) { controls.set(element, element.inert); element.inert = true; }
        else if (!conceal && previous !== null) { element.inert = previous; controls.set(element, null); }
      });
      if (hidden) frame.querySelectorAll<HTMLVideoElement>('[data-mobile-project-view] [data-project-stage] video').forEach(video => {
        if (!videos.has(video)) { videos.set(video, video.controls); video.controls = false; }
      });
    };
    const show = () => {
      if (!hidden && !scrolling) return;
      hidden = false; scrolling = false;
      counterPress = undefined;
      frame.removeAttribute('data-project-reading');
      frame.removeAttribute('data-project-scrolling');
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
    const restore = () => {
      clearTap(); clearIdle();
      scrollIntent = false;
      scrollingTarget = null;
      motion.reset();
      show();
    };
    const waitForIdle = (forceFallback = false) => {
      clearIdle();
      if (counterPress !== undefined) return;
      // Retain the deadline for double-tap reconciliation even when native
      // scrollend owns the return. Counter release uses a short fallback.
      idleDeadline = performance.now() + NAVIGATION_SCROLL_IDLE_DELAY;
      if (forceFallback || !scrollingTarget || !('onscrollend' in scrollingTarget)) {
        idleTimer = window.setTimeout(restore, NAVIGATION_SCROLL_IDLE_DELAY);
      }
    };
    const releaseCounter = () => {
      if (counterPress === undefined) return;
      counterPress = undefined;
      if (scrolling) {
        // A late native scrollend must not relocate the counter after release
        // but before its click. Activation or the bounded fallback owns return.
        scrollingTarget = null;
        motion.reset();
        waitForIdle(true);
      }
    };
    const hide = (duringScroll = false) => {
      if (!duringScroll) {
        // An explicit reading tap owns its visibility beyond native momentum.
        scrollingTarget = null;
        scrollIntent = false;
        motion.reset();
      }
      hidden = true;
      scrolling = duringScroll;
      syncControls();
      frame.setAttribute('data-project-reading', '');
      if (scrolling) frame.setAttribute('data-project-scrolling', '');
      else frame.removeAttribute('data-project-scrolling');
    };
    const scroll = (event: Event) => {
      const documentOverview = event.target === document && Boolean(frame.querySelector('[data-mobile-page-reader]:not(:has([data-mobile-focused-view]))'));
      if (!scrollIntent || (!documentOverview && !inStage(event.target)) || modalOpen() ||
        frame.querySelector('.mobile-project-back:focus-visible, [data-project-reading-control]:focus-visible, [data-project-reading-control] :focus-visible')) return;
      const surface = documentOverview ? document.scrollingElement : event.target;
      if (!(surface instanceof HTMLElement) ||
        (surface.scrollHeight <= surface.clientHeight + 1 && surface.scrollWidth <= surface.clientWidth + 1)) return;
      clearTap();
      const settling = motion.update(event.target, surface, event.timeStamp);
      if (settling && counterPress === undefined) show();
      else hide(true);
      scrollingTarget = event.target;
      waitForIdle();
    };
    const scrollEnd = (event: Event) => {
      if (event.target === scrollingTarget && counterPress === undefined) restore();
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
      motion.reset();
      if (scrolling && event.target.closest('[data-mobile-project-page-count]')) {
        // Never move the newly reachable counter between press and release,
        // even when the reading pause expires under a held finger.
        counterPress = event.pointerId;
        clearIdle();
      }
      const stage = inStage(event.target);
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, moved: false, stage, reveal: hidden, idleDeadline,
        // Let media players, links, editing fields and 3D canvases own their taps.
        tap: stage && !event.target.closest('audio, iframe, model-viewer, canvas[role="img"], a[href], button, [role="slider"], [role="menu"], [role="dialog"], [contenteditable="true"]') &&
          (!event.target.closest('video') || hidden),
        doubleTapState: previous && previous.target.isConnected && event.timeStamp - previous.time >= 0 &&
          event.timeStamp - previous.time < DOUBLE_TAP_WINDOW && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 24 &&
          tapSurface(previous.target) === tapSurface(event.target) ? { hidden: previous.hidden, idleDeadline: previous.idleDeadline } : null };
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
      releaseCounter();
      gesture = null;
    };
    const up = (event: PointerEvent) => {
      if (counterPress === event.pointerId) releaseCounter();
      const start = gesture; gesture = null;
      if (!start || !start.tap || start.id !== event.pointerId || start.moved || !inStage(event.target) || !event.target.isConnected ||
        event.timeStamp - start.time > 450 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8 || modalOpen()) return;
      const target = event.target;
      clearIdle();
      if (start.doubleTapState !== null) {
        // Undo the first tap's chrome change; both untouched pointer-up events
        // still reach the page's existing double-tap zoom handler.
        const original = start.doubleTapState;
        const remaining = original.idleDeadline === undefined ? undefined : original.idleDeadline - performance.now();
        if (!original.hidden || (remaining !== undefined && remaining <= 0)) restore();
        else {
          hide(remaining !== undefined);
          if (remaining !== undefined) {
            idleDeadline = original.idleDeadline;
            idleTimer = window.setTimeout(restore, remaining);
          }
        }
        return;
      }
      // The page may gain focus before pointer-up. Keep the original tap
      // intent, and remember it only to reconcile a subsequent double tap.
      if (start.reveal) restore(); else hide();
      pendingTap = { target, x: event.clientX, y: event.clientY, time: event.timeStamp, hidden: start.reveal, idleDeadline: start.idleDeadline };
    };
    const key = (event: KeyboardEvent) => {
      clearTap();
      if (!hidden || !['Tab', 'Escape'].includes(event.key)) return;
      restore();
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
    };
    const focus = (event: FocusEvent) => {
      // Pointer focus precedes the counter's click. Keep it under the finger
      // until activation; keyboard or preview focus still reveals the chrome.
      if (scrolling && inFrame(event.target) && event.target.closest('[data-mobile-project-page-count]') && !event.target.matches(':focus-visible')) return;
      if (hidden) restore();
    };
    const activateCounter = (event: MouseEvent) => {
      // Click already owns its target, so it is safe to return the controls
      // before React opens and focuses the newly requested page previews.
      if (scrolling && inFrame(event.target) && event.target.closest('[data-mobile-project-page-count]')) restore();
    };
    syncControls();
    const observer = new MutationObserver(() => { if (hidden && modalOpen()) restore(); syncControls(); });
    observer.observe(frame, { childList: true, subtree: true });
    document.addEventListener('scroll', scroll, { capture: true, passive: true });
    document.addEventListener('scrollend', scrollEnd, { capture: true, passive: true });
    document.addEventListener('wheel', wheel, { capture: true, passive: true });
    // Observe the original content gesture alongside nonmodal navigation;
    // closing navigation does not consume the page's scroll or tap intent.
    window.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('click', activateCounter, true);
    return () => {
      observer.disconnect(); restore();
      controls.forEach((_, element) => element.removeAttribute('data-project-reading-control'));
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('scrollend', scrollEnd, true);
      document.removeEventListener('wheel', wheel, true);
      window.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('focusin', focus, true);
      document.removeEventListener('click', activateCounter, true);
    };
  }, [enabled, pathname, navigation]);
}
