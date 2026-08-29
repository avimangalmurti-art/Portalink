import type { Id, ProjectAttachment, ProjectMediaKind } from './domain';

/**
 * Publishing domain models.
 *
 * The hard line this file draws: a browser `File` is NEVER part of a published
 * project. `PreparedMedia` is transient frontend preparation; `Project` is the
 * persisted record. Nothing here knows about a storage bucket, and nothing here
 * may claim a file left the browser.
 */

/**
 * Retained for the published record's media indicator. It describes how a
 * project READS in the feed, not what a creator is allowed to upload.
 */
export type PreparedMediaKind = Extract<ProjectMediaKind, 'image' | 'images' | 'pdf' | 'video' | 'audio'>;

/**
 * A project is an ordered collection of assets of ANY family. The family is
 * detected from the file, never chosen by the creator.
 */
export type AssetFamily = 'image' | 'document' | 'presentation' | 'data' | 'video' | 'audio' | 'model' | 'cad' | 'design' | 'code' | 'archive';

/** How far this asset can be presented. The original is always preserved. */
export type AssetPreviewCapability = 'native' | 'converted' | 'preview-only' | 'source-only';

/**
 * Per-asset lifecycle. `preparing`, `uploading`, `processing`, `upload-failed`,
 * and `processing-failed` belong to the future storage/processing service and are
 * unreachable in the prototype — nothing may simulate them.
 *
 * `upload-failed` and `processing-failed` are DELIBERATELY separate. Bytes never
 * reaching storage and bytes landing safely while a server-side conversion fails
 * are different failures with different recoveries: the first needs the file sent
 * again, the second needs the job run again on an object that already exists.
 * Collapsing them would make the product offer the wrong repair.
 */
export type AssetProcessingState = 'preparing' | 'uploading' | 'processing' | 'ready' | 'conversion-required' | 'preview-limited' | 'preview-unavailable' | 'upload-failed' | 'processing-failed';

/**
 * One locally selected file, validated but NOT uploaded.
 *
 * This is the transient authoring shape. A persisted project asset — with a
 * storage reference, generated thumbnail, and server-side processing state —
 * is what a real `MediaService` will return in its place.
 */
export type PreparedMedia = {
  /** Local id for list operations. Not a storage id — none exists. */
  id: string;
  file: File;
  fileName: string;
  /** Creator-facing title, defaulting to the filename. */
  displayTitle: string;
  sizeBytes: number;
  mimeType: string;
  family: AssetFamily;
  /** Human-readable type, e.g. "3D model", "PDF", "Spreadsheet". */
  typeLabel: string;
  capability: AssetPreviewCapability;
  processingState: AssetProcessingState;
  /** Presentation order in the published project. */
  order: number;
  isCover: boolean;
  /**
   * A blob: URL for local rendering, or null when the browser cannot preview
   * this type. It is a local handle, never a persisted address.
   */
  previewUrl: string | null;
  /** Intrinsic facts read from the original file, never inferred from layout. */
  metadata?: ProjectAttachment['metadata'];
};

/**
 * The media lifecycle, stated explicitly so the UI can never imply a byte was
 * sent. `upload-unavailable` is the honest terminal state today: preparation
 * succeeded and no storage backend exists. `uploading`, `upload-failed`, and
 * `uploaded` are declared for the future `SupabaseMediaService` and are
 * unreachable in the prototype.
 */
export type MediaPreparationState = 'empty' | 'selecting' | 'validating' | 'ready' | 'invalid' | 'upload-unavailable' | 'uploading' | 'upload-failed' | 'uploaded';
export type MediaRejectionCode = 'unsupported_type' | 'too_large' | 'too_many' | 'unreadable';

/** Whether media can currently be persisted, and why not. */
export type UploadCapability = {
  isAvailable: boolean;
  /** Shown verbatim, so the prototype never implies a working upload. */
  reason: string;
  /**
   * Whether the implementation reports per-file progress. When false the UI shows
   * overall progress only, rather than inventing a per-row figure.
   */
  reportsPerFileProgress?: boolean;
};

/* ── Media transport ────────────────────────────────────────────────────── */

