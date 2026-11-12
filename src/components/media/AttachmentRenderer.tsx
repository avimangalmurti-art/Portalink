import React, { lazy, Suspense } from 'react';
import { MediaFrame } from './MediaFrame';
import { ImageAttachment } from './ImageAttachment';
import { GenericFileCard } from './GenericFileCard';
import { ProcessingNotice } from './ProcessingNotice';
import { ErrorState, LoadingSkeleton } from '../ui/StateViews';
import type { ProjectAttachment } from '../../types/domain';
import type { PdfDocument } from './PdfPage';

// A file's renderer is fetched only after that media kind is actually opened.
// Image projects never initialize document, playback or model-viewer code.
const AudioAttachment = lazy(() => import('./AudioAttachment').then(module => ({ default: module.AudioAttachment })));
const AudioPlayer = lazy(() => import('../profile/AudioPlayer').then(module => ({ default: module.AudioPlayer })));
const DocumentAttachment = lazy(() => import('./DocumentAttachment').then(module => ({ default: module.DocumentAttachment })));
const PdfViewer = lazy(() => import('../profile/PdfViewer').then(module => ({ default: module.PdfViewer })));
const VideoAttachment = lazy(() => import('./VideoAttachment').then(module => ({ default: module.VideoAttachment })));
const ModelAttachment = lazy(() => import('./ModelAttachment').then(module => ({ default: module.ModelAttachment })));

type AttachmentRendererProps = {
  projectId: string;
  attachment: ProjectAttachment;
  videoActive?: boolean;
  /** Catalogue previews expose controls without starting or looping playback. */
  inlinePreview?: boolean;
  /** Every image in project order, so a multi-image piece stays one viewer. */
  imagePages?: ProjectAttachment[];
  imageColumns?: number;
  projectTitle: string;
  /** Separately uploaded artwork for an audio project. */
  artwork?: { url: string; alt: string };
  processing?: {
    state: ProjectAttachment['status']; message: string | null;
    canRetry: boolean; isRetrying: boolean; onRetry: () => void;
  };
  onDocumentPageCountResolved?: (attachmentId: string, pageCount: number) => void;
  onPreviewDocument?: (document: PdfDocument | null) => void;
  onFocusModeChange?: (focused: boolean) => void;
  controlsVisible?: boolean;
  showMediaInteractions?: boolean;
  isOwner?: boolean;
  /** Public reading history stays separate from the signed-in workspace. */
  memoryScope?: string;
  usePdfRanges?: boolean;
  pageViewToggleRequest?: number;
  readingMode?: boolean;
  verticalReading?: boolean;
  manageReadingScroll?: boolean;
  readerPageRequest?: {page:number; sequence:number} | null;
  onReaderRequestHandled?: (sequence:number) => void;
  onClose: () => void;
};

