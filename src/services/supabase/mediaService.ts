import { supabaseMediaProcessingReadService } from './mediaProcessingReads';
import { videoProcessingCapability } from '../../features/media/processingCapabilities';
import type { MediaService } from '../interfaces';
import type {
  PersistedMedia,
  PreparedMedia,
  StartUploadInput,
  UploadItemState,
  UploadOperation,
  UploadOutcome,
} from '../../types/publishing';
import { ProcessingServiceError, UploadServiceError } from '../../types/publishing';
import { requireSupabase, requireSupabaseProjectUrl } from './client';
import { PROJECT_MEDIA_BUCKET } from './contentServices';
import { PART_BYTES } from '../../../public/portalink-media-core.js';
import { ensureMultipartReader, MANIFEST_SUFFIX, multipartSource, multipartSpec, partPath, removeStoredMedia } from './multipartMedia';

type ActiveUpload = {
  cancelRequested: boolean;
  activeParts: Set<() => Promise<void>>;
  completion: Promise<UploadOutcome>;
};

const activeUploads = new Map<string, ActiveUpload>();

function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'upload';
}

function stateFor(media: PreparedMedia): PersistedMedia['processingState'] {
  // The uploaded original is ready as soon as durable storage succeeds. PDF
  // page rendering is an optional background enhancement and must never make
  // the original document appear unavailable while a worker is offline.
  return media.processingState === 'preparing' || media.processingState === 'uploading'
    ? 'ready'
    : media.processingState;
}

function progressItems(
  media: PreparedMedia[],
  completed: number,
  cancelled: boolean,
  currentFraction = 0,
): Record<string, { fraction: number; state: UploadItemState }> {
  return Object.fromEntries(media.map((item, index) => {
    const state: UploadItemState = index < completed
      ? 'uploaded'
      : cancelled
        ? 'cancelled'
        : index === completed
          ? 'uploading'
          : 'pending';
    return [item.id, { fraction: index < completed ? 1 : index === completed ? currentFraction : 0, state }];
  }));
}

const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const MAX_CONCURRENT_PARTS = 3;
const IMMUTABLE_CACHE_SECONDS = '31536000';

