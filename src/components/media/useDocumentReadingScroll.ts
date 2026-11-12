import { useLayoutEffect, useRef, type RefObject } from 'react';
import { readViewerMemory, updateViewerMemory } from './viewerMemory';
import { findProjectReadingPage, projectPageScrollTop } from './projectPageScroll';

/** Overview pages scroll with Safari; focused zoom/pan keeps its own memory. */
export function useDocumentReadingScroll(enabled: boolean, host: RefObject<HTMLElement | null>, memoryKey: string,
  initialPage?: number | null, initialAttachmentId?: string | null) {
  const restoredLink = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const linkedKey = initialPage ? JSON.stringify([memoryKey, initialAttachmentId ?? null, initialPage]) : null;
    let shouldOpenLink = linkedKey !== null && restoredLink.current !== linkedKey;
    let target = readViewerMemory(memoryKey).scrollTop ?? 0;
    let frame = 0, attempts = 0, restored = false;
    let observer: MutationObserver | undefined;
    let layoutObserver: ResizeObserver | undefined;
    let linkTimeout: number | undefined;
    const userInputs = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
    const stopWaiting = () => {
      if (linkTimeout === undefined) return;
      window.clearTimeout(linkTimeout);
      linkTimeout = undefined;
      observer?.disconnect();
      observer = undefined;
      layoutObserver?.disconnect();
      layoutObserver = undefined;
      for (const input of userInputs) window.removeEventListener(input, stopOnInput, true);
    };
    const stopOnInput = () => {
      stopWaiting();
      cancelAnimationFrame(frame);
      shouldOpenLink = false;
      restoredLink.current = linkedKey;
      restored = true;
    };
    const scheduleRestore = () => {
      if (!frame) frame = requestAnimationFrame(restore);
    };
    const watchOrderedLayout = (surface: HTMLElement) => {
      if (linkTimeout !== undefined) return;
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(scheduleRestore);
        observer.observe(surface, { childList: true, subtree: true, attributes: true,
          attributeFilter: ['data-project-reading-part', 'data-project-page-number'] });
      }
      if (typeof ResizeObserver !== 'undefined') {
        // Earlier pages can adopt their intrinsic dimensions after the linked page mounts.
        layoutObserver = new ResizeObserver(scheduleRestore);
        layoutObserver.observe(surface);
      }
      for (const input of userInputs) window.addEventListener(input, stopOnInput, true);
      linkTimeout = window.setTimeout(() => {
        stopWaiting();
        shouldOpenLink = false;
        if (!restored) scheduleRestore();
      }, 20_000);
    };
    const restore = () => {
      frame = 0;
      const surface = host.current;
      if (!surface?.isConnected) return;
      if (shouldOpenLink && initialPage) {
        if (initialAttachmentId) watchOrderedLayout(surface);
        const page = initialAttachmentId ? findProjectReadingPage(surface, initialAttachmentId, initialPage)
          : surface.querySelector<HTMLElement>(`[data-project-page-number="${initialPage}"]`);
        if (!page && initialAttachmentId) {
          // PDF pages may mount after a signed download or worker initialization.
          if (!observer && !layoutObserver) scheduleRestore();
          return;
        }
        if (!layoutObserver) stopWaiting();
        if (page) target = Math.max(0, projectPageScrollTop(surface, page));
      }
      window.scrollTo({ top: target, behavior: 'instant' });
      restored = Math.abs(window.scrollY - target) < 2 || attempts++ >= 30;
      if (restored && linkedKey) restoredLink.current = linkedKey;
      if (!restored) scheduleRestore();
    };
    scheduleRestore();
    const remember = () => {
      if (restored && !host.current?.closest('.screen-exit') && !host.current?.closest('[data-mobile-project-view]')?.querySelector('[data-mobile-focused-view]')) {
        updateViewerMemory(memoryKey, { scrollTop: window.scrollY });
      }
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => { stopWaiting(); cancelAnimationFrame(frame); window.removeEventListener('scroll', remember); };
  }, [enabled, host, memoryKey, initialPage, initialAttachmentId]);
}
