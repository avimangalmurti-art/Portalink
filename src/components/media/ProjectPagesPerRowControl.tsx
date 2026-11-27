import React from 'react';
import { MAX_PAGES_PER_ROW, MIN_PAGES_PER_ROW, normalizePagesPerRow } from '../../features/projects/pageLayout';

type ProjectPagesPerRowControlProps = {
  value: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  saving?: boolean;
};

export function ProjectPagesPerRowControl({ value, onChange, onCommit, saving }: ProjectPagesPerRowControlProps) {
  const commit = onCommit ? (event: React.SyntheticEvent<HTMLInputElement>) => onCommit(Number(event.currentTarget.value)) : undefined;
  const densityLabel = `${value} ${value === 1 ? 'page' : 'pages'} per row`;
  return <label className="relative flex h-full min-w-[104px] max-w-[136px] flex-1 items-center justify-center px-1"
    title={onCommit ? 'Set the number of pages viewers see in each row when they open this project' : 'Set the number of pages per row in your view'}>
    <input
      data-pages-per-row-slider=""
      type="range"
      min={MIN_PAGES_PER_ROW}
      max={MAX_PAGES_PER_ROW}
      step={1}
      value={value}
      disabled={saving}
      onChange={event => onChange(normalizePagesPerRow(Number(event.currentTarget.value)))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
      aria-label="Pages per row"
      aria-valuetext={densityLabel}
      className="h-1 w-full cursor-pointer accent-[var(--accent-primary)] disabled:cursor-wait disabled:opacity-50"
    />
    <span data-pages-per-row-label="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[calc(50%+11px)] -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-none tabular-nums text-[var(--text-secondary)]">{densityLabel}</span>
  </label>;
}
