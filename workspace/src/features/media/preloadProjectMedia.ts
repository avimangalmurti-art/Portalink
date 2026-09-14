import type { ProjectAttachment } from '../../types/domain';

const warmedUrls = new Set<string>();

function attachmentUrls(attachment: ProjectAttachment): string[] {
  const urls = attachment.sourceUrl ? [attachment.sourceUrl] : [];
  for (const page of attachment.metadata?.renderedPages?.slice(0, 2) ?? []) {
    if (page.sourceUrl) urls.push(page.sourceUrl);
  }
  return urls;
}

/**
 * Low-priority warming for the projects immediately beside the open one. It
 * avoids a blank first frame without eagerly downloading an entire portfolio.
 */
export function preloadProjectMedia(attachments: ProjectAttachment[], limit = 4): void {
  if (typeof document === 'undefined') return;

  const candidates = attachments
    .flatMap((attachment) => attachmentUrls(attachment).map((url) => ({ url, kind: attachment.kind })))
    .filter(({ url }) => !warmedUrls.has(url))
    .slice(0, limit);

  for (const { url, kind } of candidates) {
    warmedUrls.add(url);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = kind === 'image' ? 'image' : 'fetch';
    link.dataset.portalinkProjectPrefetch = '';
    document.head.appendChild(link);
  }
}
