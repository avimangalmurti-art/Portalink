import React from 'react';

/**
 * The reading size, shown only while the viewer is actually changing it — and
 * then only long enough to say where they landed. A permanent readout would be
 * chrome sitting on top of the work for a preference nobody is adjusting.
 *
 * It is announced politely rather than silently, because the change it reports
 * happens without any visible control being operated.
 */
export function ZoomReadout({
  view







}: {view: {isAdjusting: boolean;isZoomed: boolean;label: string;reset: () => void;};}) {
  if (!view.isAdjusting) {
    return null;
  }
  return <div aria-live="polite" className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
      <span data-material="media-control" className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white">
        {view.label}
      </span>
    </div>;
}
