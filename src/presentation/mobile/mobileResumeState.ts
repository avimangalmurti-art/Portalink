/** Small device-local navigation hints. Content and authorization remain server-owned. */
export const MOBILE_RESUME_TTL_MS = 24 * 60 * 60 * 1000;
export const MOBILE_RESUME_MAX_BYTES = 8 * 1024;
export const MOBILE_RESUME_MAX_FEED_ITEMS = 120;
const PREFIX = 'portalink.mobile-resume.v1:';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SEGMENT = '[A-Za-z0-9_-]{1,128}';
const PROFILE = new RegExp(`^/p/${SEGMENT}$`);
const CATEGORY = new RegExp(`^/p/${SEGMENT}/c/${SEGMENT}$`);
const PROJECT = new RegExp(`^/p/${SEGMENT}/c/${SEGMENT}/${SEGMENT}$`);
const CITY = new RegExp(`^/portalink/${SEGMENT}$`);
type ResumeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type MobileResumeStorageOptions = { storage?: ResumeStorage | null; now?: number };
export type MobileResumeFeedState = { scrollTop: number; loadedCount: number; anchorId?: string; anchorOffset?: number };
export type MobileResumeViewerState = {
  focusedPageNumber?: number | null;
  lastFocusedPageNumber?: number | null;
  zoom?: number;
  scrollTop?: number;
  scrollLeft?: number;
  pagesPerRow?: number;
  activeAttachmentId?: string | null;
  focusedPageId?: string | null;
  lastFocusedPageId?: string | null;
};
export type MobileResumeReaderState = {
  page?: number; zoom?: number; scrollTop?: number; scrollLeft?: number;
  entries?: Array<{ key: string; state: MobileResumeViewerState }>;
  view?: MobileResumeReaderView;
};
export type MobileResumeReaderView = { mode: 'focused'; attachmentId: string; page: number } | { mode: 'overview' };
export type MobileResumeRecord = {
  version: 1;
  accountId: string;
  savedAt: number;
  path: string;
  feed?: MobileResumeFeedState & { path: string };
  reader?: MobileResumeReaderState & { path: string };
};

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keysOnly = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const numberIn = (value: unknown, min: number, max: number, integer = false): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));

/** Explicitly exclude auth, settings, editing, search and action-bearing URLs. */
export function safeMobileResumePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/') || value.includes('#') || /[\\%\s]/.test(value)) return null;
  const [pathname, search = '', ...extra] = value.split('?');
  if (extra.length || (value.includes('?') && !search)) return null;
  const profile = PROFILE.test(pathname), project = PROJECT.test(pathname);
  if (!profile && !project && !CATEGORY.test(pathname) && !CITY.test(pathname) && !['/', '/portalink', '/studio', '/saved'].includes(pathname)) return null;
  const query = new URLSearchParams(search);
  const seen = new Set<string>();
  for (const [key, item] of query) {
    if (seen.has(key)) return null;
    seen.add(key);
    if (profile && key === 'view' && ['projects', 'portals', 'followers', 'following'].includes(item)) continue;
    if (project && ((key === 'media' && ID.test(item)) || (key === 'page' && /^[1-9]\d{0,4}$/.test(item) && Number(item) <= 10000) || (key === 'view' && item === 'page'))) continue;
    return null;
  }
  if (project && query.has('view') && (!query.has('media') || !query.has('page'))) return null;
  // Only declared ID segments and enum/numeric fields are emitted, never a URL token.
  return search ? `${pathname}?${query.toString()}` : pathname;
}

function feedState(value: unknown): MobileResumeRecord['feed'] | null {
  if (!object(value) || !keysOnly(value, ['path', 'scrollTop', 'loadedCount', 'anchorId', 'anchorOffset'])) return null;
  const path = safeMobileResumePath(value.path);
  if (!path || (path !== '/' && !CITY.test(path)) || !numberIn(value.scrollTop, 0, 1000000) || !numberIn(value.loadedCount, 0, MOBILE_RESUME_MAX_FEED_ITEMS, true)) return null;
  if (value.anchorId !== undefined && (typeof value.anchorId !== 'string' || !ID.test(value.anchorId))) return null;
  if (value.anchorOffset !== undefined && (!value.anchorId || !numberIn(value.anchorOffset, -20000, 20000))) return null;
  const result: MobileResumeFeedState & { path: string } = { path, scrollTop: value.scrollTop, loadedCount: value.loadedCount };
  if (typeof value.anchorId === 'string') result.anchorId = value.anchorId;
  if (typeof value.anchorOffset === 'number') result.anchorOffset = value.anchorOffset;
  return result;
}

