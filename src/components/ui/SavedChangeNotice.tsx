import { useEffect, useRef } from 'react';
import type { SavedChangeActions } from '../../hooks/useSavedChangeHistory';

export function SavedChangeNotice({ history }: { history: SavedChangeActions }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      const surface = ref.current?.closest('[data-saved-change-scope]');
      if (!surface || !ref.current?.getClientRects().length || !target || target.closest('[data-saved-change-scope]') !== surface || target.closest('input,textarea,[contenteditable="true"],[role="dialog"],[role="alertdialog"]')) return;
      const redo = event.shiftKey;
      if (redo ? !history.canRedo : !history.canUndo) return;
      event.preventDefault(); void (redo ? history.redo() : history.undo());
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [history]);
  // Reordering is visible immediately; it needs no persistent success banner.
  const latestLabel = history.redoLabel ?? history.undoLabel;
  if (!latestLabel || /^Reorder (portals|projects)$/.test(latestLabel)) return null;
  return <div ref={ref} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--hairline)] bg-[var(--surface-raised)] px-3 py-1 text-sm">
    <span role="status" className="min-w-0 flex-1 text-[var(--text-secondary)]">{history.isSaving ? 'Saving…' : history.redoLabel ? 'Change undone' : 'Changes saved'}</span>
    <button type="button" disabled={!history.canUndo} aria-label={history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : 'Undo'} aria-keyshortcuts="Control+z Meta+z" onClick={() => void history.undo()} className="min-h-11 rounded-lg px-2 font-semibold text-[var(--accent-text)] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Undo</button>
    {history.redoLabel && <button type="button" disabled={!history.canRedo} aria-label={`Redo ${history.redoLabel.toLowerCase()}`} aria-keyshortcuts="Control+Shift+z Meta+Shift+z" onClick={() => void history.redo()} className="min-h-11 rounded-lg px-2 font-semibold text-[var(--accent-text)] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Redo</button>}
  </div>;
}
