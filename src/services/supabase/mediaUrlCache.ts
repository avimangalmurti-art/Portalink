import { requireSupabase, requireSupabaseProjectUrl } from './client';

const SIGNED_URL_SECONDS = 6 * 60 * 60;
const REFRESH_BUFFER_MS = 5 * 60_000;
const MAX_ENTRIES = 4096;
const MAX_SIGNING_REQUESTS = 4;
type Entry = { expiresAt: number; value: Promise<string | null> };
type Scope = { accountId: string | null | undefined; generation: number; entries: Map<string, Entry>; signingLanes: Promise<unknown>[]; nextSigningLane: number };
const scopes = new WeakMap<object, Scope>();

async function mediaScope() {
  const client = requireSupabase();
  let scope = scopes.get(client);
  if (!scope) {
    scope = { accountId: undefined, generation: 0, entries: new Map(),
      signingLanes: Array.from({ length: MAX_SIGNING_REQUESTS }, () => Promise.resolve()), nextSigningLane: 0 };
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

function enqueueSigning<T>(scope: Scope, generation: number, sign: () => Promise<T>): Promise<T> {
  const lane = scope.nextSigningLane;
  scope.nextSigningLane = (lane + 1) % MAX_SIGNING_REQUESTS;
  const request = scope.signingLanes[lane].then(() => {
    if (generation !== scope.generation) throw new Error('Your session changed. Please try again.');
    return sign();
  });
  scope.signingLanes[lane] = request.catch(() => undefined);
  return request;
}

/** A catalogue thumbnail can only be derived from an already-resolved signed project image. */
export function signedProjectImagePath(source: string, projectUrl?: string): string | null {
  try {
    const url = new URL(source);
    if (url.origin !== new URL(projectUrl ?? requireSupabaseProjectUrl()).origin || url.username || url.password || url.hash || !url.searchParams.get('token')) return null;
    const path = /^\/storage\/v1\/object\/sign\/project-media\/(.+)$/.exec(url.pathname)?.[1];
    if (!path || /%2f|%5c/i.test(path)) return null;
    const decoded = decodeURIComponent(path);
    return !/[%?#\\]/.test(decoded) && decoded.split('/').every(segment => segment && segment !== '.' && segment !== '..')
      ? decoded : null;
  } catch {
    return null;
  }
}

export async function signedProjectImageThumbnail(path: string, size: number, stillNeeded: () => boolean): Promise<string | null> {
  const { client, scope, generation } = await mediaScope();
  if (!stillNeeded()) return null;
  const key = `signed-project-thumbnail:${size}:${path}`;
  const cached = scope.entries.get(key);
  if (cached) {
    const url = await cached.value;
    if (url && generation === scope.generation) return url;
  }
  if (generation !== scope.generation || !stillNeeded()) return null;
  const request = enqueueSigning(scope, generation, async () => {
    if (!stillNeeded()) return null;
    const { data, error } = await client.storage.from('project-media').createSignedUrl(path, SIGNED_URL_SECONDS, {
      transform: { width: size, height: size, resize: 'contain', quality: 75 },
    });
    return error ? null : data.signedUrl;
  });
  store(scope, key, request, SIGNED_URL_SECONDS * 1000 - REFRESH_BUFFER_MS);
  const url = await request;
  return generation === scope.generation ? url : null;
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
  // Four shared lanes overlap independent signing requests without letting
  // simultaneous PDFs/multipart attachments create an unbounded HTTP burst.
  const batchSize = singleBatch ? Math.max(1, missing.length) : 100;
  for (let start = 0; start < missing.length; start += batchSize) {
    const batch = missing.slice(start, start + batchSize);
    const request = enqueueSigning(scope, generation, async () => {
      const { data, error } = await client.storage.from(bucket).createSignedUrls(batch, SIGNED_URL_SECONDS);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
    });
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
