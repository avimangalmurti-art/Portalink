import type { Project, ProjectCoverThumbnail } from '../../types/domain';
import { requireSupabase } from './client';
import { thumbnailContentHash, thumbnailSourceKey } from '../../features/media/coverThumbnailManifest.mjs';

const SIZES = [200, 400, 800] as const;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9-]{36}$/i;

/** Persisted URLs are never trusted: the service derives them from checked keys. */
export function readCoverThumbnail(value: unknown, profileId: string, projectId: string): ProjectCoverThumbnail | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Partial<ProjectCoverThumbnail>;
  if (item.version !== 1 || item.frameBaked !== true || (item.bucket !== 'project-covers' && item.bucket !== 'project-media')
    || typeof item.sourceAttachmentId !== 'string' || !item.sourceAttachmentId
    || typeof item.sourceKey !== 'string' || !HASH.test(item.sourceKey) || !Array.isArray(item.variants) || item.variants.length !== 3) return undefined;
  let prefix: string | undefined;
  const variants: ProjectCoverThumbnail['variants'] = [];
  for (const size of SIZES) {
    const variant = item.variants.find(candidate => candidate?.size === size);
    if (!variant || typeof variant.path !== 'string' || !Number.isInteger(variant.width) || !Number.isInteger(variant.height)
      || variant.width < 1 || variant.height < 1 || Math.max(variant.width, variant.height) !== size) return undefined;
    const segments = variant.path.split('/');
    if (segments.length !== 4 || segments[0] !== profileId || segments[1] !== projectId || !HASH.test(segments[2]) || segments[3] !== `${size}.webp`) return undefined;
    const currentPrefix = segments.slice(0, 3).join('/');
    if (prefix && prefix !== currentPrefix) return undefined;
    prefix = currentPrefix;
    variants.push({ size, path: variant.path, width: variant.width, height: variant.height });
  }
  return { version: 1, bucket: item.bucket, sourceAttachmentId: item.sourceAttachmentId, sourceKey: item.sourceKey, frameBaked: true, variants };
}

export function coverThumbnailWithUrls(thumbnail: ProjectCoverThumbnail, privateUrls: Map<string, string>): ProjectCoverThumbnail {
  return { ...thumbnail, variants: thumbnail.variants.map(variant => ({ ...variant,
    sourceUrl: thumbnail.bucket === 'project-covers'
      ? requireSupabase().storage.from('project-covers').getPublicUrl(variant.path).data.publicUrl
      : privateUrls.get(variant.path) ?? null,
  })) };
}

export function isMissingCoverBucket(error: { message?: string; statusCode?: string | number } | null): boolean {
  return Boolean(error && /bucket.*not found|bucket.*does not exist/i.test(error.message ?? ''));
}

/** A deployment without the pending column stays on its existing cover path. */
export async function refreshProjectCoverThumbnail(projectId: string, loadProject: () => Promise<Project>): Promise<string | undefined> {
  const client = requireSupabase();
  const rowResult = await client.from('projects').select('*').eq('id', projectId).single();
  if (rowResult.error) throw new Error(rowResult.error.message);
  const row = rowResult.data;
  if (!Object.prototype.hasOwnProperty.call(row, 'cover_thumbnail')) return undefined;
  const [profile, category] = await Promise.all([
    client.from('profiles').select('id,is_private').eq('id', row.profile_id).single(),
    client.from('portfolio_categories').select('id,profile_id,is_hidden').eq('id', row.category_id).single(),
  ]);
  if (profile.error || category.error) throw new Error(profile.error?.message ?? category.error?.message);
  // Private or hidden content never produces a public (or new private) cover.
  if (row.is_hidden || profile.data.is_private || category.data.is_hidden || category.data.profile_id !== row.profile_id) return undefined;
  const project = await loadProject();
  const attachments = [...(project.attachments ?? [])].sort((a, b) => a.order - b.order);
  const cover = attachments.find(attachment => attachment.isCover && (attachment.sourceUrl || attachment.metadata?.playbackVideo?.sourceUrl))
    ?? attachments.find(attachment => attachment.kind === 'image' && attachment.sourceUrl) ?? attachments[0];
  const sourceUrl = cover?.metadata?.playbackVideo?.sourceUrl || cover?.sourceUrl;
  if (!sourceUrl || !['image', 'document', 'video'].includes(cover.kind)) return 'This file has no browser-renderable cover; the existing preview is retained.';
  const { generateCoverThumbnails } = await import('../../features/media/coverThumbnailRenderer');
  const variants = await generateCoverThumbnails({ kind: cover.kind,
    sourceUrl,
    pageNumber: cover.metadata?.coverPageNumber ?? 1, frame: cover.metadata?.coverFrame,
    aspectRatio: cover.metadata?.aspectRatio ?? (cover.metadata?.widthPixels && cover.metadata?.heightPixels ? cover.metadata.widthPixels / cover.metadata.heightPixels : undefined),
  });
  const sourceKey = await thumbnailSourceKey({ id: cover.id, storagePath: cover.storagePath ?? '', pageNumber: cover.metadata?.coverPageNumber ?? 1, frame: cover.metadata?.coverFrame });
  const digest = await thumbnailContentHash(variants);
  const manifest: ProjectCoverThumbnail = { version: 1, bucket: 'project-covers', sourceAttachmentId: cover.id, sourceKey, frameBaked: true,
    variants: variants.map(variant => ({ size: variant.size, width: variant.width, height: variant.height, path: `${row.profile_id}/${projectId}/${digest}/${variant.size}.webp` })) };
  // A missing bucket is the only reason to change storage destination. An RLS
  // refusal or transient network error must never downgrade authorization.
  for (let index = 0; index < variants.length; index += 1) {
    const bytes = await variants[index].blob.arrayBuffer();
    let upload = await client.storage.from(manifest.bucket).upload(manifest.variants[index].path, bytes, {
      contentType: 'image/webp', cacheControl: '31536000', upsert: false,
      headers: { 'cache-control': manifest.bucket === 'project-covers' ? 'public, max-age=31536000, immutable' : 'private, max-age=3600' },
    });
    if (index === 0 && isMissingCoverBucket(upload.error)) {
      manifest.bucket = 'project-media';
      upload = await client.storage.from(manifest.bucket).upload(manifest.variants[index].path, bytes, {
        contentType: 'image/webp', cacheControl: '3600', upsert: false, headers: { 'cache-control': 'private, max-age=3600' },
      });
    }
    if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error(upload.error.message);
  }
  const saved = await client.rpc('set_project_cover_thumbnail', {
    p_project_id: projectId, p_expected_revision: row.revision, p_manifest: manifest,
  });
  if (saved.error) throw new Error(saved.error.message);
  // Retain immutable prior versions while public. Deletion/hiding cleans the
  // whole prefix, including interrupted generations, without racing a retry.
  return undefined;
}

