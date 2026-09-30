import type { ProjectCoverThumbnail } from '../../types/domain';
import { publicCoverUrl } from '../../features/media/publicMediaUrl';

const SIZES = [200, 400, 800] as const;
const HASH = /^[a-f0-9]{64}$/;

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
  const social = item.social;
  if (social && (social.path !== `${prefix}/social.webp` || social.width !== 1200 || social.height !== 630)) return undefined;
  return { ...(social ? { social: { path: social.path, width: 1200, height: 630 } as const } : {}), version: 1, bucket: item.bucket, sourceAttachmentId: item.sourceAttachmentId, sourceKey: item.sourceKey, frameBaked: true, variants };
}

export function coverThumbnailWithUrls(thumbnail: ProjectCoverThumbnail, privateUrls: Map<string, string>): ProjectCoverThumbnail {
  return { ...thumbnail, ...(thumbnail.social ? { social: { ...thumbnail.social, sourceUrl: thumbnail.bucket === 'project-covers' ? publicCoverUrl(thumbnail.social.path) : privateUrls.get(thumbnail.social.path) ?? null } } : {}), variants: thumbnail.variants.map(variant => ({ ...variant,
    sourceUrl: thumbnail.bucket === 'project-covers'
      ? publicCoverUrl(variant.path)
      : privateUrls.get(variant.path) ?? null,
  })) };
}