function viewerKey(value: unknown, projectId: string): value is string {
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+){2,7}$/.test(value)) return false;
  const parts = value.split(':');
  if (parts[0] !== 'workspace' || parts[2] !== projectId) return false;
  if (parts[1] === 'project') return parts.length === 3 || (parts.length === 5 && parts[3] === 'density' && ID.test(parts[4]));
  if (parts[1] === 'images') return parts.length === 3 || (parts.length === 4 && ID.test(parts[3]));
  return parts[1] === 'document' && ID.test(parts[3]) && ['live', 'rendered'].includes(parts[4]) && (parts.length === 5 || (parts.length === 7 && parts[5] === 'page' && /^(?:0|[1-9]\d{0,4})$/.test(parts[6]) && Number(parts[6]) <= 10000));
}

function viewerState(value: unknown): MobileResumeViewerState | null {
  const keys = ['focusedPageNumber', 'lastFocusedPageNumber', 'zoom', 'scrollTop', 'scrollLeft', 'pagesPerRow', 'activeAttachmentId', 'focusedPageId', 'lastFocusedPageId'];
  if (!object(value) || !keysOnly(value, keys) || !Object.keys(value).length) return null;
  for (const field of ['focusedPageNumber', 'lastFocusedPageNumber']) {
    if (value[field] !== undefined && value[field] !== null && !numberIn(value[field], 0, 10000, true)) return null;
  }
  if (value.zoom !== undefined && !numberIn(value.zoom, 1, 8)) return null;
  if (value.scrollTop !== undefined && !numberIn(value.scrollTop, 0, 1000000)) return null;
  if (value.scrollLeft !== undefined && !numberIn(value.scrollLeft, 0, 1000000)) return null;
  if (value.pagesPerRow !== undefined && !numberIn(value.pagesPerRow, 1, 9, true)) return null;
  for (const field of ['activeAttachmentId', 'focusedPageId', 'lastFocusedPageId']) {
    if (value[field] !== undefined && value[field] !== null && (typeof value[field] !== 'string' || !ID.test(value[field] as string))) return null;
  }
  const result: MobileResumeViewerState = {};
  for (const key of keys) if (value[key] !== undefined) Object.assign(result, { [key]: value[key] });
  return Object.keys(result).length ? result : null;
}

/** The DOM supplies its actual one-based page, independent of renderer memory indexing. */
export function mobileResumeReaderView(value: unknown): MobileResumeReaderView | null {
  if (!object(value)) return null;
  if (value.mode === 'overview' && keysOnly(value, ['mode'])) return { mode: 'overview' };
  return value.mode === 'focused' && keysOnly(value, ['mode', 'attachmentId', 'page']) && typeof value.attachmentId === 'string' && ID.test(value.attachmentId) && numberIn(value.page, 1, 10000, true)
    ? { mode: 'focused', attachmentId: value.attachmentId, page: value.page } : null;
}

function readerState(value: unknown): MobileResumeRecord['reader'] | null {
  if (!object(value) || !keysOnly(value, ['path', 'page', 'zoom', 'scrollTop', 'scrollLeft', 'entries', 'view'])) return null;
  const path = safeMobileResumePath(value.path);
  if (!path || !PROJECT.test(path.split('?')[0])) return null;
  if (value.page !== undefined && !numberIn(value.page, 1, 10000, true)) return null;
  if (value.zoom !== undefined && !numberIn(value.zoom, 1, 8)) return null;
  if (value.scrollTop !== undefined && !numberIn(value.scrollTop, 0, 1000000)) return null;
  if (value.scrollLeft !== undefined && !numberIn(value.scrollLeft, 0, 1000000)) return null;
  let entries: MobileResumeReaderState['entries'];
  if (value.entries !== undefined) {
    if (!Array.isArray(value.entries) || !value.entries.length || value.entries.length > 6) return null;
    const seen = new Set<string>();
    entries = [];
    for (const entry of value.entries) {
      if (!object(entry) || !keysOnly(entry, ['key', 'state']) || !viewerKey(entry.key, path.split('?')[0].split('/')[5]) || seen.has(entry.key)) return null;
      const state = viewerState(entry.state);
      if (!state) return null;
      seen.add(entry.key); entries.push({ key: entry.key, state });
    }
  }
  const view = value.view === undefined ? undefined : mobileResumeReaderView(value.view);
  if (view === null) return null;
  if (!entries && !view && ['page', 'zoom', 'scrollTop', 'scrollLeft'].every(key => value[key] === undefined)) return null;
  const result: MobileResumeReaderState & { path: string } = { path };
  if (typeof value.page === 'number') result.page = value.page;
  if (typeof value.zoom === 'number') result.zoom = value.zoom;
  if (typeof value.scrollTop === 'number') result.scrollTop = value.scrollTop;
  if (typeof value.scrollLeft === 'number') result.scrollLeft = value.scrollLeft;
  if (entries) result.entries = entries;
  if (view) result.view = view;
  return result;
}

