import { useDocumentReadingScroll } from './useDocumentReadingScroll';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { GenericFileCard } from './GenericFileCard';
import { PdfImageDocument } from './PdfImageDocument';
import type { PdfDocument } from './PdfPage';
import { useSinglePageZoom } from './useSinglePageZoom';
import { useFocusedPageSwipe } from './useFocusedPageSwipe';
import type { ProjectAttachment } from '../../types/domain';
import { MAX_PAGES_PER_ROW, normalizePagesPerRow } from '../../features/projects/pageLayout';
import { readViewerMemory, updateViewerMemory } from './viewerMemory';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { MediaInteractionBar } from '../../features/media-interactions/MediaInteractionBar';
import { FocusedPageExitControl } from './FocusedPageExitControl';
import { FocusedPageCounter } from './FocusedPageCounter';
import { markRumPdf, rumViewToken } from '../../features/performance/rum';

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
  onPreviewDocument,
  onFocusModeChange,
  controlsVisible = true,
  showMediaInteractions = true,
  isOwner = false,
  memoryScope = 'workspace',
  pageViewToggleRequest = 0,


}: {
  attachment: ProjectAttachment;
  projectId: string;
  columns?: number;
  onPageCountResolved?: (pageCount: number) => void;
  onPreviewDocument?: (document: PdfDocument | null) => void;
  onFocusModeChange?: (focused: boolean) => void;
  controlsVisible?: boolean;
  showMediaInteractions?: boolean;
  isOwner?: boolean;
  memoryScope?: string;
  pageViewToggleRequest?: number;
  processing?: {
    state: 'processing' | 'processing-failed';
    message: string | null;
    canRetry: boolean;
    isRetrying: boolean;
    onRetry: () => void;
  };
}) {
  const viewTokenRef = useRef<number | null>(null);
  useLayoutEffect(() => { viewTokenRef.current = rumViewToken(); });
  const memoryKey = `${memoryScope}:document:${projectId}:${attachment.id}:rendered`;
  const liveDocumentMemoryKey = `${memoryScope}:document:${projectId}:${attachment.id}:live`;
  const renderedPages = (attachment.metadata?.renderedPages ?? [])
    .filter((page): page is typeof page & { sourceUrl: string } => Boolean(page.sourceUrl));
  const knownPageCount = Math.max(
    renderedPages.length,
    attachment.metadata?.pageCount ?? 0
  );
  const [hasFailed, setHasFailed] = useState(false);
  const [focusedPageIndex, setFocusedPageIndex] = useState<number | null>(() => deepLinkedDocumentPage(attachment.id)
    ?? readViewerMemory(memoryKey).focusedPageNumber
    ?? null);
  const zoomSurfaceRef = useRef<HTMLDivElement>(null);
  const lastTouchRef = useRef<{ index: number; time: number; x: number; y: number } | null>(null);
  const lastTouchToggleAtRef = useRef(0);
  const handledViewToggleRequestRef = useRef(pageViewToggleRequest);
  const handlePdfFailure = useCallback(() => setHasFailed(true), []);
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
  }, [attachment.id, memoryKey, renderedPages.length]);
  const focusPage = useCallback((index: number) => {
    setFocusedPageIndex(index);
    updateViewerMemory(memoryKey, { focusedPageNumber: index, lastFocusedPageNumber: index });
  }, [memoryKey]);
  const exitFocus = useCallback(() => {
    setFocusedPageIndex((current) => {
      updateViewerMemory(memoryKey, { focusedPageNumber: null, ...(current !== null ? { lastFocusedPageNumber: current } : {}) });
      return null;
    });
  }, [memoryKey]);
  useEffect(() => {
    if (pageViewToggleRequest <= handledViewToggleRequestRef.current) return;
    handledViewToggleRequestRef.current = pageViewToggleRequest;
    if (focusedPageIndex !== null) {
      exitFocus();
      return;
    }
    const rememberedPage = readViewerMemory(memoryKey).lastFocusedPageNumber;
    const pageToRestore = typeof rememberedPage === 'number' && rememberedPage >= 0 && rememberedPage < renderedPages.length
      ? rememberedPage
      : renderedPages.length > 0 ? 0 : null;
    if (pageToRestore !== null) focusPage(pageToRestore);
  }, [exitFocus, focusPage, focusedPageIndex, memoryKey, pageViewToggleRequest, renderedPages.length]);
  const zoom = useSinglePageZoom({
    surfaceRef: zoomSurfaceRef,
    active: focusedPageIndex !== null,
    entryReady: renderedPages.length > 0,
    onEnter: (pageNumber, nextZoom) => {
      const index = pageNumber - 1;
      if (!renderedPages[index]) return;
      updateViewerMemory(`${memoryKey}:page:${index}`, { zoom: nextZoom, scrollTop: 0, scrollLeft: 0 });
      focusPage(index);
    },
    onExit: exitFocus,
    memoryKey: focusedPageIndex !== null ? `${memoryKey}:page:${focusedPageIndex}` : memoryKey
  });
  const moveFocusedPage = useCallback((direction: -1 | 1) => {
    if (focusedPageIndex === null) return;
    const next = Math.min(renderedPages.length - 1, Math.max(0, focusedPageIndex + direction));
    if (next !== focusedPageIndex) focusPage(next);
  }, [focusPage, focusedPageIndex, renderedPages.length]);
  const { isMobile, swipeStyle, swipeHandlers } = useFocusedPageSwipe({ active: focusedPageIndex !== null, zoom, onMove: moveFocusedPage, onExit: exitFocus });
  useEffect(() => {
    if (focusedPageIndex !== null) zoomSurfaceRef.current?.focus({ preventScroll: true });
  }, [focusedPageIndex]);
  useDocumentReadingScroll(isMobile && focusedPageIndex === null && renderedPages.length > 0, zoomSurfaceRef, memoryKey);
  const restoreFocusedScroll = useCallback(() => {
    if (isMobile && focusedPageIndex === null) return;
    const root = zoomSurfaceRef.current;
    const element = isMobile && focusedPageIndex !== null ? root?.querySelector<HTMLElement>('[data-focused-page-scroll]') : root;
    if (!element) return;
    const positionMemoryKey = focusedPageIndex !== null ? `${memoryKey}:page:${focusedPageIndex}` : memoryKey;
    const remembered = readViewerMemory(positionMemoryKey);
    element.scrollTop = remembered.scrollTop ?? 0;
    element.scrollLeft = remembered.scrollLeft ?? 0;
  }, [focusedPageIndex, isMobile, memoryKey]);
  useLayoutEffect(restoreFocusedScroll, [restoreFocusedScroll]);
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
  return <div data-document-attachment="" className="flex h-full w-full flex-col">
      {renderedPages.length > 0 ? <div key={focusedPageIndex === null ? 'document-grid' : isMobile ? 'document-focused' : `document-page-${focusedPageIndex}`} ref={zoomSurfaceRef} tabIndex={focusedPageIndex === null ? undefined : 0} onScroll={(event) => {
        const positionMemoryKey = focusedPageIndex !== null ? `${memoryKey}:page:${focusedPageIndex}` : memoryKey;
        updateViewerMemory(positionMemoryKey, { scrollTop: event.currentTarget.scrollTop, scrollLeft: event.currentTarget.scrollLeft });
      }} onKeyDown={focusedPageIndex === null ? undefined : (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          moveFocusedPage(-1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          moveFocusedPage(1);
        }
      }} {...swipeHandlers} data-mobile-focused-view={isMobile && focusedPageIndex !== null ? '' : undefined} className={`${focusedPageIndex === null ? 'overflow-y-auto p-4 sm:p-6' : 'overflow-hidden p-0 outline-none'} premium-media-mode-enter relative min-h-0 flex-1 bg-[var(--surface-sunken)]`} style={focusedPageIndex === null ? undefined : swipeStyle}>
        {focusedPageIndex !== null ? <FocusedPageExitControl
          onExit={exitFocus}
        /> : null}
        {focusedPageIndex !== null && renderedPages.length > 1 ? <>
            {!isMobile && focusedPageIndex > 0 ? <button type="button" data-viewer-page-control="" tabIndex={controlsVisible ? 0 : -1} onClick={() => moveFocusedPage(-1)} data-side="previous" aria-label="Previous page" className="premium-viewer-page-control side-panel-compact-control absolute left-2 top-1/2 z-30 flex -translate-y-1/2 items-center justify-center text-white">
              <InterfaceIcon icon={ChevronLeftIcon} size="lg" weight="medium" />
            </button> : null}
            {!isMobile && focusedPageIndex < renderedPages.length - 1 ? <button type="button" data-viewer-page-control="" tabIndex={controlsVisible ? 0 : -1} onClick={() => moveFocusedPage(1)} data-side="next" aria-label="Next page" className="premium-viewer-page-control side-panel-compact-control absolute right-2 top-1/2 z-30 flex -translate-y-1/2 items-center justify-center text-white">
              <InterfaceIcon icon={ChevronRightIcon} size="lg" weight="medium" />
            </button> : null}
            <FocusedPageCounter current={focusedPageIndex + 1} total={renderedPages.length} showMediaInteractions={showMediaInteractions} />
          </> : null}
        <ol aria-label={`${attachment.displayName} pages`} className={`${focusedPageIndex === null ? 'max-w-[2048px] items-start' : 'h-full max-w-full items-center'} mx-auto grid w-full gap-[2px]`} style={{ gridTemplateColumns: `repeat(${focusedPageIndex === null ? columnCount : 1}, minmax(0, 1fr))` }}>
          {displayedPages.map(({ page, index }) => <li key={isMobile && focusedPageIndex !== null ? 'focused' : page.storagePath} data-project-page-number={index + 1} data-project-page-total={renderedPages.length} role={focusedPageIndex === index ? undefined : 'button'} tabIndex={focusedPageIndex === index ? undefined : 0} aria-pressed={focusedPageIndex === index ? undefined : false} aria-label={`${attachment.displayName}, page ${page.withinDocumentIndex}. ${focusedPageIndex === index ? 'Single-page view. Scroll to return to all pages. Pinch or Control plus wheel to zoom' : 'Pinch or Control plus wheel to zoom into single-page view. Double-click or double-tap also opens it'}`} onDoubleClick={focusedPageIndex === index ? undefined : (event) => {
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
          }} data-focused-page-scroll={focusedPageIndex === index ? '' : undefined} onScroll={isMobile && focusedPageIndex === index ? (event) => updateViewerMemory(`${memoryKey}:page:${index}`, { scrollTop: event.currentTarget.scrollTop, scrollLeft: event.currentTarget.scrollLeft }) : undefined} className={`${focusedPageIndex === index ? 'h-full min-h-0 items-start justify-start overflow-auto overscroll-contain' : 'touch-manipulation justify-center'} group/media relative flex w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]`}>
            <img
              data-media-page-surface=""
              src={page.sourceUrl}
              alt={`${attachment.displayName}, page ${page.withinDocumentIndex}`}
              width={page.width}
              height={page.height}
              loading={(isMobile && focusedPageIndex === index) || page.withinDocumentIndex <= columnCount ? 'eager' : 'lazy'}
              fetchPriority={(isMobile && focusedPageIndex === index) || page.withinDocumentIndex <= columnCount ? 'high' : 'auto'}
              decoding="async"
              onLoad={() => {
                markRumPdf(viewTokenRef.current);
                if (isMobile && focusedPageIndex === index) restoreFocusedScroll();
              }}
              className={`${focusedPageIndex === index ? 'premium-focused-media m-auto max-h-none max-w-none' : 'h-auto max-h-full max-w-full'} bg-white object-contain`}
              style={focusedPageIndex === index ? { width: `${zoom * 100}%`, height: `${zoom * 100}%` } : undefined}
            />
            {showMediaInteractions && !isMobile && <MediaInteractionBar placement={focusedPageIndex === index ? 'focused' : 'page'} pageCount={renderedPages.length} isOwner={isOwner} target={{
              projectId,
              attachmentId: attachment.id,
              pageIndex: index,
              label: `${attachment.displayName}, page ${page.withinDocumentIndex}`
            }} />}
          </li>)}
        </ol>
        {isMobile && focusedPageIndex !== null && showMediaInteractions ? <MediaInteractionBar placement="focused" pageCount={renderedPages.length} isOwner={isOwner} target={{
          projectId,
          attachmentId: attachment.id,
          pageIndex: focusedPageIndex,
          label: attachment.displayName
        }} /> : null}
      </div> : <PdfImageDocument projectId={projectId} attachmentId={attachment.id} source={attachment.sourceUrl} label={attachment.displayName} columns={columns} onError={handlePdfFailure} onPageCount={onPageCountResolved} onPreviewDocument={onPreviewDocument} onFocusModeChange={onFocusModeChange} memoryKey={liveDocumentMemoryKey} controlsVisible={controlsVisible} showMediaInteractions={showMediaInteractions} isOwner={isOwner} pageViewToggleRequest={pageViewToggleRequest} />}
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
