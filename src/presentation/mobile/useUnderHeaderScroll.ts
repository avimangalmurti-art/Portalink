import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
/** Measure responsive controls so the scrolling surface can extend underneath them. */
export function useUnderHeaderScroll(ref: RefObject<HTMLElement>, enabled: boolean, key: string) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    const header = root.querySelector<HTMLElement>(key === 'inbox' ? '[data-inbox-controls]' : '[data-mobile-safe-header]');
    if (!header) return;
    const update = () => root.style.setProperty('--scroll-header-height', `${header.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update); observer.observe(header);
    return () => { observer.disconnect(); root.style.removeProperty('--scroll-header-height'); };
  }, [ref, enabled, key]);
}
