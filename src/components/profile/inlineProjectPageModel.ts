import type { Project, ProjectAttachment } from '../../types/domain';
import type { CataloguePagePosition } from '../../features/profile/cataloguePagePosition';
import { resolveCataloguePageIndex } from '../../features/profile/cataloguePagePosition';
import { navigationSwipe } from '../../presentation/mobile/useNavigationSwipe';

export type InlineProjectSlide = CataloguePagePosition & { attachment?: ProjectAttachment };
export type InlineGestureSample = { x: number; y: number; time: number };
type InlineProjectSource = Pick<Project, 'attachments'> & Partial<Pick<Project, 'cover' | 'coverThumbnail' | 'coverKind' | 'coverPageNumber'>>;

export function inlinePositionMatches(position: CataloguePagePosition, slide: CataloguePagePosition): boolean {
  return position.key === slide.key && position.index === slide.index && position.attachmentId === slide.attachmentId && position.page === slide.page;
}

export function inlineDocumentCount(attachment: ProjectAttachment, resolved?: number): number | undefined {
  const valid = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  if (valid(resolved)) return resolved;
  if (valid(attachment.metadata?.pageCount)) return attachment.metadata.pageCount;
  const pages = attachment.metadata?.renderedPages?.filter(page => page.attachmentId === attachment.id && valid(page.withinDocumentIndex));
  if (pages?.length) return pages.reduce((maximum, page) => Math.max(maximum, page.withinDocumentIndex), 0);
  return undefined;
}

export function inlineDocumentCountKey(attachment: ProjectAttachment): string {
  return JSON.stringify([attachment.id, attachment.sourceUrl]);
}

/** Signing tokens are delivery credentials, not part of a stored asset's identity.
 * Generic URL queries/fragments may identify different content and stay intact. */