/**
 * The upload transport contract.
 *
 * These models exist so a real `MediaService` can be dropped in without the
 * publishing UI changing. Two rules shape them:
 *
 * 1. The operation's identity is available WHILE it runs, not after it finishes.
 *    `startUpload` hands back an `UploadOperation` synchronously-ish (one await)
 *    and reports completion through a separate promise, because an id that only
 *    arrives with the result cannot be used to cancel the thing producing it.
 * 2. Nothing here names a vendor. No bucket, no client, no credentials — a
 *    Supabase implementation maps its own objects onto these before the product
 *    sees them.
 */
export type UploadId = Id;

/** One file's transport state inside an operation. */
export type UploadItemState = 'pending' | 'uploading' | 'uploaded' | 'failed' | 'cancelled';

/**
 * Progress as the SERVICE reports it. Nothing in the product may advance this on
 * a timer: a figure that is not measured is a lie about someone's upload.
 */
export type UploadProgress = {
  uploadId: UploadId;
  /** 0–1 across the whole operation, as reported by the transport. */
  fraction: number;
  bytesSent?: number;
  bytesTotal?: number;
  /**
   * Per-file progress, keyed by `PreparedMedia.id`. Absent when the transport
   * cannot attribute bytes to individual files.
   */
  items?: Record<string, {
    fraction: number;
    state: UploadItemState;
  }>;
};

/**
 * A file that genuinely reached storage.
 *
 * `storagePath` is the persisted object key and is REQUIRED — a result without
 * one did not persist, and must be reported as a failure instead. `sourceUrl` is
 * a renderer-ready address the service supplies (signed URL, CDN URL); it is
 * never the storage key and must never be a `blob:` URL.
 */
export type PersistedMedia = {
  /** The `PreparedMedia.id` this was uploaded from, so order and cover survive. */
  preparedId: string;
  /** The service's own id for the stored object, used for deletion. */
  objectId: Id;
  storagePath: string;
  sourceUrl: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /**
   * Server-side work that happens AFTER the bytes land — thumbnails, transcodes,
   * conversions. Uploading and processing are different things: this is the
   * service's own report, and no implementation may claim processing finished.
   */
  processingState: AssetProcessingState;
  /** Carried unchanged into the attachment JSON stored with the project. */
  metadata?: ProjectAttachment['metadata'];
};
export type UploadErrorCode = 'unavailable' | 'network' | 'rejected' | 'too_large' | 'cancelled' | 'unknown';

/**
 * A typed transport failure.
 *
 * `persisted` carries any files that DID land before the failure, and
 * `cleanupRequired` states whose job it is to remove them. A partial upload that
 * reported nothing would leave silent orphans in storage.
 */
export type UploadFailure = {
  code: UploadErrorCode;
  message: string;
  persisted: PersistedMedia[];
  /**
   * True when the CALLER must delete `persisted` via `deleteMedia`. False when
   * the implementation already rolled them back itself.
   */
  cleanupRequired: boolean;
};
export class UploadServiceError extends Error {
  readonly code: UploadErrorCode;
  readonly persisted: PersistedMedia[];
  readonly cleanupRequired: boolean;
  constructor(failure: UploadFailure) {
    super(failure.message);
    this.name = 'UploadServiceError';
    this.code = failure.code;
    this.persisted = failure.persisted;
    this.cleanupRequired = failure.cleanupRequired;
  }
}

/** How an operation ended. Cancellation is an outcome, not an error. */
export type UploadOutcome = {
  uploadId: UploadId;
  status: 'uploaded';
  media: PersistedMedia[];
} | {
  uploadId: UploadId;
  status: 'cancelled';
  /** Anything that landed before the cancellation took effect. */
  persisted: PersistedMedia[];
  cleanupRequired: boolean;
};

/**
 * A live upload. The id is available immediately, so cancellation is genuinely
 * possible while bytes are moving.
 */
export type UploadOperation = {
  uploadId: UploadId;
  /** Resolves when the operation ends; rejects with `UploadServiceError`. */
  completion: Promise<UploadOutcome>;
};

