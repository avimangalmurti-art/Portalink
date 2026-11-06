import type { Services } from '../../services/interfaces';
import type { ProjectCoverThumbnail } from '../../types/domain';
import { PUBLIC_ORIGIN } from '../citations/publicOrigin';
import { handleFromPath } from '../sharing/shareModel';

export type SharedContentTarget = {
  to: string;
  projectId: string;
  categoryId: string;
  profileId: string | null;
  handle: string | null;
  attachmentId: string | null;
  pageNumber: number | null;
};

export type SharedContentPreview = {
  title: string;
  pageLabel: string | null;
  source: string | null;
  kind: 'image' | 'document' | 'cover';
  pageNumber: number;
  aspectRatio?: number;
  thumbnail?: ProjectCoverThumbnail;
  previewSource?: string;
};

const LEGACY_ORIGIN = 'https://portalinknetworksinc.avimangalmurti566055.chatgpt.site';
const ID = '[a-z0-9_-]{1,128}';
const PROJECT_PATH = new RegExp(`^/(?:p|share)/(${ID})/c/(${ID})/(${ID})/?$`, 'i');
const HANDLE_PROJECT_PATH = new RegExp(`^/[^/]+/c/(${ID})/(${ID})/?$`, 'i');

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** Recognize the link already stored in a message, without fetching arbitrary URLs. */
export function parseSharedContentLink(text: string, origin: string): SharedContentTarget | null {
  if (!/^https?:\/\//i.test(text) || /[\s\\]/.test(text) || hasControlCharacter(text)) return null;
  try {
    const url = new URL(text);
    if (url.username || url.password || ![origin, PUBLIC_ORIGIN, LEGACY_ORIGIN].includes(url.origin)
      || /%2f|%5c/i.test(url.pathname)) return null;
    const project = PROJECT_PATH.exec(url.pathname);
    const handle = project ? null : handleFromPath(url.pathname);
    const handledProject = handle ? HANDLE_PROJECT_PATH.exec(url.pathname) : null;
    const categoryId = project?.[2] ?? handledProject?.[1];
    const projectId = project?.[3] ?? handledProject?.[2];
    if (!categoryId || !projectId) return null;
    const mediaValues = url.searchParams.getAll('media');
    const pageValues = url.searchParams.getAll('page');
    if (mediaValues.length > 1 || pageValues.length > 1 || (pageValues.length && !mediaValues.length)) return null;
    const attachmentId = mediaValues[0] ?? null;
    if (attachmentId !== null && (!attachmentId || attachmentId.length > 4096 || hasControlCharacter(attachmentId))) return null;
    const rawPage = pageValues[0];
    if (rawPage !== undefined && (!/^[1-9]\d{0,5}$/.test(rawPage) || Number(rawPage) > 100000)) return null;
    return {
      to: url.pathname + url.search + url.hash,
      profileId: project?.[1] ?? null,
      handle,
      categoryId,
      projectId,
      attachmentId,
      pageNumber: rawPage === undefined ? null : Number(rawPage),
    };
  } catch {
    return null;
  }
}

export function isGeneratedPageShareLabel(text: string, target: SharedContentTarget): boolean {
  return Boolean(target.attachmentId) && text.endsWith('\n') && text.trim() === `Page ${target.pageNumber ?? 1}`;
}

export function messageOptionsPreviewText(body: string, origin: string): string {
  const parts = body.split(/(https?:\/\/[^\s]+)/g);
  let removedShare = false;
  for (let index = 1; index < parts.length; index += 2) {
    const target = parseSharedContentLink(parts[index], origin);
    if (!target) continue;
    if (isGeneratedPageShareLabel(parts[index - 1], target)) parts[index - 1] = '';
    parts[index] = '';
    removedShare = true;
  }
  return removedShare ? parts.join('').trim() : body;
}

function unavailable(): never { throw new Error('This shared content is unavailable.'); }
function validRatio(value: number | undefined): number | undefined {
  return value && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Resolve through current permissions; explicit pages never borrow other artwork. */
export async function resolveSharedContentPreview(
  target: SharedContentTarget,
  services: Pick<Services, 'projects' | 'profiles'>,
): Promise<SharedContentPreview> {
  if (target.pageNumber !== null && (!Number.isInteger(target.pageNumber) || target.pageNumber < 1 || target.pageNumber > 100000)) return unavailable();
  const profileId = target.handle
    ? (await services.profiles.resolvePublicHandle?.(target.handle))?.profileId
    : target.profileId;
  if (!profileId) return unavailable();
  const view = await services.projects.getProjectView(target.projectId);
  const { project, creator } = view;
  if (project.id !== target.projectId || project.categoryId !== target.categoryId || creator.id !== profileId) return unavailable();
  const attachments = [...(project.attachments ?? [])].sort((left, right) => left.order - right.order);
  if (target.attachmentId !== null) {
    const attachment = attachments.find(item => item.id === target.attachmentId);
    if (!attachment) return unavailable();
    const pageNumber = target.pageNumber ?? 1;
    if (attachment.kind === 'image') {
      const imageNumber = attachments.filter(item => item.kind === 'image').findIndex(item => item.id === attachment.id) + 1;
      // Earlier image shares used page=1 for each asset; current readers use its
      // position in the project's image sequence. The asset itself remains exact.
      if ((target.pageNumber !== null && pageNumber !== 1 && pageNumber !== imageNumber) || !attachment.sourceUrl) return unavailable();
      return { title: project.title, pageLabel: `Image ${imageNumber}`, source: attachment.sourceUrl,
        kind: 'image', pageNumber: imageNumber, aspectRatio: validRatio(attachment.metadata?.aspectRatio) };
    }
    if (attachment.kind !== 'document') return unavailable();
    const pageCount = attachment.metadata?.pageCount;
    if (pageCount && Number.isFinite(pageCount) && pageNumber > pageCount) return unavailable();
    const rendered = attachment.metadata?.renderedPages?.find(page =>
      page.attachmentId === attachment.id && page.withinDocumentIndex === pageNumber && page.sourceUrl);
    if (rendered?.sourceUrl) return { title: project.title, pageLabel: `Page ${pageNumber}`, source: rendered.sourceUrl,
      kind: 'image', pageNumber, aspectRatio: validRatio(rendered.aspectRatio) };
    if (!attachment.sourceUrl) return unavailable();
    // The caller must use strict PDF-page rendering: an invalid page must fail,
    // rather than being clamped to another page by a cover renderer.
    return { title: project.title, pageLabel: `Page ${pageNumber}`, source: attachment.sourceUrl,
      kind: 'document', pageNumber, aspectRatio: validRatio(attachment.metadata?.aspectRatio) };
  }
  if (target.pageNumber !== null) return unavailable();
  const pageNumber = project.coverPageNumber ?? 1;
  const coverAttachment = attachments.find(item => item.isCover)
    ?? attachments.find(item => item.sourceUrl === project.cover);
  const renderedCover = coverAttachment?.kind === 'document' ? coverAttachment.metadata?.renderedPages?.find(page =>
    page.attachmentId === coverAttachment.id && page.withinDocumentIndex === pageNumber && page.sourceUrl) : undefined;
  // Whole-project shares use existing static artwork only. Video playback and
  // original PDF downloads belong to opening the project, not its chat preview.
  const source = renderedCover?.sourceUrl
    ?? (project.coverKind !== 'document' && project.coverKind !== 'video' && project.cover ? project.cover : null);
  return { title: project.title, pageLabel: null, source, kind: 'cover', pageNumber,
    aspectRatio: validRatio(renderedCover?.aspectRatio ?? project.coverAspectRatio),
    ...(project.coverThumbnail ? { thumbnail: project.coverThumbnail } : {}) };
}
