import { useLayoutEffect, type RefObject } from 'react';

const PAGE_GAP = 2;
const pageSelector = '[data-desktop-page-cell]';
const noticeSelector = '[data-ordered-page-notice], [data-media-frame-body]:not(:has([data-ordered-page-wrapper]))';

/** Place each page where its top comes next in normal reading order. */
export function packDesktopPages(items: readonly { height: number; fullWidth: boolean }[], columns: number) {
  const bottoms = Array<number>(columns).fill(0);
  const positions = items.map(({ height, fullWidth }) => {
    if (fullWidth) {
      const top = Math.max(...bottoms);
      bottoms.fill(top + height + PAGE_GAP);
      return { top, column: 0 };
    }
    const top = Math.min(...bottoms);
    const column = bottoms.indexOf(top);
    bottoms[column] = top + height + PAGE_GAP;
    return { top, column };
  });
  return { positions, height: Math.max(0, Math.max(...bottoms) - PAGE_GAP) };
}

function setPixels(element: HTMLElement, property: string, amount: number) {
  const value = `${amount}px`;
  if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
}

function clearPosition(element: HTMLElement) {
  element.removeAttribute('data-packed-page');
  element.style.removeProperty('--packed-page-top');
  element.style.removeProperty('--packed-page-left');
}

/** Keep the original page nodes in place for focus, links and lazy rendering. */
export function useDesktopPagePacking(ref: RefObject<HTMLElement | null>, enabled: boolean, columns: number) {
  useLayoutEffect(() => {
    const host = ref.current;
    if (!enabled || !host) return;
    let frame: number | undefined;
    let observed = new Set<HTMLElement>();
    const schedule = () => {
      if (frame === undefined) frame = requestAnimationFrame(layout);
    };
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : undefined;
    const mutation = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : undefined;

    const layout = () => {
      frame = undefined;
      const items = Array.from(host.querySelectorAll<HTMLElement>(`${pageSelector}, ${noticeSelector}`));
      const current = new Set(items);
      for (const item of observed) {
        if (!current.has(item)) {
          resize?.unobserve(item);
          clearPosition(item);
        }
      }
      for (const item of items) {
        if (!observed.has(item)) resize?.observe(item);
      }
      observed = current;
      const width = host.clientWidth;
      if (width <= 0) return;
      const scroller = host.hasAttribute('data-web-ordered-page-grid') ? host : host.parentElement;
      const scrollTop = scroller?.scrollTop ?? 0;
      const columnWidth = Math.max(0, (width - PAGE_GAP * (columns - 1)) / columns);
      setPixels(host, '--packed-page-width', columnWidth);
      for (const item of items) {
        const kind = item.matches(pageSelector) ? 'cell' : 'notice';
        if (item.getAttribute('data-packed-page') !== kind) item.setAttribute('data-packed-page', kind);
      }
      if (!host.hasAttribute('data-page-packing-ready')) host.setAttribute('data-page-packing-ready', '');

      // Measure layout pixels so the reader's opening transform cannot change the spacing.
      const { positions, height } = packDesktopPages(items.map(item => ({
        height: Number.parseFloat(getComputedStyle(item).blockSize) || item.offsetHeight,
        fullWidth: !item.matches(pageSelector),
      })), columns);
      items.forEach((item, index) => {
        setPixels(item, '--packed-page-top', positions[index].top);
        setPixels(item, '--packed-page-left', positions[index].column * (columnWidth + PAGE_GAP));
      });
      setPixels(host, '--packed-page-height', height);
      if (scroller && scroller.scrollTop !== scrollTop) scroller.scrollTop = scrollTop;
    };

    resize?.observe(host);
    mutation?.observe(host, { childList: true, subtree: true });
    host.addEventListener('load', schedule, true);
    window.addEventListener('resize', schedule);
    layout();
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation?.disconnect();
      host.removeEventListener('load', schedule, true);
      window.removeEventListener('resize', schedule);
      for (const item of observed) clearPosition(item);
      host.removeAttribute('data-page-packing-ready');
      host.style.removeProperty('--packed-page-width');
      host.style.removeProperty('--packed-page-height');
    };
  }, [ref, enabled, columns]);
}