/** What the transport is asked to do. Order and cover live on the prepared media. */
export type StartUploadInput = {
  profileId: Id;
  /** The draft the files belong to, so an implementation can scope its keys. */
  draftId: Id;
  media: PreparedMedia[];
  /** Called only from real transport events. */
  onProgress?: (progress: UploadProgress) => void;
};

/**
 * Turns a persisted upload into the project's canonical attachment. Order, cover,
 * and display name come from the authoring side; the storage reference comes from
 * the service. This is the seam where `PreparedMedia` stops existing.
 */
export type PersistedAttachment = ProjectAttachment & {
  storagePath: string;
};

/* ── Server-side processing ─────────────────────────────────────────────── */

/**
 * Work that happens AFTER the bytes land: thumbnails, poster frames, page
 * rasterisation, transcodes, CAD tessellation. It is a separate stage from
 * transport, so it has its own capability, its own status query, and its own
 * retry — an object can be safely stored and still have no preview.
 *
 * Nothing here names a vendor: no bucket, no queue, no worker, no URL template.
 * An implementation maps its own pipeline onto these before the product sees it.
 */
export type ProcessingCapability = {
  /** Whether a processing service exists at all. */
  isAvailable: boolean;
  /** Shown verbatim, so the product never implies a pipeline it does not have. */
  reason: string;
  /** Whether a failed job can be re-run. Retry is offered only when true. */
  canRetry?: boolean;
  /**
   * How often the implementation wants its status re-queried, in seconds. The
   * product NEVER invents a cadence: absent means query once and on demand only.
   * This is a real query interval, not a simulated progress tick.
   */
  refreshIntervalSeconds?: number;
};
export type ProcessingErrorCode = 'unavailable' | 'not_found' | 'unsupported' | 'rate_limited' | 'network' | 'unknown';

/**
 * One persisted asset's processing state, addressed by the stable object id the
 * service issued in `PersistedMedia.objectId`.
 *
 * `sourceUrl` may be refreshed alongside the state, because a finished job is
 * usually what produces a renderer-ready address. A `previewUrl` is present ONLY
 * when the service genuinely produced a derived preview — its absence is never
 * filled in by the product.
 */
export type AssetProcessingStatus = {
  objectId: Id;
  state: AssetProcessingState;
  /** Fixed total reported by the document processor; never a viewport position. */
  pageCount?: number;
  /** Completed pages are progress only and must never be presented as the total. */
  processedPages?: number;
  sourceUrl?: string | null;
  /** A derived thumbnail or poster the service produced. Never synthesised. */
  previewUrl?: string | null;
  /** The service's own words about this asset's state. */
  message?: string;
  /** Set only on `processing-failed`, so the UI can explain the right repair. */
  failureCode?: ProcessingErrorCode;
  /** Whether re-running THIS job is worth offering. */
  isRetryable?: boolean;
  updatedAt?: string;
};
export class ProcessingServiceError extends Error {
  readonly code: ProcessingErrorCode;
  constructor(code: ProcessingErrorCode, message: string) {
    super(message);
    this.name = 'ProcessingServiceError';
    this.code = code;
  }
}

/* ── Draft ──────────────────────────────────────────────────────────────── */

export type DraftMetadata = {
  title: string;
  summary: string;
};
export type DraftState = 'editing' | 'ready' | 'publishing' | 'published' | 'failed';

/** A project being authored. In-memory only in the prototype. */
export type ProjectDraft = {
  id: Id;
  profileId: Id;
  categoryId: Id;
  metadata: DraftMetadata;
  createdAt: string;
};

/**
 * Everything needed to publish.
 *
 * Exactly ONE media source is given, and which one it is says what actually
 * happened:
 *
 * - `attachments` — the production path. Files are already in storage and each
 *   attachment carries a real `storagePath`. No browser `File` is involved, so
 *   nothing transient can reach a persisted record.
 * - `media` — the PROTOTYPE-ONLY fallback, used when the transport reports itself
 *   unavailable. The result must then say the project and its previews are
 *   session-only, because nothing left the browser.
 *
 * A caller must never pass both: that would leave the service guessing whether
 * the bytes were persisted.
 */