function canonicalSource(source?: string | null): string | undefined {
  if (!source?.trim()) return undefined;
  try {
    const url = new URL(source, 'https://portalink.invalid');
    if (/^\/storage\/v1\/object\/sign\//.test(url.pathname)) url.searchParams.delete('token');
    return url.href;
  } catch { return source; }
}

function sameSource(left?: string | null, right?: string | null): boolean {
  const reference = canonicalSource(left);
  return reference !== undefined && reference === canonicalSource(right);
}

/** Only the first actual content page can duplicate the cover. Later reuse is intentional. */
function firstCoverDuplicateKey(project: InlineProjectSource, first?: ProjectAttachment): string | undefined {
  if (!first) return undefined;
  const sourceId = project.coverThumbnail?.sourceAttachmentId;
  const source = sourceId ? project.attachments?.find(item => item.id === sourceId) : undefined;
  // A thumbnail manifest describes the painted cover, even when cover is a stale fallback URL.
  const sameAsset = sourceId
    ? first.id === sourceId || Boolean(source && sameSource(source.sourceUrl, first.sourceUrl))
    : sameSource(project.cover, first.sourceUrl);
  if (first.kind === 'document') {
    const page = project.coverPageNumber ?? source?.metadata?.coverPageNumber ?? first.metadata?.coverPageNumber ?? 1;
    const firstRaster = first.metadata?.renderedPages?.find(item => item.attachmentId === first.id && item.withinDocumentIndex === 1);
    if (page === 1 && (sameAsset || !sourceId && sameSource(project.cover, firstRaster?.sourceUrl))) return `${first.id}:page:1`;
  } else if ((first.kind === 'image' || first.kind === 'video' && project.coverKind === 'video') && sameAsset) {
    return `${first.id}:${first.kind === 'image' ? 'image' : 'media'}`;
  }
  return undefined;
}

/** Cover once, followed by ordered real content; reader page ordinals never change. */
export function inlineProjectSlides(project: InlineProjectSource, documentCounts: Readonly<Record<string, number>> = {}): InlineProjectSlide[] {
  const slides: InlineProjectSlide[] = [{ index: 0, key: 'cover' }];
  const ordered = [...(project.attachments ?? [])].sort((left, right) => left.order - right.order);
  let imageNumber = 0;
  for (const attachment of ordered) {
    if (attachment.kind === 'document') {
      const count = inlineDocumentCount(attachment, documentCounts[inlineDocumentCountKey(attachment)]) ?? 1;
      for (let page = 1; page <= count; page++) slides.push({ index: slides.length, key: `${attachment.id}:page:${page}`, attachmentId: attachment.id, page, attachment });
    } else {
      const image = attachment.kind === 'image';
      if (image) imageNumber++;
      slides.push({ index: slides.length, key: `${attachment.id}:${image ? 'image' : 'media'}`, attachmentId: attachment.id, ...(image ? { page: imageNumber } : {}), attachment });
    }
  }
  const duplicate = firstCoverDuplicateKey(project, ordered[0]);
  if (duplicate && slides[1]?.key === duplicate) {
    slides.splice(1, 1);
    slides.forEach((slide, index) => { slide.index = index; });
  }
  return slides;
}

/** Dense cards keep the same truthful target without needing to mount a renderer. */
export function normalizeInlineProjectPosition(project: InlineProjectSource, position?: CataloguePagePosition, metadataComplete = false): CataloguePagePosition | undefined {
  if (!metadataComplete || !position || project.attachments === undefined) return position;
  const cover = { index: 0, key: 'cover' };
  if (position.key === 'cover' || project.attachments.length === 0) return cover;
  const ordered = [...project.attachments].sort((left, right) => left.order - right.order);
  if (position.key === firstCoverDuplicateKey(project, ordered[0])) return cover;
  const attachment = position.attachmentId ? ordered.find(item => item.id === position.attachmentId) : undefined;
  if (position.attachmentId && !attachment) return cover;
  const unknown = ordered.some(item => item.kind === 'document' && inlineDocumentCount(item) === undefined);
  let target: CataloguePagePosition | undefined;
  if (attachment) {
    const index = Number.isFinite(position.index) ? Math.max(0, Math.floor(position.index)) : 0;
    if (attachment.kind === 'image') {
      const page = ordered.filter(item => item.kind === 'image').findIndex(item => item.id === attachment.id) + 1;
      target = { index, key: `${attachment.id}:image`, attachmentId: attachment.id, page };
    } else if (attachment.kind === 'document') {
      const count = inlineDocumentCount(attachment);
      const requested = Number.isSafeInteger(position.page) && Number(position.page) > 0 ? Number(position.page) : 1;
      const page = count ? Math.min(count, requested) : requested;
      target = { index, key: `${attachment.id}:page:${page}`, attachmentId: attachment.id, page };
    } else target = { index, key: `${attachment.id}:media`, attachmentId: attachment.id };
  }
  if (unknown) return target ?? position;
  const slides = inlineProjectSlides(project);
  const resolved = slides[resolveCataloguePageIndex(slides.map(slide => slide.key), target ?? position)];
  return { index: resolved.index, key: resolved.key, ...(resolved.attachmentId ? { attachmentId: resolved.attachmentId } : {}), ...(resolved.page ? { page: resolved.page } : {}) };
}

/** One compact pagination target, centered clear of the project menu. */
export function inlineDotLimit(width: number): number {
  if (width <= 0) return 5;
  if (width < 188) return 0;
  const count = Math.min(5, Math.floor((width - 152) / 11));
  return count % 2 === 0 ? count - 1 : count;
}

export function inlineDotWindow(selected: number, total: number, limit = 5): number[] {
  const count = Math.max(0, Math.min(total, Math.floor(limit)));
  const first = Math.max(0, Math.min(total - count, selected - Math.floor(count / 2)));
  return Array.from({ length: count }, (_, index) => first + index);
}

export function inlineGestureAxis(dx: number, dy: number): 'pending' | 'x' | 'y' {
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= 8) return 'pending';
  return Math.abs(dx) > Math.abs(dy) * 1.25 ? 'x' : 'y';
}

export function inlineSwipePage(start: InlineGestureSample, end: InlineGestureSample, selected: number, total: number): number {
  const direction = navigationSwipe(start, end);
  return Math.max(0, Math.min(total - 1, selected + (direction === 'left' ? 1 : direction === 'right' ? -1 : 0)));
}

export function inlineDragOffset(dx: number, selected: number, total: number, width: number): number {
  const atEdge = (selected === 0 && dx > 0) || (selected === total - 1 && dx < 0);
  return atEdge ? Math.sign(dx) * Math.min(24, Math.abs(dx) * .18) : Math.max(-width, Math.min(width, dx));
}

export function inlineKeyboardPage(key: string, selected: number, total: number): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return Math.max(0, total - 1);
  if (key === 'ArrowLeft') return Math.max(0, selected - 1);
  if (key === 'ArrowRight') return Math.min(total - 1, selected + 1);
  return null;
}
