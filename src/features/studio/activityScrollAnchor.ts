import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

type Options = { enabled: boolean; active: boolean; scope: object; list: RefObject<HTMLElement>; rowsKey: string };
type Owner = { node: HTMLElement; target: EventTarget; document: boolean };
type Geometry = { height: number; width: number; viewport: string };
type Reading = Geometry & { id: string | null; row: HTMLElement | null; offset: number; top: number };
type State = { scope: object; owner: Owner; rowsKey: string; reading: Reading | null; returning: boolean; interrupted: boolean };

function scrollOwner(list: HTMLElement): Owner | null {
  const root = document.scrollingElement ?? document.documentElement;
  for (let node: HTMLElement | null = list; node && node !== root && node !== document.body; node = node.parentElement) {
    if (/(?:auto|scroll|overlay)/.test(window.getComputedStyle(node).overflowY)) return { node, target: node, document: false };
  }
  return root instanceof HTMLElement ? { node: root, target: document, document: true } : null;
}

function geometry(owner: Owner): Geometry {
  const viewport = window.visualViewport;
  return {
    height: owner.node.clientHeight, width: owner.node.clientWidth,
    viewport: `${window.innerWidth}:${window.innerHeight}:${viewport?.width ?? ''}:${viewport?.height ?? ''}:${viewport?.offsetTop ?? ''}:${viewport?.offsetLeft ?? ''}`,
  };
}

function sameGeometry(reading: Geometry, owner: Owner) {
  const next = geometry(owner);
  return reading.height === next.height && reading.width === next.width && reading.viewport === next.viewport;
}

function bounds(owner: Owner) {
  const rect = owner.document ? { top: 0, bottom: window.innerHeight } : owner.node.getBoundingClientRect();
  return { top: Math.max(0, rect.top), bottom: Math.min(window.innerHeight, rect.bottom) };
}

function visible(list: HTMLElement | null, owner: Owner): list is HTMLElement {
  if (document.visibilityState === 'hidden' || !list?.isConnected || !owner.node.isConnected || list.closest('[inert], [aria-hidden="true"]') || !list.getClientRects().length || owner.node.clientHeight <= 0 || owner.node.clientWidth <= 0) return false;
  const rect = list.getBoundingClientRect(), viewport = bounds(owner);
  return rect.width > 0 && rect.height > 0 && viewport.bottom > viewport.top && rect.bottom > viewport.top && rect.top < viewport.bottom;
}

function read(list: HTMLElement, owner: Owner): Reading {
  const position: Reading = { ...geometry(owner), id: null, row: null, offset: 0, top: owner.node.scrollTop };
  if (position.top <= 0) return position;
  const rows = list.querySelectorAll<HTMLElement>('[data-studio-row]'), viewport = bounds(owner);
  let low = 0, high = rows.length, measurements = 0;
  // Activity is ordered in document flow; locate its first visible row without
  // measuring every update on each scroll event.
  while (low < high && measurements++ < 16) {
    const middle = (low + high) >>> 1;
    if (rows[middle].getBoundingClientRect().bottom <= viewport.top) low = middle + 1;
    else high = middle;
  }
  const row = rows[low], rect = row?.getBoundingClientRect();
  if (row?.dataset.studioRow && rect && rect.top < viewport.bottom && rect.bottom > viewport.top) {
    position.id = row.dataset.studioRow; position.row = row; position.offset = rect.top - viewport.top;
  }
  return position;
}

function restore(list: HTMLElement, current: State, rowsKey: string): boolean {
  if (!visible(list, current.owner)) return false;
  const saved = current.reading;
  const canReturn = !current.returning || !current.interrupted && saved && Math.abs(saved.top - current.owner.node.scrollTop) < 0.5 && sameGeometry(saved, current.owner);
  current.rowsKey = rowsKey;
  current.returning = false;
  if (canReturn && saved && sameGeometry(saved, current.owner) && saved.id && saved.top > 0) {
    const row = saved.row?.isConnected && list.contains(saved.row) && saved.row.dataset.studioRow === saved.id ? saved.row
      : [...list.querySelectorAll<HTMLElement>('[data-studio-row]')].find(item => item.dataset.studioRow === saved.id);
    if (row) {
      const delta = row.getBoundingClientRect().top - bounds(current.owner).top - saved.offset;
      if (Math.abs(delta) > 0.5) current.owner.node.scrollTop += delta;
    }
  }
  if (!canReturn || !saved || sameGeometry(saved, current.owner)) current.reading = read(list, current.owner);
  return true;
}

