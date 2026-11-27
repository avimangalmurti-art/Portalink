import { useCallback, useRef } from 'react';

/** Attach the existing sidebar mask when a mobile Portals list mounts. */
export function useMobilePortalScrollFade<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback((scroller: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!scroller) return;

    const sync = () => {
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      scroller.classList.toggle('is-at-top', maxScroll <= 1 || scroller.scrollTop <= 1);
      scroller.classList.toggle('is-at-bottom', maxScroll <= 1 || scroller.scrollTop >= maxScroll - 1);
    };
    const size = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(sync);
    const observeContent = () => {
      size?.disconnect();
      size?.observe(scroller);
      for (const child of scroller.children) size?.observe(child);
      sync();
    };
    const content = new MutationObserver(observeContent);
    content.observe(scroller, { childList: true });
    scroller.addEventListener('scroll', sync, { passive: true });
    observeContent();

    cleanup.current = () => {
      content.disconnect();
      size?.disconnect();
      scroller.removeEventListener('scroll', sync);
    };
  }, []);
}
