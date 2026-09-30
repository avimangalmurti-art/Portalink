import { useLayoutEffect, type RefObject } from 'react';
import { readViewerMemory, updateViewerMemory } from './viewerMemory';

/** Overview pages scroll with Safari; focused zoom/pan keeps its own memory. */
export function useDocumentReadingScroll(enabled: boolean, host: RefObject<HTMLElement | null>, memoryKey: string) {
  useLayoutEffect(() => {
    if (!enabled) return;
    const target = readViewerMemory(memoryKey).scrollTop ?? 0;
    let frame = 0, attempts = 0, restored = false;
    const restore = () => {
      if (!host.current?.isConnected) return;
      window.scrollTo({ top: target, behavior: 'instant' });
      restored = Math.abs(window.scrollY - target) < 2 || attempts++ >= 30;
      if (!restored) frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    const remember = () => {
      if (restored && !host.current?.closest('.screen-exit') && !host.current?.closest('[data-mobile-project-view]')?.querySelector('[data-mobile-focused-view]')) {
        updateViewerMemory(memoryKey, { scrollTop: window.scrollY });
      }
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', remember); };
  }, [enabled, host, memoryKey]);
}
