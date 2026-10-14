/** Brief, in-memory snapshots of numerical account screens. Never persisted. */
export const ACCOUNT_QUERY_SNAPSHOT_TTL_MS = 30_000;
export const ACCOUNT_QUERY_SNAPSHOT_LIMIT = 32;

export type AccountQuerySnapshot<T> = { data: T; fetchedAt: number };
export type AccountQueryCacheOptions = { key: string; scope: object };

type SessionCache = {
  scopes: WeakMap<object, number>;
  nextScope: number;
  entries: Map<string, AccountQuerySnapshot<unknown>>;
};

// An accepted AuthSession is stable across navigation, but is replaced after
// sign-out/reauthentication. A -> B -> A therefore cannot revive A's old data.
const sessions = new WeakMap<object, SessionCache>();

function cacheFor(session: object) {
  let cache = sessions.get(session);
  if (!cache) {
    cache = { scopes: new WeakMap(), nextScope: 0, entries: new Map() };
    sessions.set(session, cache);
  }
  return cache;
}

function entryKey(cache: SessionCache, scope: object, key: string) {
  let id = cache.scopes.get(scope);
  if (id === undefined) {
    id = cache.nextScope++;
    cache.scopes.set(scope, id);
  }
  return JSON.stringify([id, key]);
}

export function readAccountQuerySnapshot<T>(session: object, scope: object, key: string): AccountQuerySnapshot<T> | undefined {
  const cache = cacheFor(session);
  const id = entryKey(cache, scope, key);
  const entry = cache.entries.get(id);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt >= ACCOUNT_QUERY_SNAPSHOT_TTL_MS) {
    cache.entries.delete(id);
    return undefined;
  }
  cache.entries.delete(id);
  cache.entries.set(id, entry);
  return entry as AccountQuerySnapshot<T>;
}

export function writeAccountQuerySnapshot<T>(session: object, scope: object, key: string, snapshot: AccountQuerySnapshot<T>) {
  const cache = cacheFor(session);
  const id = entryKey(cache, scope, key);
  cache.entries.delete(id);
  cache.entries.set(id, snapshot);
  while (cache.entries.size > ACCOUNT_QUERY_SNAPSHOT_LIMIT) {
    const oldest = cache.entries.keys().next().value;
    if (oldest === undefined) break;
    cache.entries.delete(oldest);
  }
}

export function removeAccountQuerySnapshot(session: object, scope: object, key: string) {
  const cache = sessions.get(session);
  if (cache) cache.entries.delete(entryKey(cache, scope, key));
}
