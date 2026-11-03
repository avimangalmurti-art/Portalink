import React from 'react';
import { DEFAULT_PROJECT_GRID_COLUMNS } from '../../utils/projectGridDensity';
import { DensitySeparator } from '../../components/ui/DensitySeparator';

/** Mouse and keyboard access to the same density used by gallery gestures. */
export function WebGalleryControls({ columns, onChange }: { columns: number; onChange: (columns: number) => void }) {
  return <div role="group" aria-label="Gallery layout" className="mb-2 flex flex-wrap items-center justify-end gap-2 text-[13px] text-[var(--text-secondary)]" data-web-gallery-controls="">
    <label className="flex min-h-9 min-w-0 flex-1 items-center gap-2">Layout
      <span className="web-gallery-density-range"><DensitySeparator columns={columns} onChange={onChange} label="Projects per row" /></span>
    </label>
    <button type="button" disabled={columns === DEFAULT_PROJECT_GRID_COLUMNS} onClick={() => onChange(DEFAULT_PROJECT_GRID_COLUMNS)} title="Restore 2 projects per row"
      className="min-h-9 rounded-[8px] px-2 hover:bg-[var(--surface-hover)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">Reset layout</button>
  </div>;
}
