import { useEffect, useLayoutEffect, useMemo } from 'react';
import type React from 'react';
import type { Location, NavigateFunction } from 'react-router-dom';
import { beginProjectContinuity } from '../utils/projectContinuity';

type CatalogueOrigin = {
  key: string; path: string; index: number; x: number; y: number;
  opener: HTMLElement | null; anchor: HTMLElement | null; anchorTop: number;
  cardId?: string;
};
type ReaderEntry = { index: number; projectId: string; origin: CatalogueOrigin | null };

function historyIndex(): number | null {
  const value: unknown = window.history.state?.idx;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
function visible(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
    && rect.right > 0 && rect.left < window.innerWidth;
}

/** A bounded layout correction, owned by this return and surrendered to new input. */
export function restoreVisitorCatalogue(origin: CatalogueOrigin, root: HTMLElement, restoreFocus = true): () => void {
  let frame = 0, attempts = 0, stable = 0, stopped = false;
  const events = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
  const stop = () => {
    stopped = true; cancelAnimationFrame(frame);
    events.forEach(event => window.removeEventListener(event, stop, true));
  };
  // A hidden measured wall can recreate its cards at the same keyed position.
  // Match that same project only; a genuinely removed source falls back below.
  const source = () => origin.opener?.isConnected && root.contains(origin.opener) ? origin.opener
    : origin.cardId ? [...root.querySelectorAll<HTMLElement>('[data-preview-open]')].find(element => element.dataset.projectContinuityId === origin.cardId) ?? null : null;
  const focus = () => {
    if (!restoreFocus) return;
    const opener = source();
    const target = opener && root.contains(opener) && visible(opener) ? opener
      : root.querySelector<HTMLElement>('h1[tabindex="-1"]') ?? root.closest<HTMLElement>('main');
    target?.focus({ preventScroll: true });
  };
  const restore = () => {
    if (stopped || !root.isConnected) { stop(); return; }
    const anchor = origin.anchor?.isConnected ? origin.anchor : source();
    const rect = anchor?.isConnected && root.contains(anchor) ? anchor.getBoundingClientRect() : null;
    const y = rect && rect.height > 0 ? window.scrollY + rect.top - origin.anchorTop : origin.y;
    window.scrollTo({ left: origin.x, top: Math.max(0, y), behavior: 'instant' });
    stable = Math.abs(window.scrollY - Math.max(0, y)) < 1 ? stable + 1 : 0;
    if (stable >= 3 || ++attempts >= 36) { focus(); stop(); }
    else frame = requestAnimationFrame(restore);
  };
  events.forEach(event => window.addEventListener(event, stop, { capture: true, passive: true }));
  restore();
  return stop;
}

/** Only public MOBILE project entries opened here may traverse back to their catalogue.
 * Memory is account/creator scoped, never inferred from an arbitrary history length
 * or an untrusted URL/state value. Reloaded/deep links use the catalogue fallback.
 */
export function useMobileProjectReturn({ enabled, scope, location, projectId, catalogueReady, otherScreen = false, navigate }: {
  enabled: boolean; scope: string; location: Location; projectId: string | null;
  catalogueReady: boolean; otherScreen?: boolean; navigate: NavigateFunction;
}) {
  const memory = useMemo(() => ({ scope, enabled, origin: null as CatalogueOrigin | null, reader: null as ReaderEntry | null,
    opener: null as HTMLElement | null, busy: false, restored: '', entered: '', fromReader: false, fromOther: false,
    positions: new Map<string, { x: number; y: number; pathname: string }>() }), [enabled, scope]);
  const entry = location.key + location.pathname + location.search + location.hash;
  useLayoutEffect(() => {
    if (!enabled) return;
    memory.busy = false;
    if (otherScreen) { memory.fromReader = false; memory.fromOther = true; memory.restored = ''; return; }
    if (projectId) {
      memory.fromReader = true;
      memory.fromOther = false;
      memory.restored = '';
      if (memory.entered !== entry) {
        memory.entered = entry;
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
      return;
    }
    memory.entered = '';
    if (!catalogueReady || memory.restored === entry) return;
    const root = document.querySelector<HTMLElement>('[data-public-portfolio-grid]');
    if (!root) return;
    memory.restored = entry;
    const fromReader = memory.fromReader;
    const origin = fromReader ? memory.origin : null;
    memory.fromReader = false;
    if (origin && historyIndex() === origin.index) return restoreVisitorCatalogue(origin, root);
    // Collaboration's established Back pushes the same catalogue path; preserve
    // that ordinary scroll behavior without changing its navigation contract.
    const position = memory.positions.get(entry) ?? (memory.fromOther
      ? [...memory.positions.values()].reverse().find(value => value.pathname === location.pathname) : undefined);
    memory.fromOther = false;
    if (position) return restoreVisitorCatalogue({ key: location.key, path: location.pathname, index: historyIndex() ?? 0,
      ...position, opener: null, anchor: null, anchorTop: 0 }, root, false);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // A directly opened project has no opener. Its replacement catalogue still
    // receives a useful focus target, without hijacking an ordinary first visit.
    if (fromReader) root.querySelector<HTMLElement>('h1[tabindex="-1"]')?.focus({ preventScroll: true });
  }, [enabled, memory, entry, projectId, catalogueReady, otherScreen, location.key, location.pathname]);
  useLayoutEffect(() => {
    if (!enabled || !catalogueReady) return;
    const remember = () => {
      const root = document.querySelector<HTMLElement>('[data-public-portfolio-grid]');
      if (!root?.isConnected || root.hidden) return;
      memory.positions.delete(entry);
      memory.positions.set(entry, { x: window.scrollX, y: window.scrollY, pathname: location.pathname });
      const oldest = memory.positions.keys().next().value;
      if (memory.positions.size > 16 && oldest !== undefined) memory.positions.delete(oldest);
    };
    window.addEventListener('scroll', remember, { passive: true });
    document.addEventListener('portalink-before-navigation', remember);
    return () => {
      window.removeEventListener('scroll', remember);
      document.removeEventListener('portalink-before-navigation', remember);
    };
  }, [enabled, memory, entry, catalogueReady, location.pathname]);
  // Modal cleanup releases any inert reader before route focus is transferred.
  // This also runs for Forward to the same reader history entry.
  useEffect(() => {
    if (enabled && projectId) document.querySelector<HTMLElement>('#app-viewport main')?.focus({ preventScroll: true });
  }, [enabled, memory, entry, projectId]);

  const readerOrigin = () => memory.reader?.index === historyIndex() && memory.reader.projectId === projectId
    ? memory.reader.origin : null;
  return {
    captureOpener(event: React.MouseEvent<HTMLDivElement>) {
      if (enabled && event.target instanceof Element) {
        const opener = event.target.closest<HTMLElement>('button, a[href]');
        memory.opener = opener;
        // Capture belongs to this activation, not a later sibling popup action.
        void Promise.resolve().then(() => { if (memory.opener === opener) memory.opener = null; });
      }
    },
    open(path: string, id: string) {
      if (!enabled) { beginProjectContinuity(id); navigate(path); return; }
      if (memory.busy) return;
      const index = historyIndex();
      let origin = projectId ? readerOrigin() : null;
      if (!projectId && catalogueReady && index !== null) {
        const root = document.querySelector<HTMLElement>('[data-public-portfolio-grid]');
        const focused = document.activeElement instanceof HTMLElement && document.activeElement.matches('[data-preview-open], .journey-title, .employer-start, .journey-pair button') ? document.activeElement : null;
        const candidate = memory.opener ?? focused;
        memory.opener = null;
        const opener = root?.contains(candidate) && visible(candidate) ? candidate : null;
        const anchor = opener ?? (root ? [...root.querySelectorAll<HTMLElement>('[data-preview-open], .journey-title')].find(visible) : null) ?? null;
        origin = { key: location.key, path: location.pathname + location.search + location.hash, index,
          x: window.scrollX, y: window.scrollY, opener, anchor, anchorTop: anchor?.getBoundingClientRect().top ?? 0,
          ...(opener?.matches('[data-preview-open]') ? { cardId: id } : {}) };
        memory.origin = origin;
      }
      memory.busy = true;
      memory.reader = index === null ? null : { index: index + (projectId ? 0 : 1), projectId: id, origin };
      beginProjectContinuity(id);
      navigate(path, { replace: Boolean(projectId) });
    },
    close(fallback: string): boolean {
      if (!enabled || !projectId) return false;
      if (memory.busy) return true;
      memory.busy = true;
      const origin = readerOrigin();
      if (origin) navigate(-1);
      else navigate(fallback, { replace: true });
      return true;
    },
  };
}
