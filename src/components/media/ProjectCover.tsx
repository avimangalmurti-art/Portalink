import React, { Suspense, lazy, useEffect, useState } from 'react';
import { FileIcon } from 'lucide-react';
import type { Project, ProjectAttachment, ProjectCoverFrame, ProjectCoverThumbnail } from '../../types/domain';
import { ResponsiveImage, type ImagePriority } from '../ui/ResponsiveImage';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { normalizeProjectCoverFrame } from '../../utils/coverFrame';
import { coverThumbnailSources } from '../../features/media/coverThumbnailSources';

// Only legacy projects without a stored thumbnail may ask for the PDF module.
const PdfPage = lazy(() => import('./PdfPage').then(module => ({ default: module.PdfPage })));

type ProjectCoverProps = {
  source: string | null | undefined;
  previewSource?: string;
  thumbnail?: ProjectCoverThumbnail;
  alt: string;
  kind?: Project['coverKind'];
  fit?: 'cover' | 'contain';
  className?: string;
  aspectRatio?: number;
  sizes?: string;
  priority?: ImagePriority;
  /** Visitor grids show existing bitmaps or a placeholder, never a live PDF. */
  allowPdfFallback?: boolean;
  /** Visitor grids defer original video playback until the project is opened. */
  allowVideoFallback?: boolean;
  frame?: ProjectCoverFrame;
  pageNumber?: number;
  onDocumentPageCountChange?: (pageCount: number) => void;
  /** Shared cards may use existing project artwork when no cover was chosen. */
  fallbackAttachments?: ProjectAttachment[];
};

function firstAttachmentCover(attachments: ProjectAttachment[] | undefined) {
  for (const attachment of [...(attachments ?? [])].sort((a, b) => a.order - b.order)) {
    if (attachment.kind === 'image' && attachment.sourceUrl) {
      return { source: attachment.sourceUrl, kind: undefined, previewSource: undefined, aspectRatio: attachment.metadata?.aspectRatio, document: false };
    }
    if (attachment.kind === 'video' && attachment.sourceUrl) {
      return { source: attachment.sourceUrl, kind: 'video' as const, previewSource: undefined, aspectRatio: attachment.metadata?.aspectRatio, document: false };
    }
    if (attachment.kind !== 'document') continue;
    const firstPage = attachment.metadata?.renderedPages?.find(page =>
      page.attachmentId === attachment.id && page.withinDocumentIndex === 1 && page.sourceUrl);
    const source = attachment.sourceUrl || firstPage?.sourceUrl;
    if (source) {
      return { source, kind: attachment.sourceUrl ? 'document' as const : undefined,
        previewSource: attachment.sourceUrl ? firstPage?.sourceUrl ?? undefined : undefined,
        aspectRatio: firstPage?.aspectRatio ?? attachment.metadata?.aspectRatio, document: true };
    }
  }
}

/** One cover renderer shared by every project surface. */
export function ProjectCover({
  source: chosenSource,
  previewSource: chosenPreviewSource,
  thumbnail,
  alt,
  kind: chosenKind,
  fit = 'cover',
  className = '',
  aspectRatio: chosenAspectRatio,
  sizes,
  priority = false,
  allowPdfFallback = true,
  allowVideoFallback = true,
  frame,
  pageNumber: chosenPageNumber = 1,
  onDocumentPageCountChange,
  fallbackAttachments,
}: ProjectCoverProps) {
  const fallback = chosenSource ? undefined : firstAttachmentCover(fallbackAttachments);
  const source = chosenSource || fallback?.source;
  const previewSource = fallback ? fallback.previewSource : chosenPreviewSource;
  const kind = fallback ? fallback.kind : chosenKind;
  const aspectRatio = fallback?.aspectRatio ?? chosenAspectRatio;
  const pageNumber = fallback ? 1 : chosenPageNumber;
  const effectiveFit = fallback?.document ? 'contain' : fit;
  const [imageFailed, setImageFailed] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const storedImage = coverThumbnailSources(thumbnail);
  useEffect(() => setImageFailed(false), [source, storedImage?.src]);
  useEffect(() => setPreviewFailed(false), [source, previewSource]);
  const placeholder = <span role="img" aria-label={imageFailed || thumbnail || (kind === 'document' && !allowPdfFallback) || (kind === 'video' && !allowVideoFallback) ? `${alt} preview unavailable` : `${alt} has no cover`} className={`flex h-full w-full items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-tertiary)] ${className}`}>
        <InterfaceIcon icon={FileIcon} size="xl" weight="medium" />
      </span>;
  if (thumbnail) {
    // A failed thumbnail stays a placeholder; never download the original or
    // start a PDF worker because one cacheable image could not be fetched.
    return !storedImage || imageFailed ? placeholder : <ResponsiveImage {...storedImage}
      trackCoverPaint
      alt={alt} sizes={sizes} measureWidth priority={priority} data-project-cover-thumbnail=""
      onError={() => setImageFailed(true)} className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`} />;
  }
  if (!source || imageFailed) {
    return placeholder;
  }
  const normalizedFrame = !fallback && frame && fit === 'cover' ? normalizeProjectCoverFrame(frame) : null;
  const objectPosition = normalizedFrame
    ? `${normalizedFrame.x * 100}% ${normalizedFrame.y * 100}%`
    : undefined;
  const safeRatio = aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const useDocumentPreview = kind === 'document' && Boolean(previewSource) && !previewFailed;
  const renderPdf = kind === 'document' && !useDocumentPreview;
  if (renderPdf && !allowPdfFallback) return placeholder;
  if (kind === 'video' && !allowVideoFallback) return placeholder;
  const content = renderPdf
    ? <Suspense fallback={placeholder}><PdfPage source={source} label={`${alt}, PDF cover`} pageNumber={pageNumber} onPageCountChange={onDocumentPageCountChange} fit={normalizedFrame ? 'cover' : 'contain'} objectPosition={objectPosition} className="h-full w-full" /></Suspense>
    : kind === 'video'
      ? <video
          src={source}
          aria-label={alt}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          style={{ objectPosition }}
          className={`h-full w-full ${effectiveFit === 'cover' ? 'object-cover' : 'object-contain'}`}
        />
      : <ResponsiveImage
          trackCoverPaint
          src={useDocumentPreview && previewSource ? previewSource : source}
          alt={alt}
          width={Math.max(1, Math.round(safeRatio * 1000))}
          height={1000}
          sizes={sizes}
          priority={priority}
          onError={() => useDocumentPreview ? setPreviewFailed(true) : setImageFailed(true)}
          style={{ objectPosition }}
          className={`h-full w-full ${useDocumentPreview ? 'bg-white ' : ''}${(useDocumentPreview ? Boolean(normalizedFrame) : effectiveFit === 'cover') ? 'object-cover' : 'object-contain'}`}
        />;

  if (!normalizedFrame) {
    if (renderPdf) {
      return <Suspense fallback={placeholder}><PdfPage source={source} label={`${alt}, PDF cover`} pageNumber={pageNumber} onPageCountChange={onDocumentPageCountChange} className={className} /></Suspense>;
    }
    return React.cloneElement(content, {
      className: `${content.props.className ?? ''} ${className}`.trim(),
    });
  }

  return <span className={`relative block h-full w-full overflow-hidden ${className}`}>
    <span
      className="absolute inset-0 block h-full w-full"
      style={{
        transform: `scale3d(${normalizedFrame.zoom}, ${normalizedFrame.zoom}, 1)`,
        transformOrigin: objectPosition,
      }}
    >
      {content}
    </span>
  </span>;
}
