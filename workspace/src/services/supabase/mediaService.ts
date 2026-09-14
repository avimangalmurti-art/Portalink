import { Upload } from 'tus-js-client';
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
  cancelCurrent?: () => Promise<void>;
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

type PdfJobRow = {
  attachment_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  processed_pages: number;
  page_count: number | null;
  error_code: string | null;
  error_message: string | null;
  is_retryable: boolean;
  updated_at: string;
};

function asProcessingStatus(row: PdfJobRow) {
  const state = row.status === 'completed'
    ? 'ready' as const
    : row.status === 'failed'
      ? 'processing-failed' as const
      : 'processing' as const;
  const progress = row.processed_pages > 0
    ? ` ${row.processed_pages}${row.page_count ? ` of ${row.page_count}` : ''} pages finished.`
    : '';
  return {
    objectId: row.attachment_id,
    state,
    pageCount: typeof row.page_count === 'number' && row.page_count > 0 ? row.page_count : undefined,
    processedPages: Math.max(0, row.processed_pages),
    message: row.error_message
      ?? (state === 'ready'
        ? 'The PDF preview is ready.'
        : row.status === 'queued'
          ? 'The PDF is stored safely and queued for page preparation.'
          : `The PDF is stored safely. Its pages are being prepared.${progress}`),
    failureCode: state === 'processing-failed' ? 'unknown' as const : undefined,
    isRetryable: state === 'processing-failed' ? row.is_retryable : undefined,
    updatedAt: row.updated_at,
  };
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

async function uploadFileResumably(input: {
  uploadId: string;
  operation: StartUploadInput;
  runtime: ActiveUpload;
  item: PreparedMedia;
  itemIndex: number;
  storagePath: string;
  completedBytes: number;
  totalBytes: number;
  body?: Blob;
  itemBytesCompleted?: number;
  contentType?: string;
}): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error(error?.message ?? 'Your session expired before the upload could start. Sign in and try again.');
  }
  if (input.runtime.cancelRequested) return;

  const projectId = new URL(requireSupabaseProjectUrl()).hostname.split('.')[0];
  const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      input.runtime.cancelCurrent = undefined;
      callback();
    };
    const upload = new Upload(input.body ?? input.item.file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_BYTES,
      fingerprint: async () => `portalink:${input.storagePath}`,
      metadata: {
        bucketName: PROJECT_MEDIA_BUCKET,
        objectName: input.storagePath,
        contentType: input.contentType ?? (input.item.mimeType || 'application/octet-stream'),
        cacheControl: '3600',
      },
      onProgress(bytesUploaded) {
        const itemBytes = (input.itemBytesCompleted ?? 0) + bytesUploaded;
        const itemFraction = input.item.sizeBytes > 0 ? itemBytes / input.item.sizeBytes : 0;
        const operationBytes = input.completedBytes + itemBytes;
        input.operation.onProgress?.({
          uploadId: input.uploadId,
          fraction: input.totalBytes > 0 ? operationBytes / input.totalBytes : itemFraction,
          bytesSent: operationBytes,
          bytesTotal: input.totalBytes,
          items: progressItems(input.operation.media, input.itemIndex, false, itemFraction),
        });
      },
      onError(uploadError) {
        if (input.runtime.cancelRequested) {
          finish(resolve);
          return;
        }
        finish(() => reject(uploadError));
      },
      onSuccess() {
        finish(resolve);
      },
    });

    input.runtime.cancelCurrent = async () => {
      try {
        await upload.abort(true);
      } finally {
        finish(resolve);
      }
    };
    upload.start();
  });
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
        const base = { uploadId, operation: input, runtime, item, itemIndex: index, completedBytes: sentBytes, totalBytes };
        if (multipart) {
          for (let part = 0; part < multipart.partCount && !runtime.cancelRequested; part += 1) {
            const offset = part * multipart.partBytes;
            await uploadFileResumably({ ...base,
              storagePath: partPath(storagePath, part),
              body: item.file.slice(offset, Math.min(item.sizeBytes, offset + multipart.partBytes)),
              itemBytesCompleted: offset, contentType: 'application/octet-stream',
            });
          }
          if (!runtime.cancelRequested) {
            const manifest = new Blob([JSON.stringify({ ...multipart, fileName: item.fileName, mimeType: item.mimeType })], { type: 'application/json' });
            const { error } = await bucket.upload(storagePath, manifest, { contentType: 'application/json', upsert: false });
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
    await runtime.cancelCurrent?.();
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

  async getProcessingCapability() {
    return {
      isAvailable: true,
      reason: 'Documents and videos are prepared by private background workers.',
      canRetry: true,
      refreshIntervalSeconds: 3,
    };
  },

  async getProcessingStatus(objectIds) {
    if (objectIds.length === 0) return [];
    const [documents, videos] = await Promise.all([requireSupabase()
      .from('pdf_processing_jobs')
      .select('attachment_id,status,processed_pages,page_count,error_code,error_message,is_retryable,updated_at')
      .in('attachment_id', objectIds), requireSupabase().from('video_processing_jobs')
      .select('attachment_id,status,error_message,is_retryable,updated_at').in('attachment_id', objectIds)]);
    // PDF status may be restricted to signed-in viewers. Public videos must
    // remain independent, including during staged migration deployment.
    if (documents.error && !['42P01', 'PGRST205', '42501'].includes(documents.error.code)) {
      throw new ProcessingServiceError('network', documents.error.message);
    }
    // Older deployments continue serving existing PDF/native media while the video migration is installed.
    if (videos.error && !['42P01', 'PGRST205'].includes(videos.error.code)) {
      throw new ProcessingServiceError('network', videos.error.message);
    }
    return [
      ...((documents.data ?? []) as unknown as PdfJobRow[]).map(asProcessingStatus),
      ...(videos.data ?? []).map((row) => ({
        objectId: row.attachment_id as string,
        state: row.status === 'completed' ? 'ready' as const : row.status === 'failed' ? 'processing-failed' as const : 'processing' as const,
        message: row.status === 'completed' ? 'Video ready to play.' : row.status === 'failed' ? row.error_message ?? 'Video conversion failed.'
          : row.status === 'queued' ? 'Video queued for conversion.' : 'Preparing video for playback…',
        isRetryable: row.status === 'failed' ? Boolean(row.is_retryable) : undefined,
        updatedAt: row.updated_at as string,
      })),
    ];
  },

  async retryProcessing(objectId) {
    const video = await requireSupabase().from('video_processing_jobs').select('id').eq('attachment_id', objectId).maybeSingle();
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