/** The shared media-kind boundary; categories never choose a file's renderer. */
export function AttachmentRenderer({
  projectId, attachment, imagePages, imageColumns, projectTitle, artwork, processing,
  onDocumentPageCountResolved, onPreviewDocument, onFocusModeChange, controlsVisible,
  videoActive, inlinePreview = false, showMediaInteractions = true, isOwner = false, memoryScope = 'workspace', usePdfRanges = false,
  readingMode = false, verticalReading = false, manageReadingScroll = true, readerPageRequest = null, onReaderRequestHandled, pageViewToggleRequest = 0, onClose,
}: AttachmentRendererProps) {
  const title = attachment.displayName || projectTitle;
  const state = processing?.state ?? attachment.status;
  const openPdfRanges = usePdfRanges ? attachment.openPdfRanges : undefined;
  const hasRenderedPdf = usePdfRanges && attachment.metadata?.renderedPages?.some(page => page.sourceUrl);
  const canShowPdf = attachment.kind === 'document' && Boolean(attachment.sourceUrl || openPdfRanges || hasRenderedPdf);
  const canShowVideo = attachment.kind === 'video' && Boolean(attachment.metadata?.playbackVideo?.sourceUrl || attachment.sourceUrl);
  // An original PDF or playable video remains available during processing.
  // Other files state the confirmed processing result instead of an empty viewer.
  if ((state === 'processing' || state === 'processing-failed') && !canShowPdf && !canShowVideo) {
    return <MediaFrame>
      <ProcessingNotice attachment={attachment} state={state} message={processing?.message ?? null}
        canRetry={isOwner && (processing?.canRetry ?? false)} isRetrying={processing?.isRetrying ?? false}
        onRetry={processing?.onRetry ?? (() => undefined)} />
    </MediaFrame>;
  }
  const loading = <LoadingSkeleton kind="reader" projectId={projectId} label={`Loading ${title}…`} />;
  const documentLoading = <div data-page-loading="" data-initial-page-loading="">{loading}</div>;
  switch (attachment.kind) {
    case 'audio':
      // Real files use native audio; existing seeded work keeps its synthetic player.
      return attachment.sourceUrl ? <MediaFrame><Suspense fallback={loading}>
        <AudioAttachment attachment={attachment} />
      </Suspense></MediaFrame> : <Suspense fallback={<MediaFrame>{loading}</MediaFrame>}>
        <AudioPlayer fileName={title} duration={attachment.metadata?.durationSeconds ?? 0}
          artworkUrl={artwork?.url} artworkAlt={artwork?.alt} onClose={onClose} />
      </Suspense>;
    case 'document':
      if (!canShowPdf && usePdfRanges) {
        return <MediaFrame><ErrorState title="This PDF could not be loaded." /></MediaFrame>;
      }
      return canShowPdf ? <MediaFrame><Suspense fallback={documentLoading}>
        <DocumentAttachment verticalReading={verticalReading} manageReadingScroll={manageReadingScroll} readingMode={readingMode} readerPageRequest={readerPageRequest} onReaderRequestHandled={onReaderRequestHandled} attachment={attachment} columns={imageColumns}
          processing={state === 'processing' || state === 'processing-failed' ? {
            state, message: processing?.message ?? null, canRetry: processing?.canRetry ?? false,
            isRetrying: processing?.isRetrying ?? false, onRetry: processing?.onRetry ?? (() => undefined),
          } : undefined}
          projectId={projectId} onPageCountResolved={pageCount => onDocumentPageCountResolved?.(attachment.id, pageCount)}
          onPreviewDocument={onPreviewDocument} onFocusModeChange={onFocusModeChange} controlsVisible={controlsVisible}
          showMediaInteractions={showMediaInteractions} isOwner={isOwner} memoryScope={memoryScope}
          pageViewToggleRequest={pageViewToggleRequest} openPdfRanges={openPdfRanges} />
      </Suspense></MediaFrame> : <Suspense fallback={<MediaFrame>{documentLoading}</MediaFrame>}>
        <PdfViewer fileName={title} pageCount={attachment.metadata?.pageCount ?? 6} onClose={onClose} />
      </Suspense>;
    case 'image':
      return <MediaFrame>
        <ImageAttachment verticalReading={verticalReading} manageReadingScroll={manageReadingScroll} projectId={projectId} pages={imagePages && imagePages.length > 0 ? imagePages : [attachment]}
          columns={imageColumns} onFocusModeChange={onFocusModeChange} controlsVisible={controlsVisible}
          showMediaInteractions={showMediaInteractions} isOwner={isOwner} memoryScope={memoryScope}
          pageViewToggleRequest={pageViewToggleRequest} />
      </MediaFrame>;
    case 'video':
      return <MediaFrame><Suspense fallback={loading}>
        <VideoAttachment attachment={attachment} active={videoActive} inlinePreview={inlinePreview}
          conversion={processing ? { ...processing, canRetry: isOwner && processing.canRetry } : undefined} />
      </Suspense></MediaFrame>;
    case 'model3d':
      return <MediaFrame><Suspense fallback={loading}><ModelAttachment attachment={attachment} /></Suspense></MediaFrame>;
    default:
      return <MediaFrame><GenericFileCard attachment={attachment} /></MediaFrame>;
  }
}
