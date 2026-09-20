import React, { useLayoutEffect, useState } from 'react';
import { Grid2X2Icon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';

type PagePosition = { scope: string; current: number; total: number };

/** Read the pages actually displayed by the current renderer, including lazy PDF pages. */
export function MobileProjectPageCounter({ surfaceRef, scope }: {
  surfaceRef: React.RefObject<HTMLDivElement>;
  scope: string;
}) {
  const [position, setPosition] = useState<PagePosition | null>(null);

  useLayoutEffect(() => {
    let surface: HTMLDivElement | null = null;
    let frame: number | null = null;
    let stopped = false;
    const observedPages = new Set<HTMLElement>();
    const measure = () => {
      frame = null;
      if (stopped) return;
      if (!surface) {
        surface = surfaceRef.current;
        if (!surface) return;
        surface.addEventListener('scroll', schedule, { passive: true, capture: true });
        surface.addEventListener('load', schedule, true);
        mutations?.observe(surface, { childList: true, subtree: true, attributes: true,
          attributeFilter: ['data-project-page-number', 'data-project-page-total'] });
        resize?.observe(surface);
      }
      const bounds = surface.getBoundingClientRect();
      const top = Math.max(0, bounds.top);
      const bottom = Math.min(window.innerHeight, bounds.bottom);
      const left = Math.max(0, bounds.left);
      const right = Math.min(window.innerWidth, bounds.right);
      const pages = Array.from(surface.querySelectorAll<HTMLElement>('[data-project-page-number][data-project-page-total]'));
      const presentPages = new Set(pages);
      for (const previous of observedPages) {
        if (!presentPages.has(previous)) {
          resize?.unobserve(previous);
          observedPages.delete(previous);
        }
      }
      let visible: PagePosition | null = null;
      let largestArea = 0;
      for (const page of pages) {
        if (!observedPages.has(page)) {
          resize?.observe(page);
          observedPages.add(page);
        }
        const current = Number(page.dataset.projectPageNumber);
        const total = Number(page.dataset.projectPageTotal);
        if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < current) continue;
        const rect = page.getBoundingClientRect();
        const area = Math.max(0, Math.min(bottom, rect.bottom) - Math.max(top, rect.top))
          * Math.max(0, Math.min(right, rect.right) - Math.max(left, rect.left));
        // In a multi-column row, ties follow the work's page order, not DOM column order.
        if (area > 0 && (area > largestArea + 0.5 || (Math.abs(area - largestArea) <= 0.5 && (!visible || current < visible.current)))) {
          largestArea = area;
          visible = { scope, current, total };
        }
      }
      setPosition(previous => previous?.scope === visible?.scope && previous?.current === visible?.current && previous?.total === visible?.total
        ? previous : visible);
    };
    const schedule = () => {
      if (!stopped && frame === null) frame = requestAnimationFrame(measure);
    };
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    window.addEventListener('resize', schedule, { passive: true });
    // A child layout effect can precede assignment of its parent's surface ref.
    schedule();
    return () => {
      stopped = true;
      if (frame !== null) cancelAnimationFrame(frame);
      surface?.removeEventListener('scroll', schedule, true);
      surface?.removeEventListener('load', schedule, true);
      window.removeEventListener('resize', schedule);
      mutations?.disconnect();
      resize?.disconnect();
    };
  }, [scope, surfaceRef]);

  if (!position || position.scope !== scope) return null;
  return <span data-mobile-project-page-count="" className="mobile-project-page-counter"
    aria-label={`Page ${position.current} of ${position.total}`}>
    <InterfaceIcon icon={Grid2X2Icon} size="sm" weight="medium" />
    <span>{position.current} of {position.total}</span>
  </span>;
}
