import React from 'react';
import { usePresentation } from '../../presentation/usePresentation';

/** Stay outside the zooming page so the count remains anchored to the viewer. */
export function FocusedPageCounter({ current, total, showMediaInteractions }: {
  current: number;
  total: number;
  showMediaInteractions: boolean;
}) {
  const isMobile = usePresentation() === 'mobile';
  if (!isMobile && showMediaInteractions) return null;
  return <span data-viewer-page-control={isMobile ? undefined : ''} data-focused-page-count=""
    aria-label={`Page ${current} of ${total}`}
    className="premium-viewer-page-counter pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums text-white">
    {current} / {total}
  </span>;
}
