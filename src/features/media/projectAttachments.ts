import { fileExtension, mediaKindFor } from '../publishing/assetTypes';
import { resolveSourceImage } from '../../data/sourceImages';
import type { PersistedAttachment, PersistedMedia, PreparedMedia } from '../../types/publishing';
import type { MediaKind, ProjectAttachment } from '../../types/domain';
// Canonical domain models, not the seed module's parallel copies.
import type { PortfolioCategory as ProfileCategory, Project as ProjectEntry } from '../../types/domain';

/**
 * The bridge between a project record and its renderers.
 *
 * A project is an ordered collection of attachments, and each attachment
 * carries its own media kind. The category it lives in supplies context —
 * copy, grouping, filtering — but NEVER decides how a file is presented.
 */

/** Mixes and documents seeded without files keep a stable derived length. */
export function trackDuration(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 9973;
  }
  return 180 + hash % 2400;
}

/**
 * Locally prepared files become the project's attachments. Nothing was
 * uploaded, so `storagePath` stays null and `sourceUrl` is the object URL whose
 * ownership publishing hands to the record.
 */
export function attachmentsFromPreparedMedia(media: PreparedMedia[]): ProjectAttachment[] {
  return [...media].sort((a, b) => a.order - b.order).map((item, index) => ({
    id: item.id,
    kind: mediaKindFor(item.family, item.capability),
    fileName: item.fileName,
    displayName: item.displayTitle,
    extension: fileExtension(item.fileName),
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    typeLabel: item.typeLabel,
    sourceUrl: item.previewUrl,
    storagePath: null,
    status: item.processingState,
    isCover: item.isCover,
    order: index,
    metadata: item.metadata
  }));
}

/**
 * The production seam: persisted uploads become the project's attachments.
 *
 * Order, cover, display name, and type labelling come from the authoring side —
 * they are the creator's decisions, not the transport's — while the storage
 * reference and renderer URL come from the service. `PreparedMedia` stops
 * existing here: no `File`, and no `blob:` URL, can travel any further.
 *
 * A persisted result missing a `storagePath` is dropped rather than written as a
 * record that claims storage it does not have.
 */
export function attachmentsFromPersistedMedia(prepared: PreparedMedia[], persisted: PersistedMedia[]): PersistedAttachment[] {
  const byPreparedId = new Map(persisted.map((item) => [item.preparedId, item]));
  return [...prepared].sort((a, b) => a.order - b.order).map((item): PersistedAttachment | null => {
    const stored = byPreparedId.get(item.id);
    if (!stored || !stored.storagePath) {
      return null;
    }
    return {
      id: stored.objectId,
      kind: mediaKindFor(item.family, item.capability),
      fileName: stored.fileName || item.fileName,
      displayName: item.displayTitle,
      extension: fileExtension(stored.fileName || item.fileName),
      mimeType: stored.mimeType || item.mimeType,
      sizeBytes: stored.sizeBytes || item.sizeBytes,
      typeLabel: item.typeLabel,
      // The service's renderer-ready address. Never the storage key, and never a
      // local object URL.
      sourceUrl: stored.sourceUrl,
      storagePath: stored.storagePath,
      // Whatever the service says about post-upload work. Nothing here claims
      // processing finished.
      status: stored.processingState,
      isCover: item.isCover,
      order: item.order,
      // File-derived metadata can be refreshed by the transport, while authoring
      // metadata such as the cover crop belongs to the creator. Merge both so a
      // successful upload cannot silently discard the framing chosen in review.
      metadata: item.metadata || stored.metadata ? {
        ...item.metadata,
        ...stored.metadata,
      } : undefined
    };
  }).filter((attachment): attachment is PersistedAttachment => attachment !== null).map((attachment, index) => ({
    ...attachment,
    order: index
  }));
}

/**
 * Seeded work predates uploads: it has no files at all, only placeholder
 * geometry. Those records get one synthesized attachment so the viewer has a
 * single code path. This is the ONLY place a category format is allowed to
 * imply a kind, and only because there is no file to ask.
 */
function legacyAttachments(project: ProjectEntry, category: ProfileCategory): ProjectAttachment[] {
  const isAudio = category.format === 'audio';
  // Seeded work now carries real source imagery. An image is what it actually
  // is, so it is presented as one rather than as a stand-in document.
  if (!isAudio && project.cover) {
    const cover: ProjectAttachment = {
      id: `${project.id}-cover`,
      kind: project.coverKind === 'video' ? 'video' : project.coverKind === 'document' ? 'document' : 'image',
      fileName: project.title,
      displayName: project.coverAlt || project.title,
      extension: project.coverKind === 'video' ? 'mp4' : project.coverKind === 'document' ? 'pdf' : 'png',
      mimeType: project.coverKind === 'video' ? 'video/mp4' : project.coverKind === 'document' ? 'application/pdf' : 'image/png',
      sizeBytes: 0,
      typeLabel: project.coverKind === 'video' ? 'Video' : project.coverKind === 'document' ? 'PDF' : 'Image',
      sourceUrl: project.cover,
      storagePath: null,
      status: 'ready',
      isCover: true,
      order: 0
    };
    if (cover.kind !== 'image') {
      return [cover];
    }
    /*
     * Seeded work holds no real files, so its pages come from the same shared
     * placeholder pool its cover does — resolved generically from the project's
     * id and category, never from a per-project list. The seed's own stated page
     * count decides how many, capped so a page is never the same image twice.
     *
     * Published work never reaches here: it has real attachments.
     */
    const pageTarget = Math.min(Math.max(project.pageCount ?? 1, 1), 6);
    const pages: ProjectAttachment[] = [cover];
    const seen = new Set([project.cover]);
    for (let offset = 1; pages.length < pageTarget && offset < 24; offset += 1) {
      const image = resolveSourceImage(project.id, project.categoryId, offset);
      if (image.kind === 'video' || seen.has(image.src)) {
        continue;
      }
      seen.add(image.src);
      pages.push({
        ...cover,
        id: `${project.id}-page-${pages.length}`,
        displayName: image.alt,
        sourceUrl: image.src,
        isCover: false,
        order: pages.length
      });
    }
    return pages;
  }
  const kind: MediaKind = isAudio ? 'audio' : 'document';
  return [{
    id: `${project.id}-legacy`,
    kind,
    fileName: project.title,
    displayName: project.title,
    extension: isAudio ? 'mp3' : 'pdf',
    mimeType: isAudio ? 'audio/mpeg' : 'application/pdf',
    sizeBytes: 0,
    typeLabel: isAudio ? 'Audio' : 'PDF',
    sourceUrl: null,
    storagePath: null,
    status: 'ready',
    isCover: true,
    order: 0,
    metadata: isAudio ? {
      durationSeconds: trackDuration(project.id)
    } : {
      pageCount: project.pageCount ?? 6
    }
  }];
}

export function resolveProjectAttachments(project: ProjectEntry, category: ProfileCategory): ProjectAttachment[] {
  if (project.attachments && project.attachments.length > 0) {
    return [...project.attachments].sort((a, b) => a.order - b.order);
  }
  return legacyAttachments(project, category);
}
