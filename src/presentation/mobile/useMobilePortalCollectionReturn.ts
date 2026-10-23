import { useLayoutEffect, useRef } from 'react';
import { useNavigate, type Location, type NavigationType } from 'react-router-dom';

type RouteEntry = Pick<Location, 'key' | 'pathname' | 'search' | 'hash'>;
type BrowserEntry = { state: unknown; pathname: string; search: string; hash: string };
type Entry = RouteEntry & { index: number };
type Collection = { categoryPath: string; profilePath: string; owner: boolean };
const ENTRY_LIMIT = 32;
const path = (value: string) => value.replace(/\/+$/, '') || '/';

function committedEntry(location: RouteEntry, browser: BrowserEntry): Entry | null {
  const state = browser.state as { idx?: unknown; key?: unknown } | null;
  const index = state?.idx;
  const key = state?.key ?? (index === 0 ? 'default' : undefined);
  return Number.isSafeInteger(index) && (index as number) >= 0 && key === location.key &&
    browser.pathname === location.pathname && browser.search === location.search && browser.hash === location.hash
    ? { ...location, index: index as number } : null;
}

function isCollection(entry: Entry, collection: Collection): boolean {
  if (collection.owner && path(entry.pathname) === '/portals') return true;
  if (path(entry.pathname) !== path(collection.profilePath)) return false;
  const query = new URLSearchParams(entry.search);
  return query.getAll('view').length <= 1 && ['projects', 'portals'].includes(query.get('view') ?? 'projects');
}

/** Observed Portal predecessors only; never reconstruct or rewrite browser history. */
export class MobilePortalCollectionHistory {
  private scope: string | null = null;
  private entries = new Map<number, Entry>();
  private current: Entry | null = null;
  private returningKey: string | null = null;

  observe(scope: string | null, location: RouteEntry, action: NavigationType, browser: BrowserEntry): void {
    if (scope !== this.scope) {
      this.scope = scope;
      this.entries.clear();
      this.current = null;
      this.returningKey = null;
    }
    if (!scope) return;
    const entry = committedEntry(location, browser);
    if (!entry) return;
    if (entry.key !== this.current?.key) {
      this.returningKey = null;
      // A new PUSH replaces the browser's forward branch. POP preserves it.
      if (action === 'PUSH') for (const index of this.entries.keys()) if (index >= entry.index) this.entries.delete(index);
    }
    this.entries.delete(entry.index);
    this.entries.set(entry.index, entry);
    this.current = entry;
    while (this.entries.size > ENTRY_LIMIT) this.entries.delete(this.entries.keys().next().value as number);
  }

  returnToCollection(scope: string | null, location: RouteEntry, browser: BrowserEntry, collection: Collection, go: (delta: number) => void): boolean {
    if (!scope || scope !== this.scope) return false;
    const entry = committedEntry(location, browser);
    // A previous tap may already have changed native history before React commits.
    if (this.returningKey === location.key) return true;
    if (!entry) return this.current?.key === location.key;
    if (this.current?.key !== entry.key || this.current.index !== entry.index || path(entry.pathname) !== path(collection.categoryPath)) return false;
    for (let distance = 1; distance < ENTRY_LIMIT && distance <= entry.index; distance++) {
      const previous = this.entries.get(entry.index - distance);
      if (!previous) return false;
      if (path(previous.pathname) === path(collection.categoryPath)) continue;
      if (!isCollection(previous, collection)) return false;
      this.returningKey = entry.key;
      go(-distance);
      return true;
    }
    return false;
  }
}

const browserEntry = (): BrowserEntry => ({ state: window.history.state, pathname: window.location.pathname, search: window.location.search, hash: window.location.hash });

/** Dismiss the MOBILE project chooser to its real opener, including either Portals URL. */
export function useMobilePortalCollectionReturn(scope: string | null, location: RouteEntry, action: NavigationType) {
  const history = useRef(new MobilePortalCollectionHistory());
  const navigate = useNavigate();
  useLayoutEffect(() => {
    history.current.observe(scope, location, action, browserEntry());
  }, [scope, location, action]);
  return (collection: Collection) => history.current.returnToCollection(scope, location, browserEntry(), collection, delta => navigate(delta));
}
