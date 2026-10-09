import type { MediaService } from '../interfaces';
import { ProcessingServiceError } from '../../types/publishing';
import { requireSupabase } from './client';
import { videoProcessingCapability } from '../../features/media/processingCapabilities';

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

/** Canonical processing reads, shared by full services and the public viewer.
 * Importing this module never loads upload transports or project mutations. */
export const supabaseMediaProcessingReadService: Pick<MediaService, 'getProcessingCapability' | 'getProcessingStatus'> = {
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
      .in('attachment_id', objectIds), videoProcessingCapability ? requireSupabase().from('video_processing_jobs')
      .select('attachment_id,status,error_message,is_retryable,updated_at').in('attachment_id', objectIds) : Promise.resolve({ data: [], error: null })]);
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
  }
};