/** Remove every public version before a DB privacy change (the SQL guard is
 * authoritative). Storage API deletion, never direct storage.objects SQL. */
export async function removePublicProjectCovers(profileId: string, projectId: string, bucketName: 'project-covers' | 'project-media' = 'project-covers'): Promise<void> {
  if (!UUID.test(profileId) || !UUID.test(projectId)) throw new Error('Invalid project cover scope.');
  const bucket = requireSupabase().storage.from(bucketName);
  const prefix = `${profileId}/${projectId}`;
  const hashes: string[] = [];
  // Enumerate before deleting; edited originals may share the project prefix.
  for (let offset = 0; ; offset += 100) {
    const listed = await bucket.list(prefix, { limit: 100, offset });
    if (isMissingCoverBucket(listed.error)) return;
    if (listed.error) throw new Error(listed.error.message);
    if (!listed.data?.length) break;
    for (const folder of listed.data) {
      if (!HASH.test(folder.name)) {
        if (bucketName === 'project-covers') throw new Error('Unrecognized cover path; cleanup stopped.');
        continue;
      }
      hashes.push(folder.name);
    }
    if (listed.data.length < 100) break;
  }
  for (const hash of hashes) {
      const files = await bucket.list(`${prefix}/${hash}`, { limit: 100 });
      if (files.error) throw new Error(files.error.message);
      const paths = (files.data ?? []).map(file => {
        if (!/^(200|400|800)\.webp$/.test(file.name)) throw new Error('Unrecognized cover variant; cleanup stopped.');
        return `${prefix}/${hash}/${file.name}`;
      });
      if (!paths.length) throw new Error('Cover directory could not be cleared.');
      const removed = await bucket.remove(paths);
      if (removed.error) throw new Error(removed.error.message);
  }
}

export async function removeProfilePublicCovers(profileId: string, categoryIds?: string[], projectIds?: string[]): Promise<void> {
  const client = requireSupabase();
  let query = client.from('projects').select('id,profile_id,cover_thumbnail').eq('profile_id', profileId);
  if (categoryIds) { if (!categoryIds.length) return; query = query.in('category_id', categoryIds); }
  if (projectIds) { if (!projectIds.length) return; query = query.in('id', projectIds); }
  const result = await query;
  // Before the pending migration there cannot be managed public thumbnails.
  if (result.error && ['42703', 'PGRST204'].includes(result.error.code) && result.error.message.includes('cover_thumbnail')) return;
  if (result.error) throw new Error(result.error.message);
  for (const row of result.data ?? []) {
    await removePublicProjectCovers(profileId, row.id);
    if (row.cover_thumbnail?.bucket === 'project-covers') {
      const cleared = await client.from('projects').update({ cover_thumbnail: null }).eq('id', row.id).eq('profile_id', profileId);
      if (cleared.error) throw new Error(cleared.error.message);
    }
  }
}

export async function removePrivateCoverThumbnails(profileId: string, projectId: string): Promise<void> {
  // Only hashed cover folders, leaving files added by the editor untouched.
  // Includes retired hashes and interrupted preparation attempts.
  await removePublicProjectCovers(profileId, projectId, 'project-media');
}
