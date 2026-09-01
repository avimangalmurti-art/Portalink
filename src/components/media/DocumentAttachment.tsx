import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { GenericFileCard } from './GenericFileCard';
import { PdfImageDocument } from './PdfImageDocument';
import { useSinglePageZoom } from './useSinglePageZoom';
import type { ProjectAttachment } from '../../types/domain';
import { MAX_PAGES_PER_ROW, normalizePagesPerRow } from '../../features/projects/pageLayout';
import { readViewerMemory, updateViewerMemory } from './viewerMemory';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { MediaInteractionBar } from '../../features/media-interactions/MediaInteractionBar';

function deepLinkedDocumentPage(attachmentId: string, pageCount?: number): number | null {
  if (typeof window === 'undefined') return null;
  const query = new URLSearchParams(window.location.search);
  if (query.get('media') !== attachmentId) return null;
  const pageNumber = Number(query.get('page'));
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || (pageCount && pageNumber > pageCount)) return null;
  return pageNumber - 1;
}

/**
 * Every real PDF page is presented as page artwork inside the platform. The
 * browser's native PDF plug-in is never embedded, so its toolbar and Acrobat-
 * style reader chrome cannot leak into the product experience.
 */
export function DocumentAttachment({
  attachment,
  projectId,
  columns = 1,
  processing,
  onPageCountResolved,
  onFocusModeChange,
  controlsVisible = true,


}: {
  attachment: ProjectAttachment;
  projectId: string;
  columns?: number;
  onPageCountResolved?: (pageCount: number) => void;
  onFocusModeChange?: (focused: boolean) => void;
  controlsVisible?: boolean;
  processing?: {
    state: 'processing' | 'processing-failed';
    message: string | null;
    canRetry: boolean;
    isRetrying: boolean;
    onRetry: () => void;
  };
}) {
  const memoryKey = `document:${projectId}:${attachment.id}:rendered`;
  const liveDocumentMemoryKey = `document:${projectId}:${attachment.id}:live`;
  const [hasFailed, setHasFailed] = useState(false);
  const [focusedPageIndex, setFocusedPageIndex] = useState<number | null>(() => deepLinkedDocumentPage(attachment.id) ?? readViewerMemory(memoryKey).focusedPageNumber ?? null);
  const zoomSurfaceRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchRef = useRef<{ index: number; time: number; x: number; y: number } | null>(null);
  const lastTouchToggleAtRef = useRef(0);
  const handlePdfFailure = useCallback(() => setHasFailed(true), []);
  const renderedPages = (attachment.metadata?.renderedPages ?? [])
    .filter((page): page is typeof page & { sourceUrl: string } => Boolean(page.sourceUrl));
  const knownPageCount = Math.max(
    renderedPages.length,
    attachment.metadata?.pageCount ?? 0
  );
  useEffect(() => {
    if (knownPageCount > 0) {
      onPageCountResolved?.(knownPageCount);
    }
  }, [knownPageCount, onPageCountResolved]);
  useEffect(() => {
    const linkedPage = deepLinkedDocumentPage(attachment.id, renderedPages.length);
    if (linkedPage !== null) {
      setFocusedPageIndex(linkedPage);
      lastTouchRef.current = null;
      return;
    }
    const rememberedPage = readViewerMemory(memoryKey).focusedPageNumber;
    setFocusedPageIndex(typeof rememberedPage === 'number' && rememberedPage >= 0 && rememberedPage < renderedPages.length ? rememberedPage : null);
    lastTouchRef.current = null;
  }, [memoryKey, renderedPages.length]);
  const focusPage = useCallback((index: number) => {
    setFocusedPageIndex(index);
    updateViewerMemory(memoryKey, { focusedPageNumber: index });
  }, [memoryKey]);
  const exitFocus = useCallback(() => {
    setFocusedPageIndex(null);
    updateViewerMemory(memoryKey, { focusedPageNumber: null, zoom: 1 });
  }, [memoryKey]);
  const zoom = useSinglePageZoom({
    surfaceRef: zoomSurfaceRef,
    active: focusedPageIndex !== null,
    onExit: exitFocus,
    memoryKey
  });
  const moveFocusedPage = useCallback((direction: -1 | 1) => {
    if (focusedPageIndex === null) return;
    const next = Math.min(renderedPages.length - 1, Math.max(0, focusedPageIndex + direction));
    if (next !== focusedPageIndex) focusPage(next);
  }, [focusPage, focusedPageIndex, renderedPages.length]);
  useEffect(() => {
    if (focusedPageIndex !== null) zoomSurfaceRef.current?.focus({ preventScroll: true });
  }, [focusedPageIndex]);
  useLayoutEffect(() => {
    if (focusedPageIndex !== null) return;
    const element = zoomSurfaceRef.current;
    if (element) element.scrollTop = readViewerMemory(memoryKey).scrollTop ?? 0;
  }, [focusedPageIndex, memoryKey]);
  useEffect(() => {
    if (renderedPages.length === 0) {
      return undefined;
    }
    onFocusModeChange?.(focusedPageIndex !== null);
    return () => onFocusModeChange?.(false);
  }, [focusedPageIndex, onFocusModeChange, renderedPages.length]);
  if (!attachment.sourceUrl || hasFailed) {
    return <GenericFileCard attachment={attachment} />;
  }
  const columnCount = Math.min(normalizePagesPerRow(columns, 1), renderedPages.length || MAX_PAGES_PER_ROW);
  const displayedPages = focusedPageIndex === null
    ? renderedPages.map((page, index) => ({ page, index }))
    : renderedPages[focusedPageIndex]
      ? [{ page: renderedPages[focusedPageIndex], index: focusedPageIndex }]
      : [];
  return <div className="flex h-full w-full flex-col">
      {renderedPages.length > 0 ? <div key={focusedPageIndex === null ? 'document-grid' : `document-page-${focusedPageIndex}`} ref={zoomSurfaceRef} tabIndex={focusedPageIndex === null ? undefined : 0} onScroll={focusedPageIndex === null ? (event) => updateViewerMemory(memoryKey, { scrollTop: event.currentTarget.scrollTop }) : undefined} onKeyDown={focusedPageIndex === null ? undefined : (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          moveFocusedPage(-1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          moveFocusedPage(1);
        }
      }} onPointerDown={focusedPageIndex === null ? undefined : (event) => {
        if (event.pointerType === 'touch' && zoom <= 1.01) swipeStartRef.current = { x: event.clientX, y: event.clientY };
      }} onPointerUp={focusedPageIndex === null ? undefined : (event) => {
        const start = swipeStartRef.current;
        swipeStartRef.current = null;
        if (!start || event.pointerType !== 'touch' || zoom > 1.01) return;
        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        if (Math.abs(deltaX) > 56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) moveFocusedPage(deltaX < 0 ? 1 : -1);
      }} className={`${focusedPageIndex === null ? 'overflow-y-auto' : 'overflow-hidden outline-none'} premium-media-mode-enter relative min-h-0 flex-1 bg-[var(--surface-sunken)] p-4 sm:p-6`} style={focusedPageIndex === null ? undefined : { touchAction: 'pan-x pan-y' }}>
        {focusedPageIndex !== null ? <>
            <button type="button" onClick={exitFocus} aria-label="Exit single-page view" className="premium-viewer-exit-control absolute left-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full text-white">
              <InterfaceIcon icon={XIcon} size="lg" weight="medium" />
            </button>
            <MediaInteractionBar placement="focused" target={{
              projectId,
              attachmentId: attachment.id,
              pageIndex: focusedPageIndex,
              label: `${attachment.displayName}, page ${renderedPages[focusedPageIndex]?.withinDocumentIndex ?? focusedPageIndex + 1}`
            }} />
          </> : null}
        {focusedPageIndex !== null && renderedPages.length > 1 ? <>
            {focusedPageIndex > 0 ? <button type="button" data-viewer-page-control="" tabIndex={controlsVisible ? 0 : -1} onClick={() => moveFocusedPage(-1)} aria-label="Previous page" className="premium-viewer-page-control absolute left-6 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white sm:left-8">
              <InterfaceIcon icon={ChevronLeftIcon} size="lg" weight="medium" />
            </button> : null}
            {focusedPageIndex < renderedPages.length - 1 ? <button type="button" data-viewer-page-control="" tabIndex={controlsVisible ? 0 : -1} onClick={() => moveFocusedPage(1)} aria-label="Next page" className="premium-viewer-page-control absolute right-6 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white sm:right-8">
              <InterfaceIcon icon={ChevronRightIcon} size="lg" weight="medium" />
            </button> : null}
            <span data-viewer-page-control="" className="premium-viewer-page-counter pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums text-white">{focusedPageIndex + 1} / {renderedPages.length}</span>
          </> : null}
        <ol aria-label={`${attachment.displayName} pages`} className={`${focusedPageIndex === null ? 'max-w-[2048px] items-start' : 'h-full max-w-full items-center'} mx-auto grid w-full gap-2 sm:gap-3`} style={{ gridTemplateColumns: `repeat(${focusedPageIndex === null ? columnCount : 1}, minmax(0, 1fr))` }}>
          {displayedPages.map(({ page, index }) => <li key={page.storagePath} role={focusedPageIndex === index ? undefined : 'button'} tabIndex={focusedPageIndex === index ? undefined : 0} aria-pressed={focusedPageIndex === index ? undefined : false} aria-label={`${attachment.displayName}, page ${page.withinDocumentIndex}. ${focusedPageIndex === index ? 'Single-page view. Use the wheel or a two-finger gesture to zoom' : 'Double-click or double-tap to fill the viewer'}`} onDoubleClick={focusedPageIndex === index ? undefined : (event) => {
            event.preventDefault();
            if (performance.now() - lastTouchToggleAtRef.current < 500) return;
            focusPage(index);
          }} onPointerUp={focusedPageIndex === index ? undefined : (event) => {
            if (event.pointerType !== 'touch') return;
            const now = performance.now();
            const previous = lastTouchRef.current;
            const isDoubleTap = previous && previous.index === index && now - previous.time < 320 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 24;
            lastTouchRef.current = { index, time: now, x: event.clientX, y: event.clientY };
            if (isDoubleTap) {
              event.preventDefault();
              lastTouchRef.current = null;
              lastTouchToggleAtRef.current = now;
              focusPage(index);
            }
          }} onKeyDown={focusedPageIndex === index ? undefined : (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              focusPage(index);
            }
          }} className={`${focusedPageIndex === index ? `h-full min-h-0 overflow-auto overscroll-contain ${zoom > 1 ? 'items-start justify-start' : 'justify-center'}` : 'touch-manipulation justify-center'} group/media relative flex w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]`}>
            <img
              src={page.sourceUrl}
              alt={`${attachment.displayName}, page ${page.withinDocumentIndex}`}
              width={page.width}
              height={page.height}
              loading={page.withinDocumentIndex <= columnCount ? 'eager' : 'lazy'}
              fetchPriority={page.withinDocumentIndex <= columnCount ? 'high' : 'auto'}
              decoding="async"
              className={`${focusedPageIndex === index ? 'premium-focused-media max-h-none max-w-none' : 'h-auto max-h-full max-w-full'} bg-white object-contain`}
              style={focusedPageIndex === index ? { width: `${zoom * 100}%`, height: `${zoom * 100}%` } : undefined}
            />
            {focusedPageIndex !== index ? <MediaInteractionBar target={{
              projectId,
              attachmentId: attachment.id,
              pageIndex: index,
              label: `${attachment.displayName}, page ${page.withinDocumentIndex}`
            }} /> : null}
          </li>)}
        </ol>
      </div> : <PdfImageDocument projectId={projectId} attachmentId={attachment.id} source={attachment.sourceUrl} label={attachment.displayName} columns={columns} onError={handlePdfFailure} onPageCount={onPageCountResolved} onFocusModeChange={onFocusModeChange} memoryKey={liveDocumentMemoryKey} controlsVisible={controlsVisible} />}
      {/* The original PDF is already usable here, so a queued/processing job
          does not need a persistent footer. A genuine preview failure remains
          visible because it is actionable and may offer a retry. */}
      {processing?.state === 'processing-failed' && <div className="flex shrink-0 items-center gap-2 border-t border-[var(--hairline)] bg-[var(--surface-raised)] px-4 py-2">
        <p role="alert" aria-live="polite" className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]">
          {processing.message ?? 'The optimized page preview could not be prepared. The original PDF is still available.'}
        </p>
        {processing.canRetry && <Button variant="secondary" size="sm" onClick={processing.onRetry} disabled={processing.isRetrying}>
          {processing.isRetrying ? 'Starting…' : 'Retry preview'}
        </Button>}
      </div>}
    </div>;
}
