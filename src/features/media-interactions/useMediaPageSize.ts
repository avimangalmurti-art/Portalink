import { useLayoutEffect, useRef, useState } from 'react';
import { displayedPageWidth } from './mediaToolbarLayout';

/** Observe the page surface, not the viewport or the engagement popup. */
export function useMediaPageSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ pageWidth: 0, hostWidth: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    // Observe the page, not its controls: a tall document page can be visible
    // while its toolbar is still below the viewport.
    const visibility = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsVisible(true);
        visibility?.disconnect();
      }
    }, { rootMargin: '400px' });
    if (visibility) visibility.observe(host);
    else setIsVisible(true);
    let surface: HTMLImageElement | HTMLCanvasElement | null = null;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const hostWidth = host.clientWidth;
      const rect = surface?.getBoundingClientRect();
      const pageWidth = rect?.width ? displayedPageWidth(
        rect.width,
        rect.height,
        surface instanceof HTMLImageElement ? surface.naturalWidth : 0,
        surface instanceof HTMLImageElement ? surface.naturalHeight : 0,
        surface instanceof HTMLImageElement && getComputedStyle(surface).objectFit === 'contain'
      ) : hostWidth;
      setSize((previous) => Math.abs(previous.pageWidth - pageWidth) < 0.1 && Math.abs(previous.hostWidth - hostWidth) < 0.1
        ? previous : { pageWidth, hostWidth });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    const findSurface = () => {
      const next = host.querySelector<HTMLImageElement | HTMLCanvasElement>('[data-media-page-surface]');
      if (next !== surface) {
        if (surface) resize.unobserve(surface);
        surface = next;
        if (surface) resize.observe(surface);
        schedule();
      }
    };
    // A lazy image or a retried image can mount after the toolbar.
    const children = new MutationObserver(findSurface);
    children.observe(host, { childList: true, subtree: true });
    resize.observe(host);
    findSurface();
    host.addEventListener('load', schedule, true);
    cancelAnimationFrame(frame);
    measure();
    return () => {
      resize.disconnect();
      visibility?.disconnect();
      children.disconnect();
      host.removeEventListener('load', schedule, true);
      cancelAnimationFrame(frame);
    };
  }, []);

  return { ref, isVisible, ...size };
}