export type PublishProjectInput = {
  draftId: Id;
  profileId: Id;
  categoryId: Id;
  metadata: DraftMetadata;
  /** Optional creator-reviewed discovery metadata derived from the work. */
  relevance?: import('./discovery').ProjectRelevance;
  /** Persisted attachments from a completed upload. Production path. */
  attachments?: PersistedAttachment[];
  /** Locally prepared files. Prototype-only, session-only outcome. */
  media?: PreparedMedia[];
};
export type PublishResult = {
  projectId: Id;
  /**
   * Always false while no storage backend exists: the project carries local
   * previews for this session only. The UI must say so rather than implying an
   * upload completed.
   */
  mediaPersisted: boolean;
  /** True when the record lives in memory and a reload will discard it. */
  sessionOnly: boolean;
};
/* ── Published-project lifecycle ────────────────────────────────────────── */

/**
 * What the creator changed about ONE existing attachment.
 *
 * Only the presentation facts an edit can legitimately change: its title, its
 * place in the order, and whether it is the cover. The file itself, its storage
 * reference, its kind, and its processing state are the service's, so they are
 * deliberately absent — an edit form must not be able to rewrite them.
 */
export type ProjectAttachmentEdit = {
  /** The stable attachment/object id. Never a positional index. */
  id: Id;
  displayName: string;
  order: number;
  isCover: boolean;
};

/**
 * Editing an ALREADY-PUBLISHED project.
 *
 * This is the same public record the project already has — there is no second
 * project model. `attachments` lists the files that must REMAIN, so anything the
 * creator removed is simply absent; the service decides what that means for
 * storage, and only ever AFTER the update itself succeeds. A failed save must
 * never destroy files that the currently published project is still using.
 */
export type UpdateProjectInput = {
  projectId: Id;
  /** The owning profile, so an implementation can authorize the mutation. */
  profileId: Id;
  metadata: DraftMetadata;
  /** Existing attachments that survive the edit, with their new presentation. */
  attachments: ProjectAttachmentEdit[];
  /** Newly uploaded files to append. Production path — already in storage. */
  addedAttachments?: PersistedAttachment[];
  /** Locally prepared additions. PROTOTYPE-ONLY, session-only outcome. */
  addedMedia?: PreparedMedia[];
  /**
   * The revision the edit was started from, when the implementation issues one.
   * A mismatch is a `conflict`, so two editors cannot silently overwrite one
   * another; an implementation without revisions ignores it.
   */
  expectedRevision?: string;
};
export type UpdateProjectResult = {
  /** The canonical record AFTER the update. The caller re-reads from this. */
  project: import('./domain').Project;
  /** False when the record or its media live only in this runtime. */
  mediaPersisted: boolean;
  sessionOnly: boolean;
  /**
   * Attachments the update removed from the record. Cleaning up their stored
   * objects is the SERVICE's responsibility, behind this boundary and only once
   * the update has been committed — the product never deletes storage because a
   * form no longer lists a file.
   */
  removedAttachmentIds: Id[];
  /** What actually happened, in the implementation's own words. */
  message?: string;
};
export type DeleteProjectResult = {
  projectId: Id;
  removedAttachmentIds: Id[];
  /** True only when the stored objects were genuinely deleted. */
  storageDeleted: boolean;
  message: string;
};

/**
 * Typed failures for mutations on a published project. Each needs a different
 * repair, which is why they are separate: `conflict` means re-read before saving,
 * `permission_denied` means the mutation was refused outright, `network` means the
 * same request is worth sending again.
 */
export type ProjectMutationErrorCode = 'not_found' | 'permission_denied' | 'invalid_metadata' | 'invalid_media' | 'conflict' | 'network' | 'unknown';
export class ProjectMutationError extends Error {
  readonly code: ProjectMutationErrorCode;
  constructor(code: ProjectMutationErrorCode, message: string) {
    super(message);
    this.name = 'ProjectMutationError';
    this.code = code;
  }
}
export type PublishErrorCode = 'not_owner' | 'invalid_metadata' | 'invalid_media' | 'category_not_found' | 'draft_not_found' | 'network' | 'unknown';
export class PublishServiceError extends Error {
  readonly code: PublishErrorCode;
  constructor(code: PublishErrorCode, message: string) {
    super(message);
    this.name = 'PublishServiceError';
    this.code = code;
  }
}
