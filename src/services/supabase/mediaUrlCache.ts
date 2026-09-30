import { requireSupabase } from './client';

const SIGNED_URL_SECONDS = 6 * 60 * 60;
const REFRESH_BUFFER_MS = 5 * 60_000;
const MAX_ENTRIES = 4096;
type Entry = { expiresAt: number; value: Promise<string | null> };
type Scope = { accountId: string | null | undefined; generation: number; entries: Map<string, Entry> };
const scopes = new WeakMap<object, Scope>();

async function mediaScope() {
  const client = requireSupabase();
  let scope = scopes.get(client);
  if (!scope) {
    scope = { accountId: undefined, generation: 0, entries: new Map() };
    scopes.set(client, scope);
    const observedScope = scope;
    // Do not await SDK operations inside this callback. A refreshed token for
    // the same account keeps valid URLs; sign-out/account changes never do.
    client.auth.onAuthStateChange((event, session) => {
      const accountId = session?.user.id ?? null;
      if (event === 'SIGNED_OUT' || (observedScope.accountId !== undefined && observedScope.accountId !== accountId)) {
        observedScope.generation += 1;
        observedScope.entries.clear();
      }
      observedScope.accountId = accountId;
    });
  }
  const generation = scope.generation;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (generation !== scope.generation) throw new Error('Your session changed. Please try again.');
  const accountId = data.session?.user.id ?? null;
  if (scope.accountId !== undefined && scope.accountId !== accountId) {
    scope.generation += 1;
    scope.entries.clear();
  }
  scope.accountId = accountId;
  const now = Date.now();
  for (const [key, entry] of scope.entries) {
    if (entry.expiresAt <= now) scope.entries.delete(key);
  }
  return { client, scope, generation: scope.generation };
}

function store(scope: Scope, key: string, value: Promise<string | null>, lifetimeMs: number) {
  const entry = { value, expiresAt: Date.now() + lifetimeMs };
  scope.entries.set(key, entry);
  while (scope.entries.size > MAX_ENTRIES) {
    const oldest = scope.entries.keys().next().value;
    if (oldest === undefined) break;
    scope.entries.delete(oldest);
  }
  // Failed/missing objects can be retried immediately after processing finishes.
  void value.then((url) => {
    if (!url && scope.entries.get(key) === entry) scope.entries.delete(key);
  }, () => {
    if (scope.entries.get(key) === entry) scope.entries.delete(key);
  });
  return entry;
}

/** Reuse URLs only in memory and only for the current account. The RLS-backed
 * content read still precedes signing; this cache grants no project access. */
export async function signedMediaUrls(bucket: string, paths: string[], minimumLifetimeMs = 0, singleBatch = false): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { client, scope, generation } = await mediaScope();
  const cacheKey = (path: string) => `signed:${bucket}:${path}`;
  const missing = unique.filter((path) => {
    const entry = scope.entries.get(cacheKey(path));
    return !entry || entry.expiresAt <= Date.now() + minimumLifetimeMs;
  });
  const values = new Map(unique.map((path) => [path, scope.entries.get(cacheKey(path))?.value]));
  let previousBatch: Promise<unknown> = Promise.resolve();
  // Keep signing requests bounded for long PDFs and multipart files.
  const batchSize = singleBatch ? Math.max(1, missing.length) : 100;
  for (let start = 0; start < missing.length; start += batchSize) {
    const batch = missing.slice(start, start + batchSize);
    const request = previousBatch.then(() => {
      if (generation !== scope.generation) throw new Error('Your session changed. Please try again.');
      return client.storage.from(bucket).createSignedUrls(batch, SIGNED_URL_SECONDS);
    })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
      });
    previousBatch = request.catch(() => undefined);
    for (const path of batch) {
      const value = request.then((urls) => urls.get(path) || null);
      values.set(path, value);
      store(scope, cacheKey(path), value, SIGNED_URL_SECONDS * 1000 - REFRESH_BUFFER_MS);
    }
  }
  const urls = await Promise.all(unique.map(async (path) => [path, await values.get(path) ?? null] as const));
  if (generation !== scope.generation) throw new Error('Your session changed. Please try again.');
  return new Map(urls.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
}

/** Multipart virtual URLs carry their own shorter service-worker lifetime. */
export async function cachedMediaSource(key: string, load: () => Promise<string>, lifetimeMs: number): Promise<string> {
  const { scope, generation } = await mediaScope();
  const cacheKey = `source:${key}`;
  let entry = scope.entries.get(cacheKey);
  if (!entry) {
    entry = store(scope, cacheKey, load(), lifetimeMs - REFRESH_BUFFER_MS);
  }
  const value = await entry.value;
  if (generation !== scope.generation) throw new Error('Your session changed. Please try again.');
  if (!value) throw new Error('This file could not be loaded. Please try again.');
  return value;
}