async function uploadFileResumably(input: {
  runtime: ActiveUpload;
  item: PreparedMedia;
  storagePath: string;
  accessToken: string;
  body?: Blob;
  contentType?: string;
  onBytesUploaded: (bytes: number) => void;
  isStopped?: () => boolean;
}): Promise<void> {
  if (input.runtime.cancelRequested || input.isStopped?.()) return;

  // Browsing must not download the resumable upload client. Retain cancellation
  // if the owner closes/cancels while this first-use chunk is loading.
  const { Upload } = await import('tus-js-client');
  if (input.runtime.cancelRequested || input.isStopped?.()) return;

  const projectId = new URL(requireSupabaseProjectUrl()).hostname.split('.')[0];
  const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let aborting = false;
    let cancellation: Promise<void> | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      input.runtime.activeParts.delete(cancel);
      callback();
    };
    const upload = new Upload(input.body ?? input.item.file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${input.accessToken}` },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_BYTES,
      fingerprint: async () => `portalink:${input.storagePath}`,
      metadata: {
        bucketName: PROJECT_MEDIA_BUCKET,
        objectName: input.storagePath,
        contentType: input.contentType ?? (input.item.mimeType || 'application/octet-stream'),
        cacheControl: IMMUTABLE_CACHE_SECONDS,
      },
      onProgress(bytesUploaded) {
        if (!settled && !aborting && !input.runtime.cancelRequested) input.onBytesUploaded(bytesUploaded);
      },
      onError(uploadError) {
        // abort(true) must finish before this part settles and cleanup can start.
        if (aborting) return;
        if (input.runtime.cancelRequested) { void cancel().catch(() => undefined); return; }
        finish(() => reject(uploadError));
      },
      onSuccess() {
        if (aborting) return;
        finish(resolve);
      },
    });
    function cancel(): Promise<void> {
      if (cancellation) return cancellation;
      aborting = true;
      cancellation = (async () => {
        try { await upload.abort(true); }
        finally { finish(resolve); }
      })();
      return cancellation;
    }
    input.runtime.activeParts.add(cancel);
    try { upload.start(); } catch (error) { finish(() => reject(error)); }
  });
}

/** A logical file finishes only after every started part (including aborts) settles. */
async function uploadMultipartParts(input: {
  runtime: ActiveUpload;
  item: PreparedMedia;
  storagePath: string;
  accessToken: string;
  spec: ReturnType<typeof multipartSpec>;
  onBytesUploaded: (bytes: number) => void;
}): Promise<void> {
  const bytesByPart = Array<number>(input.spec.partCount).fill(0);
  let totalUploaded = 0;
  let nextPart = 0;
  let failed = false;
  let failure: unknown;
  const worker = async () => {
    while (!input.runtime.cancelRequested && !failed && nextPart < input.spec.partCount) {
      const part = nextPart++;
      const offset = part * input.spec.partBytes;
      const size = Math.min(input.item.sizeBytes - offset, input.spec.partBytes);
      const progress = (bytes: number) => {
        if (failed || input.runtime.cancelRequested) return;
        // Retries can report earlier offsets; logical progress never goes back
        // or double-counts bytes sent again by a different request.
        const next = Math.max(bytesByPart[part], Math.min(size, Math.max(0, bytes)));
        totalUploaded += next - bytesByPart[part];
        bytesByPart[part] = next;
        input.onBytesUploaded(totalUploaded);
      };
      try {
        await uploadFileResumably({ ...input,
          storagePath: partPath(input.storagePath, part),
          body: input.item.file.slice(offset, offset + size),
          contentType: 'application/octet-stream', onBytesUploaded: progress,
          isStopped: () => failed,
        });
        progress(size);
      } catch (error) {
        if (!failed) { failed = true; failure = error; }
        await Promise.allSettled([...input.runtime.activeParts].map(cancel => cancel()));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_PARTS, input.spec.partCount) }, worker));
  if (failed && !input.runtime.cancelRequested) throw failure;
}

async function performUpload(
  uploadId: string,
  input: StartUploadInput,
  runtime: ActiveUpload,
): Promise<UploadOutcome> {
  const client = requireSupabase();
  const bucket = client.storage.from(PROJECT_MEDIA_BUCKET);
  const persisted: PersistedMedia[] = [];
  const totalBytes = input.media.reduce((sum, item) => sum + item.sizeBytes, 0);
  let sentBytes = 0;

  try {
    if (input.media.some((item) => item.sizeBytes > PART_BYTES)) await ensureMultipartReader();
    for (let index = 0; index < input.media.length; index += 1) {
      if (runtime.cancelRequested) {
        return {
          uploadId,
          status: 'cancelled',
          persisted,
          cleanupRequired: persisted.length > 0,
        };
      }

      const item = input.media[index];
      const multipart = item.sizeBytes > PART_BYTES ? multipartSpec(item.sizeBytes) : undefined;
      const storagePath = `${input.profileId}/${input.draftId}/${crypto.randomUUID()}-${safeFileName(item.fileName)}${multipart ? MANIFEST_SUFFIX : ''}`;
      const metadata = multipart ? { ...item.metadata, multipart } : item.metadata;
      // Track the path before sending any bytes, so failure/cancellation can also
      // clean an unfinished logical file and all its already uploaded parts.
      const stored: PersistedMedia = {
        preparedId: item.id, objectId: storagePath, storagePath, sourceUrl: null,
        fileName: item.fileName, mimeType: item.mimeType, sizeBytes: item.sizeBytes,
        processingState: stateFor(item), metadata,
      };
      persisted.push(stored);
      try {
        // One token snapshot per logical file, shared by its bounded part uploads.
        const { data, error: sessionError } = await client.auth.getSession();
        const accessToken = data.session?.access_token;
        if (sessionError || !accessToken) throw new Error(sessionError?.message ?? 'Your session expired before the upload could start. Sign in and try again.');
        let reportedBytes = 0;
        const onBytesUploaded = (bytes: number) => {
          reportedBytes = Math.max(reportedBytes, Math.min(item.sizeBytes, Math.max(0, bytes)));
          const fraction = item.sizeBytes > 0 ? reportedBytes / item.sizeBytes : 0;
          input.onProgress?.({ uploadId,
            fraction: totalBytes > 0 ? (sentBytes + reportedBytes) / totalBytes : fraction,
            bytesSent: sentBytes + reportedBytes, bytesTotal: totalBytes,
            items: progressItems(input.media, index, false, fraction),
          });
        };
        const base = { runtime, item, accessToken, onBytesUploaded };
        if (multipart) {
          await uploadMultipartParts({ ...base, storagePath, spec: multipart });
          if (!runtime.cancelRequested) {
            const manifest = new Blob([JSON.stringify({ ...multipart, fileName: item.fileName, mimeType: item.mimeType })], { type: 'application/json' });
            const { error } = await bucket.upload(storagePath, manifest, { contentType: 'application/json', cacheControl: IMMUTABLE_CACHE_SECONDS, upsert: false });
            if (error) throw error;
            stored.sourceUrl = await multipartSource(storagePath, multipart, item.fileName, item.mimeType);
          }
        } else {
          await uploadFileResumably({ ...base, storagePath });
          if (!runtime.cancelRequested) {
            const signed = await bucket.createSignedUrl(storagePath, 60 * 60 * 6);
            if (signed.error) throw signed.error;
            stored.sourceUrl = signed.data.signedUrl;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The resumable upload failed.';
        const exceedsStorageAllowance = /maximum|too large|size limit|413|payload too large|entity too large/i.test(message);
        throw new UploadServiceError({
          code: exceedsStorageAllowance ? 'too_large' : 'network',
          message: exceedsStorageAllowance
            ? `${item.fileName} exceeds the current Supabase file-size allowance.`
            : `${item.fileName} could not be uploaded: ${message}`,
          persisted,
          cleanupRequired: persisted.length > 0,
        });
      }

      if (runtime.cancelRequested) {
        return {
          uploadId,
          status: 'cancelled',
          persisted,
          cleanupRequired: persisted.length > 0,
        };
      }

      sentBytes += item.sizeBytes;
      input.onProgress?.({
        uploadId,
        fraction: totalBytes > 0 ? sentBytes / totalBytes : (index + 1) / input.media.length,
        bytesSent: sentBytes,
        bytesTotal: totalBytes,
        items: progressItems(input.media, index + 1, false),
      });

      if (runtime.cancelRequested) {
        return {
          uploadId,
          status: 'cancelled',
          persisted,
          cleanupRequired: true,
        };
      }
    }
    return { uploadId, status: 'uploaded', media: persisted };
  } finally {
    activeUploads.delete(uploadId);
  }
}

export const supabaseMediaService: MediaService = {
  ...supabaseMediaProcessingReadService,
  async getUploadCapability() {
    return {
      isAvailable: true,
      reason: 'Files are stored privately and served through time-limited viewing URLs.',
      reportsPerFileProgress: true,
    };
  },

  async startUpload(input): Promise<UploadOperation> {
    const uploadId = crypto.randomUUID();
    const runtime: ActiveUpload = {
      cancelRequested: false,
      activeParts: new Set(),
      completion: Promise.resolve({ uploadId, status: 'cancelled', persisted: [], cleanupRequired: false }),
    };
    runtime.completion = performUpload(uploadId, input, runtime);
    activeUploads.set(uploadId, runtime);
    return { uploadId, completion: runtime.completion };
  },

  async cancelUpload(uploadId) {
    const runtime = activeUploads.get(uploadId);
    if (!runtime) {
      throw new UploadServiceError({
        code: 'cancelled',
        message: 'That upload is no longer running.',
        persisted: [],
        cleanupRequired: false,
      });
    }
    runtime.cancelRequested = true;
    await Promise.allSettled([...runtime.activeParts].map(cancel => cancel()));
    return runtime.completion;
  },

  async deleteMedia(objectId) {
    try {
      await removeStoredMedia([objectId]);
    } catch (error) {
      throw new UploadServiceError({
        code: 'network',
        message: error instanceof Error ? error.message : 'Stored files could not be cleaned up.',
        persisted: [],
        cleanupRequired: true,
      });
    }
  },

  async retryProcessing(objectId) {
    const video = videoProcessingCapability ? await requireSupabase().from('video_processing_jobs').select('id').eq('attachment_id', objectId).maybeSingle() : { data: null, error: null };
    if (video.error && !['42P01', 'PGRST205'].includes(video.error.code)) throw new ProcessingServiceError('network', video.error.message);
    const { data, error } = await requireSupabase().rpc(video.data ? 'retry_video_processing' : 'retry_pdf_processing', {
      p_attachment_id: objectId,
    });
    if (error) {
      const normalized = error.message.toLowerCase();
      throw new ProcessingServiceError(
        normalized.includes('not found') ? 'not_found' : normalized.includes('cannot be processed') ? 'unsupported' : 'network',
        error.message,
      );
    }
    const result = data as unknown as {
      objectId: string;
      state: 'processing';
      message: string;
      isRetryable: boolean;
      updatedAt: string;
    };
    return result;
  },
};
