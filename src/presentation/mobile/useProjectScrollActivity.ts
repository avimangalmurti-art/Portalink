import { useEffect, type RefObject } from 'react';

// Only interface surfaces: page/image buttons remain part of the artwork.
const controlsSelector = [
  '.mobile-navigation-layer', '.shared-profile-sidebar', '.mobile-project-back',
  '[data-mobile-project-view] [data-project-index-panel]',
  '[data-mobile-project-view] [data-project-response-rail]',
  '.mobile-project-index-dismiss', '[data-mobile-project-view] [data-project-file-strip]',
  '[data-mobile-project-view] [data-media-interaction]',
  '[data-mobile-project-view] .premium-viewer-exit-control',
  '[data-mobile-project-view] [data-viewer-page-control]',
  '[data-mobile-project-view] [data-focused-page-count]',
  '[data-mobile-project-view] button', '[data-mobile-project-view] audio',
].join(',');

/** One mobile reading state for the app chrome and the media's native controls.
 * Scroll never changes layout or playback; only a completed tap restores chrome.
 */
export function useProjectScrollActivity(enabled: boolean, pathname: string, navigation: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const frame = navigation.current?.closest<HTMLElement>('[data-presentation="mobile"]');
    if (!enabled || !frame) return;
    let hidden = false, scrollIntent = false, consumeClick = false;
    let gesture: { id: number; x: number; y: number; time: number; moved: boolean; stage: boolean } | null = null;
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
    const syncControls = () => {
      frame.querySelectorAll<HTMLElement>(controlsSelector).forEach(element => {
        if (!controls.has(element)) { controls.set(element, null); element.setAttribute('data-project-reading-control', ''); }
        if (hidden && controls.get(element) === null) { controls.set(element, element.inert); element.inert = true; }
      });
      if (hidden) frame.querySelectorAll<HTMLVideoElement>('[data-mobile-project-view] [data-project-stage] video').forEach(video => {
        if (!videos.has(video)) { videos.set(video, video.controls); video.controls = false; }
      });
    };
    const restore = () => {
      hidden = false; scrollIntent = false;
      frame.removeAttribute('data-project-reading');
      controls.forEach((previous, element) => {
        if (previous !== null) { element.inert = previous; controls.set(element, null); }
      });
      videos.forEach((previous, video) => { video.controls = previous; }); videos.clear();
    };
    const scroll = (event: Event) => {
      if (!scrollIntent || !inStage(event.target) || modalOpen() ||
        frame.querySelector('[data-project-reading-control]:focus-visible, [data-project-reading-control] :focus-visible')) return;
      hidden = true;
      syncControls();
      frame.setAttribute('data-project-reading', '');
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && (event.deltaX || event.deltaY) && inStage(event.target) && !modalOpen()) scrollIntent = true;
    };
    const down = (event: PointerEvent) => {
      consumeClick = false;
      if (!event.isPrimary) { gesture = null; scrollIntent = false; return; }
      if (event.button !== 0 || !inFrame(event.target) || modalOpen()) return;
      scrollIntent = false;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, moved: false, stage: inStage(event.target) };
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
      if (!hidden || !start || start.id !== event.pointerId || start.moved ||
        event.timeStamp - start.time > 450 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8 || modalOpen()) return;
      restore(); consumeClick = true;
      event.preventDefault(); event.stopPropagation();
    };
    const click = (event: MouseEvent) => {
      if (!consumeClick) return;
      consumeClick = false;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    const key = (event: KeyboardEvent) => {
      consumeClick = false;
      if (!hidden || !['Tab', 'Escape'].includes(event.key)) return;
      restore();
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
    };
    syncControls();
    const observer = new MutationObserver(() => { if (hidden && modalOpen()) restore(); syncControls(); });
    observer.observe(frame, { childList: true, subtree: true });
    document.addEventListener('scroll', scroll, { capture: true, passive: true });
    document.addEventListener('wheel', wheel, { capture: true, passive: true });
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    return () => {
      observer.disconnect(); restore();
      controls.forEach((_, element) => element.removeAttribute('data-project-reading-control'));
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('wheel', wheel, true);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [enabled, pathname, navigation]);
}
