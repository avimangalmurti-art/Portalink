import React from 'react';
import { DEFAULT_PROJECT_GRID_COLUMNS, MAX_PROJECT_GRID_COLUMNS, MIN_PROJECT_GRID_COLUMNS } from '../../utils/projectGridDensity';

/** Mouse and keyboard access to the same density used by gallery gestures. */
export function WebGalleryControls({ columns, onChange }: { columns: number; onChange: (columns: number) => void }) {
  return <div role="group" aria-label="Gallery layout" className="mb-2 flex flex-wrap items-center justify-end gap-2 text-[13px] text-[var(--text-secondary)]" data-web-gallery-controls="">
    <label className="flex min-h-9 items-center gap-2">Layout
      <select aria-label="Projects per row" value={columns} onChange={event => onChange(Number(event.target.value))}
        className="min-h-9 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-raised)] px-2 text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
        {Array.from({ length: MAX_PROJECT_GRID_COLUMNS - MIN_PROJECT_GRID_COLUMNS + 1 }, (_, index) => MIN_PROJECT_GRID_COLUMNS + index).map(value => <option key={value} value={value}>{value} per row</option>)}
      </select>
    </label>
    <button type="button" disabled={columns === DEFAULT_PROJECT_GRID_COLUMNS} onClick={() => onChange(DEFAULT_PROJECT_GRID_COLUMNS)} title="Restore 2 projects per row"
      className="min-h-9 rounded-[8px] px-2 hover:bg-[var(--surface-hover)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">Reset layout</button>
  </div>;
}
