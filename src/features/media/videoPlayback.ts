import type { ProjectAttachment } from '../../types/domain';
import { readMultipartSpec } from '../../../public/portalink-media-core.js';

type Playback = NonNullable<NonNullable<ProjectAttachment['metadata']>['playbackVideo']>;

/** URLs are always freshly signed; never accept a URL supplied in stored metadata. */
export function readVideoPlayback(value: unknown, originalPath: string, projectId: string): Omit<Playback, 'sourceUrl'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const video = (value as { playbackVideo?: Record<string, unknown> }).playbackVideo;
  const prefix = `${originalPath.split('/')[0]}/video-previews/${projectId}/`;
  if (!video || video.mimeType !== 'video/mp4' || typeof video.storagePath !== 'string'
    || !video.storagePath.startsWith(prefix)
    || !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/playback\.mp4(?:\.portalink-multipart\.json)?$/.test(video.storagePath.slice(prefix.length))
    || typeof video.sizeBytes !== 'number' || !Number.isSafeInteger(video.sizeBytes) || video.sizeBytes <= 0) return null;
  const multipart = readMultipartSpec(video.multipart);
  if (video.storagePath.endsWith('.json') && (!multipart || multipart.sizeBytes !== video.sizeBytes)) return null;
  if (!video.storagePath.endsWith('.json') && video.multipart != null) return null;
  return { storagePath: video.storagePath, mimeType: 'video/mp4', sizeBytes: video.sizeBytes, ...(multipart ? { multipart } : {}) };
}

export function videoSource(attachment: ProjectAttachment): string | null {
  return attachment.metadata?.playbackVideo?.sourceUrl ?? attachment.sourceUrl;
}

export function videoSources(attachment: ProjectAttachment): string[] {
  return [...new Set([attachment.metadata?.playbackVideo?.sourceUrl, attachment.sourceUrl].filter((url): url is string => Boolean(url)))];
}
