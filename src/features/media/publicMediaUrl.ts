const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const COVER_PATH = new RegExp(`^${UUID}/${UUID}/[a-f0-9]{64}/(?:200|400|800|social)\\.webp$`, 'i');
const PAGE_PATH = new RegExp(`^${UUID}/${UUID}/${UUID}/[1-9][0-9]{0,3}-[a-f0-9]{64}-(?:800|1600)\\.webp$`, 'i');
const AVATAR_PATH = new RegExp(`^${UUID}/[a-zA-Z0-9._-]+$`, 'i');
const VERSIONED_AVATAR = new RegExp(`^${UUID}/(?:${UUID}-.+|registration-${UUID}-[a-f0-9]{64})$`, 'i');

export type PublicMediaBucket = 'project-covers' | 'avatars';

/** Public objects only; reject encoded separators, traversal and query strings. */
export function validPublicMediaPath(bucket: PublicMediaBucket, path: string): boolean {
  if (path.length > 1_024 || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) return false;
  return bucket === 'project-covers' ? COVER_PATH.test(path) || PAGE_PATH.test(path) : AVATAR_PATH.test(path);
}

export function immutablePublicMediaPath(bucket: PublicMediaBucket, path: string): boolean {
  return bucket === 'project-covers' ? COVER_PATH.test(path) || PAGE_PATH.test(path) : VERSIONED_AVATAR.test(path);
}

export function publicCoverUrl(path: string): string {
  return validPublicMediaPath('project-covers', path) ? `/media/covers/${path}` : '';
}

/** Leave signed originals, third-party images and local previews untouched. */
export function publicMediaUrl(source: string, supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''): string {
  if (!source || !supabaseUrl) return source;
  try {
    const url = new URL(source);
    const configured = new URL(supabaseUrl);
    if (url.origin !== configured.origin || url.username || url.password || url.search || url.hash) return source;
    const match = /^\/storage\/v1\/object\/public\/(project-covers|avatars)\/(.+)$/.exec(url.pathname);
    if (!match) return source;
    const bucket = match[1] as PublicMediaBucket;
    const path = decodeURIComponent(match[2]);
    if (!validPublicMediaPath(bucket, path)) return source;
    return `/media/${bucket === 'project-covers' ? 'covers' : 'avatars'}/${path}`;
  } catch {
    return source;
  }
}
