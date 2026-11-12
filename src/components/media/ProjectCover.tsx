import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
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
  showLoadingIndicator?: boolean;
  /** Visitor grids show existing bitmaps or a placeholder, never a live PDF. */
  allowPdfFallback?: boolean;
  /** Visitor grids defer original video playback until the project is opened. */
  allowVideoFallback?: boolean;
  /** Opt-in cover playback for mobile Home. An empty list keeps the poster. */
  autoplaySources?: string[];
  frame?: ProjectCoverFrame;
  pageNumber?: number;
  onDocumentPageCountChange?: (pageCount: number) => void;
  /** Shared cards may use existing project artwork when no cover was chosen. */
  fallbackAttachments?: ProjectAttachment[];
};

function PlayingCoverVideo({ sources, fit, frame, showFirstFrame }: {
  sources: string[]; fit: 'cover' | 'contain'; frame?: ProjectCoverFrame | null; showFirstFrame: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [painted, setPainted] = useState(false);
  const source = sources[sourceIndex];
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.defaultMuted = true;
    video.muted = true;
    void video.play().catch(() => { /* Keep the poster when the browser blocks autoplay. */ });
    return () => video.pause();
  }, [source]);
  if (!source) return null;
  const objectPosition = frame ? `${frame.x * 100}% ${frame.y * 100}%` : undefined;
  return <video ref={ref} key={source} src={source} autoPlay muted loop playsInline preload="auto"
    data-feed-cover-video="" className={`block h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
    style={{ opacity: painted ? 1 : 0, objectPosition, transform: frame ? `scale(${frame.zoom})` : undefined, transformOrigin: objectPosition }}
    onLoadedData={showFirstFrame ? () => setPainted(true) : undefined}
    onPlaying={() => setPainted(true)} onPause={showFirstFrame ? undefined : () => setPainted(false)}
    onError={() => { setPainted(false); setSourceIndex(index => index + 1); }} />;
}

function VisibleCoverVideo(props: React.ComponentProps<typeof PlayingCoverVideo>) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const host = ref.current;
    if (!host || typeof IntersectionObserver === 'undefined') return;
    let intersects = false;
    const sync = () => setVisible(intersects && document.visibilityState === 'visible');
    const observer = new IntersectionObserver(([entry]) => {
      intersects = entry.isIntersecting && entry.intersectionRatio >= 0.01;
      sync();
    }, { threshold: 0.01 });
    observer.observe(host);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return <span ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 block overflow-hidden">
    {visible && <PlayingCoverVideo key={JSON.stringify(props.sources)} {...props} />}
  </span>;
}

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
  showLoadingIndicator = false,
  allowPdfFallback = true,
  allowVideoFallback = true,
  autoplaySources,
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
  const [loadedAsset, setLoadedAsset] = useState<string>();
  const storedImage = coverThumbnailSources(thumbnail);
  const useDocumentPreview = kind === 'document' && Boolean(previewSource) && !previewFailed;
  const mediaSource = useDocumentPreview && previewSource ? previewSource : source;
  const activeAsset = storedImage?.src ?? mediaSource;
  useEffect(() => setImageFailed(false), [source, storedImage?.src]);
  useEffect(() => setPreviewFailed(false), [source, previewSource]);
  useEffect(() => {
    if (showLoadingIndicator) setLoadedAsset(current => current === activeAsset ? current : undefined);
  }, [activeAsset, showLoadingIndicator]);
  const placeholder = <span data-project-cover-placeholder="" role="img" aria-label={imageFailed || thumbnail || (kind === 'document' && !allowPdfFallback) || (kind === 'video' && (!allowVideoFallback || autoplaySources)) ? `${alt} preview unavailable` : `${alt} has no cover`} className={`flex h-full w-full items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-tertiary)] ${className}`}>
        <InterfaceIcon icon={FileIcon} size="xl" weight="medium" />
      </span>;
  const loadingMark = showLoadingIndicator ? <span data-project-cover-loading="" aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <span className="premium-media-loading-mark" />
  </span> : null;
  const assetLoading = showLoadingIndicator && loadedAsset !== activeAsset;
  const markLoaded = showLoadingIndicator ? () => setLoadedAsset(activeAsset) : undefined;
  const withLoading = (media: React.ReactElement) => showLoadingIndicator
    ? <>{media}{assetLoading && loadingMark}</> : media;
  const withVideo = (poster: React.ReactElement, showFirstFrame = false) => autoplaySources?.length
    ? <span className="relative block h-full w-full">{poster}<VisibleCoverVideo sources={autoplaySources} fit={effectiveFit}
        frame={frame && effectiveFit === 'cover' ? normalizeProjectCoverFrame(frame) : null} showFirstFrame={showFirstFrame} /></span>
    : poster;
  if (thumbnail) {
    // A failed thumbnail does not trigger original media downloads. Mobile
    // Home passes its own authorized sources when a video preview is enabled.
    const posterMissing = !storedImage || imageFailed;
    const poster = posterMissing ? placeholder : withLoading(<ResponsiveImage {...storedImage}
      key={showLoadingIndicator ? storedImage.src : undefined}
      trackCoverPaint
      alt={alt} sizes={sizes} measureWidth priority={priority} data-project-cover-thumbnail=""
      onLoad={markLoaded}
      onError={() => setImageFailed(true)} className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`} />);
    return withVideo(poster, posterMissing);
  }
  if (autoplaySources) return withVideo(placeholder, true);
  if (!source || imageFailed) {
    return placeholder;
  }
  const normalizedFrame = !fallback && frame && fit === 'cover' ? normalizeProjectCoverFrame(frame) : null;
  const objectPosition = normalizedFrame
    ? `${normalizedFrame.x * 100}% ${normalizedFrame.y * 100}%`
    : undefined;
  const safeRatio = aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const renderPdf = kind === 'document' && !useDocumentPreview;
  if (renderPdf && !allowPdfFallback) return placeholder;
  if (kind === 'video' && !allowVideoFallback) return placeholder;
  const content = renderPdf
    ? <Suspense fallback={loadingMark ?? placeholder}><PdfPage source={source} label={`${alt}, PDF cover`} pageNumber={pageNumber} onPageCountChange={onDocumentPageCountChange} showLoadingIndicator={showLoadingIndicator} fit={normalizedFrame ? 'cover' : 'contain'} objectPosition={objectPosition} className="h-full w-full" /></Suspense>
    : kind === 'video'
      ? <video
          key={showLoadingIndicator ? source : undefined}
          src={source}
          aria-label={alt}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onLoadedData={markLoaded}
          onCanPlay={markLoaded}
          onError={showLoadingIndicator ? () => setImageFailed(true) : undefined}
          style={{ objectPosition }}
          className={`h-full w-full ${effectiveFit === 'cover' ? 'object-cover' : 'object-contain'}`}
        />
      : <ResponsiveImage
          key={showLoadingIndicator ? mediaSource : undefined}
          trackCoverPaint
          src={mediaSource ?? source}
          alt={alt}
          width={Math.max(1, Math.round(safeRatio * 1000))}
          height={1000}
          sizes={sizes}
          priority={priority}
          onLoad={markLoaded}
          onError={() => useDocumentPreview ? setPreviewFailed(true) : setImageFailed(true)}
          style={{ objectPosition }}
          className={`h-full w-full ${useDocumentPreview && !assetLoading ? 'bg-white ' : ''}${(useDocumentPreview ? Boolean(normalizedFrame) : effectiveFit === 'cover') ? 'object-cover' : 'object-contain'}`}
        />;

  if (!normalizedFrame) {
    if (renderPdf) {
      return <Suspense fallback={loadingMark ?? placeholder}><PdfPage source={source} label={`${alt}, PDF cover`} pageNumber={pageNumber} onPageCountChange={onDocumentPageCountChange} showLoadingIndicator={showLoadingIndicator} className={className} /></Suspense>;
    }
    return withLoading(React.cloneElement(content, {
      className: `${content.props.className ?? ''} ${className}`.trim(),
    }));
  }

  return <span className={`relative block h-full w-full overflow-hidden ${className}`}>
    <span
      className="absolute inset-0 block h-full w-full"
      style={{
        transform: `scale3d(${normalizedFrame.zoom}, ${normalizedFrame.zoom}, 1)`,
        transformOrigin: objectPosition,
        ...(renderPdf && showLoadingIndicator ? {
          '--cover-loading-counter-transform': `scale(${1 / normalizedFrame.zoom})`,
          '--cover-loading-transform-origin': objectPosition,
        } : {}),
      } as React.CSSProperties}
    >
      {content}
    </span>
    {!renderPdf && assetLoading && loadingMark}
  </span>;
}