/** The live reader adapter uses this same whitelist before buffering any position. */
export function mobileResumeViewerEntry(path: string, key: unknown, state: unknown): { key: string; state: MobileResumeViewerState } | null {
  const safe = safeMobileResumePath(path);
  if (!safe || !PROJECT.test(safe.split('?')[0]) || !viewerKey(key, safe.split('?')[0].split('/')[5])) return null;
  const value = viewerState(state);
  return value ? { key, state: value } : null;
}

function localStorageFor(options: MobileResumeStorageOptions): ResumeStorage | null {
  if ('storage' in options) return options.storage ?? null;
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
const nowFor = (options: MobileResumeStorageOptions) => options.now ?? Date.now();
const keyFor = (accountId: string) => ID.test(accountId) ? `${PREFIX}${accountId}` : null;

export function clearMobileResume(accountId: string, options: MobileResumeStorageOptions = {}): void {
  const key = keyFor(accountId);
  if (!key) return;
  try { localStorageFor(options)?.removeItem(key); } catch { /* Optional convenience storage. */ }
}

export function readMobileResume(accountId: string, options: MobileResumeStorageOptions = {}): MobileResumeRecord | null {
  const key = keyFor(accountId), storage = localStorageFor(options), now = nowFor(options);
  if (!key || !storage || !numberIn(now, 0, Number.MAX_SAFE_INTEGER, true)) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = raw.length <= MOBILE_RESUME_MAX_BYTES ? JSON.parse(raw) : null;
    if (!object(value) || !keysOnly(value, ['version', 'accountId', 'savedAt', 'path', 'feed', 'reader']) || value.version !== 1 || value.accountId !== accountId || !numberIn(value.savedAt, Math.max(0, now - MOBILE_RESUME_TTL_MS), now, true)) throw new Error('Invalid resume hint');
    const path = safeMobileResumePath(value.path);
    const feed = value.feed === undefined ? undefined : feedState(value.feed);
    const reader = value.reader === undefined ? undefined : readerState(value.reader);
    if (!path || feed === null || reader === null) throw new Error('Invalid resume hint');
    return { version: 1, accountId, savedAt: value.savedAt, path, ...(feed ? { feed } : {}), ...(reader ? { reader } : {}) };
  } catch {
    try { storage.removeItem(key); } catch { /* Storage denial must not block opening. */ }
    return null;
  }
}

function save(accountId: string, path: string, patch: Partial<Pick<MobileResumeRecord, 'feed' | 'reader'>>, options: MobileResumeStorageOptions): boolean {
  const key = keyFor(accountId), storage = localStorageFor(options), savedAt = nowFor(options);
  if (!key || !storage || !numberIn(savedAt, 0, Number.MAX_SAFE_INTEGER, true)) return false;
  const previous = readMobileResume(accountId, { storage, now: savedAt });
  const record = { ...previous, version: 1, accountId, savedAt, path, ...patch };
  try {
    const raw = JSON.stringify(record);
    if (raw.length > MOBILE_RESUME_MAX_BYTES) return false;
    storage.setItem(key, raw);
    return true;
  } catch { return false; }
}

export function saveMobileResumeRoute(accountId: string, path: string, options: MobileResumeStorageOptions = {}): boolean {
  const safe = safeMobileResumePath(path);
  return safe !== null && save(accountId, safe, {}, options);
}

export function saveMobileResumeFeed(accountId: string, path: string, state: MobileResumeFeedState, options: MobileResumeStorageOptions = {}): boolean {
  const feed = feedState({ ...state, path });
  if (!feed) return false;
  return save(accountId, readMobileResume(accountId, options)?.path ?? feed.path, { feed }, options);
}

export function saveMobileResumeReader(accountId: string, path: string, state: MobileResumeReaderState, options: MobileResumeStorageOptions = {}): boolean {
  const reader = readerState({ ...state, path });
  if (!reader) return false;
  return save(accountId, readMobileResume(accountId, options)?.path ?? reader.path, { reader }, options);
}