/** Keep MOBILE Activity's reading anchor across refreshed rows without owning focus or navigation. */
export function useActivityScrollAnchor({ enabled, active, scope, list, rowsKey }: Options): void {
  const latest = useRef({ enabled, active, scope, list, rowsKey });
  latest.current = { enabled, active, scope, list, rowsKey };
  const state = useRef<State | null>(null);
  const retained = useRef<State | null>(null);

  useLayoutEffect(() => {
    state.current = null;
    if (!enabled || retained.current?.scope !== scope) retained.current = null;
    const node = list.current;
    if (!enabled || !active || !node) return () => {
      if (!latest.current.active) retained.current = null;
    };
    const owner = scrollOwner(node);
    if (!owner) return;
    const previousAnchor = owner.node.style.overflowAnchor;
    owner.node.style.overflowAnchor = 'none';
    const saved = retained.current;
    retained.current = null;
    const available = visible(node, owner);
    // A retained screen may receive new rows while another route owns layout.
    // Compensate on return only if navigation restored the same reading top;
    // a different top/owner/viewport belongs to navigation or the user.
    const resume = saved?.scope === scope && saved.owner.node === owner.node && saved.owner.document === owner.document && saved.reading && saved.rowsKey !== latest.current.rowsKey;
    const resumed = resume ? saved : null;
    const current: State = { scope, owner, rowsKey: resumed?.rowsKey ?? latest.current.rowsKey, reading: resumed?.reading ?? (available ? read(node, owner) : null), returning: Boolean(resumed), interrupted: false };
    state.current = current;
    const save = () => {
      const next = latest.current;
      if (state.current !== current || !next.enabled || !next.active || next.scope !== scope || !visible(next.list.current, owner)) return;
      // Navigation may emit its saved-top scroll before this child's deferred
      // return correction. Keep the original row until that correction runs.
      if (current.returning) {
        if (current.reading && Math.abs(current.reading.top - owner.node.scrollTop) >= 0.5) current.interrupted = true;
        return;
      }
      // An unannounced size change has another owner. Wait for its resize
      // event or a deliberate scroll before replacing the prior geometry.
      if (current.reading && !sameGeometry(current.reading, owner)) return;
      current.reading = read(next.list.current, owner);
    };
    const resetGeometry = () => {
      if (state.current === current && current.reading && !sameGeometry(current.reading, owner)) current.reading = null;
    };
    const userScroll = (event: Event) => {
      const target = event.target;
      if (state.current === current && current.returning) current.interrupted = true;
      if (state.current !== current || !(target instanceof HTMLElement) || (!owner.document && !owner.node.contains(target))) return;
      if (event.type === 'keydown' && (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes((event as KeyboardEvent).key) || target.matches('input, textarea, select, [contenteditable="true"]'))) return;
      // A deliberate gesture after a resize can establish a new anchor even
      // when an ancestor changed size without a window resize event.
      if (current.reading && !sameGeometry(current.reading, owner)) resetGeometry();
    };
    owner.target.addEventListener('scroll', save, { passive: true });
    const interruptReturn = () => { if (state.current === current && current.returning) current.interrupted = true; };
    document.addEventListener('pointerdown', interruptReturn, { capture: true, passive: true });
    for (const type of ['wheel', 'touchstart', 'keydown']) document.addEventListener(type, userScroll, { capture: true, passive: true });
    window.addEventListener('resize', resetGeometry, { passive: true });
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', resetGeometry, { passive: true });
    viewport?.addEventListener('scroll', resetGeometry, { passive: true });
    return () => {
      owner.target.removeEventListener('scroll', save);
      document.removeEventListener('pointerdown', interruptReturn, true);
      for (const type of ['wheel', 'touchstart', 'keydown']) document.removeEventListener(type, userScroll, true);
      window.removeEventListener('resize', resetGeometry);
      viewport?.removeEventListener('resize', resetGeometry);
      viewport?.removeEventListener('scroll', resetGeometry);
      owner.node.style.overflowAnchor = previousAnchor;
      const next = latest.current;
      // Keep only the last captured reading; cleanup must never measure an
      // already hidden retained screen.
      retained.current = next.enabled && !next.active && next.scope === scope ? current : null;
      if (state.current === current) state.current = null;
    };
  }, [enabled, active, scope, list]);

  useLayoutEffect(() => {
    const current = state.current, node = list.current;
    if (!enabled || !active || !current || current.scope !== scope || current.rowsKey === rowsKey) return;
    if (node) restore(node, current, rowsKey);
  }, [enabled, active, scope, list, rowsKey]);

  useEffect(() => {
    const current = state.current;
    if (!enabled || !active || !current?.returning || current.scope !== scope) return;
    const finishReturn = () => {
      const next = latest.current, node = next.list.current;
      if (state.current !== current || !next.enabled || !next.active || next.scope !== scope || !current.returning || !node) return true;
      return restore(node, current, next.rowsKey);
    };
    // Parent ScreenLayers removes retained-screen inertness in its own layout
    // phase, after child layout effects. One passive attempt and at most one
    // frame handle that ordering without polling or measuring a hidden list.
    if (finishReturn()) return;
    const frame = requestAnimationFrame(finishReturn);
    return () => cancelAnimationFrame(frame);
  }, [enabled, active, scope, list, rowsKey]);
}
