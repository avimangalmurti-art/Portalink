import { fileExtension, mediaKindFor } from '../publishing/assetTypes';
import type { PersistedAttachment, PersistedMedia, PreparedMedia } from '../../types/publishing';

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