/** Only a cold root launch uses this; an incoming explicit link always keeps its query. */
export function mobileResumeDestination(record: MobileResumeRecord): string {
  const [pathname, search] = record.path.split('?');
  if (!PROJECT.test(pathname) || record.reader?.path.split('?')[0] !== pathname) return record.path;
  const entries = record.reader.entries ?? [];
  const projectId = pathname.split('/')[5];
  const query = new URLSearchParams(search ?? '');
  const selected = entries.find(entry => entry.key === `workspace:project:${projectId}`)?.state.activeAttachmentId ?? query.get('media');
  const view = record.reader.view;
  if (view?.mode === 'focused') {
    query.set('media', view.attachmentId); query.set('page', String(view.page)); query.set('view', 'page');
    return safeMobileResumePath(`${pathname}?${query}`) ?? pathname;
  }
  if (view?.mode === 'overview') {
    if (selected) query.set('media', selected);
    query.delete('page'); query.delete('view');
    return safeMobileResumePath(query.size ? `${pathname}?${query}` : pathname) ?? pathname;
  }
  // Older checkpoints know the explicit URL mode, but cached numeric focus
  // alone cannot prove a canonical plain reader was still focused at exit.
  if (!search || !entries.length) return record.path;
  if (selected) query.set('media', selected);
  if (query.get('view') === 'page') {
    const parent = [...entries].reverse().find(entry => {
      const parts = entry.key.split(':');
      return parts[1] === 'document' && parts[3] === selected && parts.length === 5 && entry.state.focusedPageNumber !== undefined;
    });
    if (parent) {
      const focus = parent.state.focusedPageNumber;
      if (typeof focus === 'number') query.set('page', String(focus + (parent.key.endsWith(':rendered') ? 1 : 0)));
      else { query.delete('page'); query.delete('view'); }
    } else {
      const image = entries.find(entry => entry.key === `workspace:images:${projectId}`)?.state.focusedPageId;
      if (image) query.set('media', image);
      else if (image === null) { query.delete('page'); query.delete('view'); }
    }
  } else {
    // Vertical reading restores its measured scroll, rather than replaying the original linked page.
    query.delete('page');
  }
  const result = query.size ? `${pathname}?${query}` : pathname;
  return safeMobileResumePath(result) ?? pathname;
}

export type MobileResumeSessionInput = {
  mobile: boolean;
  accountId: string | null;
  authReady: boolean;
  pathname: string;
  search?: string;
  hash?: string;
  locationKey: string;
  blocked?: boolean;
};

/** A launch may choose a destination once; normal navigation never replays it. */
export class MobileResumeSession {
  private readonly opening: MobileResumeSessionInput;
  private consumed: boolean;
  private account: string | null | undefined;
  private selected: string | null = null;
  private record: MobileResumeRecord | null = null;
  private identityChangedEntry: string | null = null;
  constructor(initial: MobileResumeSessionInput) {
    this.opening = { ...initial };
    this.consumed = !initial.mobile || initial.pathname !== '/' || Boolean(initial.search || initial.hash);
  }
  update(input: MobileResumeSessionInput, read: (accountId: string) => MobileResumeRecord | null = readMobileResume): string | null {
    const sameOpening = input.locationKey === this.opening.locationKey && input.pathname === this.opening.pathname && (input.search ?? '') === (this.opening.search ?? '') && (input.hash ?? '') === (this.opening.hash ?? '');
    if (!input.mobile || input.blocked) this.record = null;
    if (!input.mobile || !sameOpening || input.blocked) { this.consumed = true; this.selected = null; }
    if (this.account !== undefined && this.account !== input.accountId) {
      this.consumed = true; this.selected = null; this.record = null; this.identityChangedEntry = input.locationKey;
    }
    if (!input.authReady) return null;
    this.account = input.accountId;
    if (!this.consumed) {
      this.consumed = true;
      const saved = input.accountId ? read(input.accountId) : null;
      this.record = saved;
      this.selected = saved && saved.path !== '/' ? mobileResumeDestination(saved) : null;
    }
    return this.selected;
  }
  get launchRecord(): MobileResumeRecord | null { return this.record; }
  canCheckpoint(input: MobileResumeSessionInput): boolean {
    return input.mobile && input.authReady && Boolean(input.accountId) && this.account === input.accountId && !input.blocked && !this.selected && this.identityChangedEntry !== input.locationKey;
  }
}
