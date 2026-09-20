import React, { useEffect, useState } from 'react';
import { FileIcon } from 'lucide-react';
import { PdfPage } from './PdfPage';
import type { Project, ProjectCoverFrame } from '../../types/domain';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { normalizeProjectCoverFrame } from '../../utils/coverFrame';

type ProjectCoverProps = {
  source: string | null | undefined;
  previewSource?: string;
  alt: string;
  kind?: Project['coverKind'];
  fit?: 'cover' | 'contain';
  className?: string;
  aspectRatio?: number;
  sizes?: string;
  priority?: boolean;
  frame?: ProjectCoverFrame;
  pageNumber?: number;
  onDocumentPageCountChange?: (pageCount: number) => void;
};

/** One cover renderer shared by every project surface. */
export function ProjectCover({
  source,
  previewSource,
  alt,
  kind,
  fit = 'cover',
  className = '',
  aspectRatio,
  sizes,
  priority = false,
  frame,
  pageNumber = 1,
  onDocumentPageCountChange,
}: ProjectCoverProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => setImageFailed(false), [source]);
  useEffect(() => setPreviewFailed(false), [source, previewSource]);
  if (!source || imageFailed) {
    return <span role="img" aria-label={imageFailed ? `${alt} preview unavailable` : `${alt} has no cover`} className={`flex h-full w-full items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-tertiary)] ${className}`}>
        <InterfaceIcon icon={FileIcon} size="xl" weight="medium" />
      </span>;
  }
  const normalizedFrame = frame && fit === 'cover' ? normalizeProjectCoverFrame(frame) : null;
  const objectPosition = normalizedFrame
    ? `${normalizedFrame.x * 100}% ${normalizedFrame.y * 100}%`
    : undefined;
  const safeRatio = aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const useDocumentPreview = kind === 'document' && Boolean(previewSource) && !previewFailed;
  const renderPdf = kind === 'document' && !useDocumentPreview;
  const content = renderPdf
    ? <PdfPage source={source} label={`${alt}, PDF cover`} pageNumber={pageNumber} onPageCountChange={onDocumentPageCountChange} fit={normalizedFrame ? 'cover' : 'contain'} objectPosition={objectPosition} className="h-full w-full" />
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
          className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        />
      : <ResponsiveImage
          src={useDocumentPreview && previewSource ? previewSource : source}
          alt={alt}
          width={Math.max(1, Math.round(safeRatio * 1000))}
          height={1000}
          sizes={sizes}
          priority={priority}
          onError={() => useDocumentPreview ? setPreviewFailed(true) : setImageFailed(true)}
          style={{ objectPosition }}
          className={`h-full w-full ${useDocumentPreview ? 'bg-white ' : ''}${(useDocumentPreview ? Boolean(normalizedFrame) : fit === 'cover') ? 'object-cover' : 'object-contain'}`}
        />;

  if (!normalizedFrame) {
    if (renderPdf) {
      return <PdfPage source={source} label={`${alt}, PDF cover`} pageNumber={pageNumber} onPageCountChange={onDocumentPageCountChange} className={className} />;
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
