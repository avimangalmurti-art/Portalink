import { useCallback, useEffect, useRef, useState } from 'react';

export type HistoryWriteMode = 'change' | 'undo' | 'redo';
type Entry<T> = { before: T; after: T; label: string; undone: boolean };
type Token<T> = { version: number; mode: HistoryWriteMode; entry: Entry<T> | null };
export type SavedChangeActions = {
  canUndo: boolean; canRedo: boolean; isSaving: boolean;
  undoLabel: string | null; redoLabel: string | null;
  undo: () => Promise<boolean>; redo: () => Promise<boolean>;
};
export const membershipSignature = (ids: readonly string[]) => JSON.stringify([...new Set(ids)].sort());

/** One persisted change, scoped to its owner and record membership. */
export function useSavedChangeHistory<T>({ scope, membership, value, equals }: {
  scope: string | null; membership: string; value: T | null; equals: (a: T, b: T) => boolean;
}) {
  const [, render] = useState(0);
  const mounted = useRef(true);
  const context = useRef({ scope, membership, version: 0 });
  const entry = useRef<Entry<T> | null>(null);
  const active = useRef<Token<T> | null>(null);
  const compare = useRef(equals); compare.current = equals;
  if (scope !== context.current.scope || membership !== context.current.membership) {
    context.current = { scope, membership, version: context.current.version + 1 };
    entry.current = null;
  }
  if (!active.current && entry.current && value !== null && !equals(value, entry.current.undone ? entry.current.before : entry.current.after)) entry.current = null;
  const version = context.current.version;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(() => { if (mounted.current) render(v => v + 1); }, []);
  const begin = useCallback((mode: HistoryWriteMode = 'change') => {
    if (!mounted.current || !context.current.scope || context.current.version !== version || active.current) return null;
    if (mode === 'undo' && (!entry.current || entry.current.undone)) return null;
    if (mode === 'redo' && !entry.current?.undone) return null;
    const token: Token<T> = { version, mode, entry: entry.current };
    active.current = token; refresh(); return token;
  }, [version, refresh]);
  const isCurrent = useCallback((token: Token<T>) => mounted.current && active.current === token && context.current.version === token.version, []);
  const complete = useCallback((token: Token<T>, before: T | null, after: T, label: string) => {
    if (!isCurrent(token)) return;
    if (token.mode === 'change') {
      if (before === null) entry.current = null;
      else if (!compare.current(before, after)) entry.current = { before, after, label, undone: false };
    } else if (token.entry && entry.current === token.entry && compare.current(after, token.mode === 'undo' ? token.entry.before : token.entry.after)) {
      entry.current = { ...token.entry, undone: token.mode === 'undo' };
    } else entry.current = null;
  }, [isCurrent]);
  const finish = useCallback((token: Token<T>) => { if (active.current === token) { active.current = null; refresh(); } }, [refresh]);
  const replay = useCallback((mode: 'undo' | 'redo', write: (next: T, mode: HistoryWriteMode) => Promise<boolean>) => {
    const saved = entry.current;
    if (!mounted.current || !context.current.scope || context.current.version !== version || active.current || !saved || (mode === 'undo' ? saved.undone : !saved.undone)) return Promise.resolve(false);
    return write(mode === 'undo' ? saved.before : saved.after, mode);
  }, [version]);
  return { begin, isCurrent, complete, finish, replay,
    isSaving: active.current !== null,
    canUndo: Boolean(scope && !active.current && entry.current && !entry.current.undone),
    canRedo: Boolean(scope && !active.current && entry.current?.undone),
    undoLabel: entry.current && !entry.current.undone ? entry.current.label : null,
    redoLabel: entry.current?.undone ? entry.current.label : null,
  };
}
