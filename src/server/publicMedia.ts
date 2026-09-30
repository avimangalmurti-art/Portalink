import { immutablePublicMediaPath, validPublicMediaPath, type PublicMediaBucket } from '../features/media/publicMediaUrl';

export interface PublicMediaCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface PublicMediaOptions {
  supabaseUrl: string;
  cache?: PublicMediaCache;
  fetch?: typeof fetch;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export const IMMUTABLE_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const LEGACY_AVATAR_CACHE_CONTROL = 'public, max-age=300, must-revalidate';
const IMAGE_TYPES = new Set(['image/avif', 'image/bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']);
const TRANSFORMED_COVER_TYPES = new Set(['image/avif', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_ETAG_BUFFER_BYTES = 8 * 1024 * 1024;

export function isPublicMediaRoute(pathname: string): boolean {
  return pathname === '/media/covers' || pathname.startsWith('/media/covers/')
    || pathname === '/media/avatars' || pathname.startsWith('/media/avatars/');
}

function failure(status: number): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

function parseObject(url: URL): { bucket: PublicMediaBucket; path: string } | null {
  if (url.search) return null;
  const match = /^\/media\/(covers|avatars)\/(.+)$/.exec(url.pathname);
  if (!match) return null;
  try {
    // Only canonical ASCII object names are issued by our uploaders. Reject
    // encoded separators as well as traversal and doubly encoded paths.
    if (match[2].includes('%')) return null;
    const path = decodeURIComponent(match[2]);
    const bucket = match[1] === 'covers' ? 'project-covers' : 'avatars';
    if (!validPublicMediaPath(bucket, path)) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

function defaultCache(): PublicMediaCache | undefined {
  // Sites runs this worker on workerd. Local runtimes without its Cloudflare
  // Cache API still serve public objects; they do not pretend to cache them.
  return (globalThis as unknown as { caches?: { default?: PublicMediaCache } }).caches?.default;
}

async function bytesForEtag(response: Response): Promise<ArrayBuffer | null> {
  if (!response.body) return new ArrayBuffer(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    if (Number(response.headers.get('content-length')) > MAX_ETAG_BUFFER_BYTES) return null;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_ETAG_BUFFER_BYTES) return null;
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes.buffer;
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function clientResponse(response: Response, request: Request, cacheState: string): Response {
  const headers = new Headers(response.headers);
  headers.set('x-portalink-media-cache', cacheState);
  const requested = request.headers.get('if-none-match');
  const etag = headers.get('etag');
  if (etag && requested?.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))) {
    headers.delete('content-length');
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
}

/** Only the two public image buckets are reachable. Private originals never enter this path. */
export async function handlePublicMedia(request: Request, options: PublicMediaOptions): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const response = failure(405);
    response.headers.set('allow', 'GET, HEAD');
    return response;
  }
  const url = new URL(request.url);
  const object = parseObject(url);
  if (!object) return failure(400);
  let storage: URL;
  try {
    storage = new URL(options.supabaseUrl);
    if (storage.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(storage.hostname)
      || storage.port || storage.username || storage.password || storage.search || storage.hash || storage.pathname !== '/') return failure(503);
  } catch {
    return failure(503);
  }
  const accept = (request.headers.get('accept') ?? 'image/*').slice(0, 512);
  // Cloudflare's Cache API does not generally vary on arbitrary headers.
  // Include Accept in the internal key as well as the response's Vary header.
  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.searchParams.set('__accept', accept);
  const cacheKey = new Request(cacheUrl, { method: 'GET' });
  const cache = options.cache ?? defaultCache();
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return clientResponse(cached, request, 'HIT');
    } catch { /* A cache outage must not prevent public images loading. */ }
  }
  const variant = object.bucket === 'project-covers' ? /\/(200|400)\.webp$/.exec(object.path)?.[1] : undefined;
  if (variant) {
    // The existing Storage project's transformation endpoint was verified with
    // a public image. Small responses derive from the existing 800px master.
    storage.pathname = `/storage/v1/render/image/public/project-covers/${object.path.replace(/\/(200|400)\.webp$/, '/800.webp')}`;
    storage.searchParams.set('width', variant);
    storage.searchParams.set('height', variant);
    storage.searchParams.set('resize', 'contain');
    storage.searchParams.set('format', 'origin');
  } else {
    storage.pathname = `/storage/v1/object/public/${object.bucket}/${object.path}`;
  }
  let upstream: Response;
  try {
    // Deliberately construct new headers. No incoming Authorization, cookies,
    // forwarded IP/UA or conditional/range request reaches Supabase Storage.
    upstream = await (options.fetch ?? fetch)(storage, {
      method: 'GET', headers: { accept }, redirect: 'manual', signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return failure(502);
  }
  if (!upstream.ok || upstream.status !== 200) {
    return failure(upstream.status === 404 ? 404 : 502);
  }
  const contentType = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  // Storage transformations may encode a WebP master as JPEG/PNG/AVIF. Preserve
  // that actual raster MIME; untransformed cover objects must still be WebP.
  if (!IMAGE_TYPES.has(contentType) || (object.bucket === 'project-covers'
    && !(variant ? TRANSFORMED_COVER_TYPES.has(contentType) : contentType === 'image/webp'))) return failure(502);
  const headers = new Headers({
    'content-type': contentType,
    'cache-control': immutablePublicMediaPath(object.bucket, object.path) ? IMMUTABLE_MEDIA_CACHE_CONTROL : LEGACY_AVATAR_CACHE_CONTROL,
    'vary': 'Accept',
    'x-content-type-options': 'nosniff',
    // A public SVG may be displayed as an avatar, but never executes code if
    // someone opens its newly same-origin URL as a top-level document.
    'content-security-policy': "default-src 'none'; sandbox",
  });
  let body: BodyInit | null = upstream.body;
  const etag = upstream.headers.get('etag');
  if (etag) headers.set('etag', etag);
  else {
    // Storage normally supplies its ETag. Bound the exceptional hashing path;
    // canonical avatars are capped at 4MiB and cover masters at 800px.
    const bytes = await bytesForEtag(upstream);
    if (!bytes) return failure(502);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    headers.set('etag', `"${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}"`);
    body = bytes;
  }
  const response = new Response(body, { status: 200, headers });
  if (cache) {
    const write = cache.put(cacheKey, response.clone()).catch(() => undefined);
    if (options.waitUntil) options.waitUntil(write);
    else await write;
  }
  return clientResponse(response, request, cache ? 'MISS' : 'BYPASS');
}
