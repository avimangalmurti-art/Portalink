import React from 'react';

/** Quiet row metadata; zero/unresolved references reserve no space. */
export function StudioReferenceChip({ count, onOpen, disabled = false }: { count: number; onOpen: () => void; disabled?: boolean }) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return <button type="button" data-studio-row-control="" className="flex min-h-11 shrink-0 items-center px-1 text-[11px] text-[var(--text-secondary)] disabled:opacity-50" aria-label={`Open ${count} references`} disabled={disabled} onClick={onOpen}>
    <span className="rounded-md border border-[var(--hairline)] bg-[var(--surface-sunken)] px-2 py-0.5">{count} references</span>
  </button>;
}
