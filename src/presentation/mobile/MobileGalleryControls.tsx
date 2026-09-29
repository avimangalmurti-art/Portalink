import React, { useState } from 'react';
import { DEFAULT_PROJECT_GRID_COLUMNS, MAX_PROJECT_GRID_COLUMNS, MIN_PROJECT_GRID_COLUMNS } from '../../utils/projectGridDensity';

/** A visible alternative to pinching. Uses the gallery's existing density path. */
export function MobileGalleryControls({ columns, onChange }: { columns: number; onChange: (columns: number) => void }) {
  const [open, setOpen] = useState(false);
  const control = 'min-h-[44px] rounded-[10px] px-3 text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]';
  return <div className="mb-2 text-[var(--text-secondary)]" data-mobile-gallery-controls="">
    <div className="flex justify-end">
      <button type="button" className={control} aria-expanded={open} onClick={() => setOpen(value => !value)}>Layout · {columns} per row</button>
    </div>
    {open && <div className="flex flex-wrap items-center gap-2 px-2 pb-2" role="group" aria-label="Gallery layout">
      <label className="flex min-h-[44px] items-center gap-2 text-[14px]">Per row
        <select aria-label="Projects per row" className="min-h-[44px] rounded-[10px] bg-[var(--surface-raised)] px-3 text-[var(--text-primary)]" value={columns} onChange={event => onChange(Number(event.target.value))}>
          {Array.from({ length: MAX_PROJECT_GRID_COLUMNS - MIN_PROJECT_GRID_COLUMNS + 1 }, (_, index) => MIN_PROJECT_GRID_COLUMNS + index).map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <button type="button" className={control} aria-pressed={columns === 2} onClick={() => onChange(2)}>Comfortable</button>
      <button type="button" className={control} aria-pressed={columns === 4} onClick={() => onChange(4)}>Compact</button>
      <button type="button" className={control} onClick={() => onChange(DEFAULT_PROJECT_GRID_COLUMNS)}>Reset</button>
      <p className="w-full text-[14px]">You can also pinch the gallery to change its layout.</p>
      <button type="button" className={`${control} ml-auto text-[var(--accent-text)]`} onClick={() => setOpen(false)}>Done</button>
    </div>}
  </div>;
}
