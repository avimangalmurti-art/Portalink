import type { ProjectView } from '../../types/domain';
import { buildPath } from '../../app/routes';
import { mediaInteractionRequest } from '../media-interactions/mediaInteractionRequest';

export type SavedPageTarget = { projectId: string; attachmentId: string; pageIndex: number; savedAt: string };
export type SavedPagesBatch = { items: SavedPageTarget[]; nextCursor: string | null };
export const savedPageKey = (target: SavedPageTarget) => JSON.stringify([target.projectId, target.attachmentId, target.pageIndex]);

export async function listSavedPages(cursor: string | null): Promise<SavedPagesBatch> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : '';
  return mediaInteractionRequest<SavedPagesBatch>(`/api/media-interactions/saved${query}`, undefined, true);
}

export async function removeSavedPage(target: SavedPageTarget): Promise<void> {
  await mediaInteractionRequest('/api/media-interactions/saved', {
    method: 'DELETE', body: JSON.stringify({ projectId: target.projectId, attachmentId: target.attachmentId, pageIndex: target.pageIndex }),
  }, true);
}

/** Resolve live, permission-checked content; never substitute the project's cover. */
export function savedPagePresentation(target: SavedPageTarget, view: ProjectView | undefined) {
  if (!view || view.project.id !== target.projectId || !Number.isInteger(target.pageIndex) || target.pageIndex < 0) return null;
  const attachments = view.project.attachments ?? [];
  const attachment = attachments.find((item) => item.id === target.attachmentId);
  if (!attachment || !['image', 'document'].includes(attachment.kind)) return null;
  const metadata = attachment.metadata;
  // An image's saved position can change when the creator reorders the project.
  const imageNumber = attachments.filter((item) => item.kind === 'image').findIndex((item) => item.id === attachment.id) + 1;
  const pageNumber = attachment.kind === 'image' ? imageNumber : target.pageIndex + 1;
  if (attachment.kind === 'document' && metadata?.pageCount && pageNumber > metadata.pageCount) return null;
  const renderedPage = attachment.kind === 'document' ? metadata?.renderedPages?.find((page) => page.withinDocumentIndex === pageNumber && (!page.attachmentId || page.attachmentId === attachment.id)) : undefined;
  const query = new URLSearchParams({ media: attachment.id, page: String(pageNumber), view: 'page' });
  return {
    view,
    pageNumber,
    label: `${attachment.kind === 'image' ? 'Image' : 'Page'} ${pageNumber}`,
    href: `${buildPath('project', { profileId: view.creator.id, categoryId: view.project.categoryId, projectId: view.project.id })}?${query}`,
    source: renderedPage?.sourceUrl || attachment.sourceUrl,
    kind: attachment.kind === 'document' && !renderedPage?.sourceUrl ? 'document' as const : undefined,
    aspectRatio: renderedPage?.aspectRatio ?? metadata?.aspectRatio,
  };
}
