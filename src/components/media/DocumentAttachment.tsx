import {DocumentGridPreview} from './DocumentGridPreview';
import { useDocumentReadingScroll } from './useDocumentReadingScroll';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/StateViews';
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
import { useMobileMediaRecovery } from './useMobileMediaRecovery';

/** Retry the failed image in place; the reader, zoom surface and scroll host stay mounted. */
function RecoverableDocumentImage({ source, onReadStateChange, onLoad, onError, ...props }: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  source: string;
  onReadStateChange: (source: string, pending: boolean) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const currentSource = useRef(source);
  currentSource.current = source;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [settledSource, setSettledSource] = useState<string | null>(null);
  useLayoutEffect(() => {
    onReadStateChange(source, true);
    return () => onReadStateChange(source, false);
  }, [onReadStateChange, source]);
  useMobileMediaRecovery({
    hostRef: imageRef,
    identity: source,
    failed: failedSource === source,
    loading: settledSource !== source && failedSource !== source,
    onRetry: () => {
      const image = imageRef.current;
      if (!image || currentSource.current !== source) return;
      onReadStateChange(source, true);
      setFailedSource(null);
      setSettledSource(null);
      image.src = source;
    }
  });
  return <img {...props} ref={imageRef} src={source} onError={event => {
    if (currentSource.current !== source) return;
    setFailedSource(source);
    setSettledSource(source);
    onReadStateChange(source, true);
    onError?.(event);
  }} onLoad={event => {
    if (currentSource.current !== source) return;
    setFailedSource(null);
    setSettledSource(source);
    onReadStateChange(source, false);
    onLoad?.(event);
  }} />;
}

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
  openPdfRanges,
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
  pageViewToggleRequest = 0, readingMode = false, verticalReading = false, manageReadingScroll = true, readerPageRequest = null, onReaderRequestHandled,


}: {
  attachment: ProjectAttachment;
  openPdfRanges?: ProjectAttachment['openPdfRanges'];
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
  readingMode?: boolean;
  verticalReading?: boolean;
  manageReadingScroll?: boolean;
  readerPageRequest?: {page:number; sequence:number} | null;
  onReaderRequestHandled?: (sequence:number) => void;
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
  // The overview remounts when entering/leaving focus. Keep only each current
  // page's last successfully presented source in this reader's lifetime.
  const renderedPresentation = useRef<{ attachmentId: string; source: string | null | undefined; pages: Map<number, string> } | null>(null);
  if (renderedPresentation.current?.attachmentId !== attachment.id || renderedPresentation.current?.source !== attachment.sourceUrl) {
    renderedPresentation.current = { attachmentId: attachment.id, source: attachment.sourceUrl, pages: new Map() };
  }
  const presentedRenderedPages = renderedPresentation.current.pages;
  useEffect(() => {
    for (const pageNumber of presentedRenderedPages.keys()) {
      if (pageNumber > renderedPages.length) presentedRenderedPages.delete(pageNumber);
    }
  }, [presentedRenderedPages, renderedPages.length]);
  const knownPageCount = Math.max(
    renderedPages.length,
    attachment.metadata?.pageCount ?? 0
  );
  const [hasFailed, setHasFailed] = useState(false);
  const [focusedPageIndex, setFocusedPageIndex] = useState<number | null>(() => verticalReading ? null : deepLinkedDocumentPage(attachment.id)
    ?? readViewerMemory(memoryKey).focusedPageNumber
    ?? (readingMode ? 0 : null));
  const [paintedReaderPage, setPaintedReaderPage] = useState<string | null>(null);
  const attachmentRef = useRef<HTMLDivElement>(null);
  const zoomSurfaceRef = useRef<HTMLDivElement>(null);
  const pendingRenderedPages = useRef(new Set<string>());
  const markRenderedPagePending = useCallback((source: string, pending: boolean) => {
    if (pending) pendingRenderedPages.current.add(source);
    else pendingRenderedPages.current.delete(source);
  }, []);
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
    if (verticalReading) { setFocusedPageIndex(null); lastTouchRef.current = null; return; }
    const linkedPage = deepLinkedDocumentPage(attachment.id, renderedPages.length);
    if (linkedPage !== null) {
      setFocusedPageIndex(linkedPage);
      lastTouchRef.current = null;
      return;
    }
    const livePage = readViewerMemory(liveDocumentMemoryKey).focusedPageNumber;
    const rememberedPage = readingMode && typeof livePage === 'number' ? livePage-1 : readViewerMemory(memoryKey).focusedPageNumber;
    setFocusedPageIndex(typeof rememberedPage === 'number' && rememberedPage >= 0 && rememberedPage < renderedPages.length ? rememberedPage : readingMode ? 0 : null);
    lastTouchRef.current = null;
  }, [attachment.id, memoryKey, liveDocumentMemoryKey, renderedPages.length, readingMode, verticalReading]);
  useEffect(() => {setPaintedReaderPage(null);},[focusedPageIndex]);
  const focusPage = useCallback((index: number) => {
    setFocusedPageIndex(index);
    updateViewerMemory(memoryKey, { focusedPageNumber: index, lastFocusedPageNumber: index });
    if (readingMode) updateViewerMemory(liveDocumentMemoryKey, { focusedPageNumber: index+1, lastFocusedPageNumber: index+1 });
  }, [memoryKey, readingMode, liveDocumentMemoryKey]);
  useEffect(() => {
    if (readingMode && readerPageRequest && renderedPages.length) {
      focusPage(Math.min(renderedPages.length,readerPageRequest.page)-1);
      onReaderRequestHandled?.(readerPageRequest.sequence);
    }
  }, [readingMode, readerPageRequest, renderedPages.length, focusPage, onReaderRequestHandled]);
  const exitFocus = useCallback(() => {
    if (readingMode) return;
    setFocusedPageIndex((current) => {
      updateViewerMemory(memoryKey, { focusedPageNumber: null, ...(current !== null ? { lastFocusedPageNumber: current } : {}) });
      return null;
    });
  }, [memoryKey, readingMode]);
  useEffect(() => {
    if (readingMode) return;
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
  }, [exitFocus, focusPage, focusedPageIndex, memoryKey, pageViewToggleRequest, renderedPages.length, readingMode]);
  const zoom = useSinglePageZoom({
    surfaceRef: zoomSurfaceRef,
    active: focusedPageIndex !== null, stayFocused: readingMode,
    entryReady: renderedPages.length > 0,
    onEnter: (pageNumber, nextZoom) => {
      const index = pageNumber - 1;
      if (!renderedPages[index]) return;
      if (nextZoom !== undefined) updateViewerMemory(`${memoryKey}:page:${index}`, { zoom: nextZoom, scrollTop: 0, scrollLeft: 0 });
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
  const { isMobile, swipeStyle, swipeHandlers } = useFocusedPageSwipe({ active: focusedPageIndex !== null, zoom, onMove: moveFocusedPage, onExit: exitFocus, readingMode });
  useEffect(() => {
    if (isMobile) setHasFailed(false);
  }, [attachment.id, attachment.sourceUrl, isMobile, openPdfRanges]);
  useMobileMediaRecovery({
    hostRef: attachmentRef,
    identity: openPdfRanges ?? attachment.sourceUrl,
    enabled: Boolean(openPdfRanges || attachment.sourceUrl) && renderedPages.length === 0,
    failed: hasFailed,
    onRetry: () => setHasFailed(false)
  });
  useEffect(() => {
    if (focusedPageIndex !== null) zoomSurfaceRef.current?.focus({ preventScroll: true });
  }, [focusedPageIndex]);
  const linkedPage = deepLinkedDocumentPage(attachment.id, renderedPages.length);
  useDocumentReadingScroll(manageReadingScroll && isMobile && focusedPageIndex === null && renderedPages.length > 0, zoomSurfaceRef, memoryKey, verticalReading && linkedPage !== null ? linkedPage + 1 : null);
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
    onFocusModeChange?.(!readingMode && focusedPageIndex !== null);
    return () => onFocusModeChange?.(false);
  }, [focusedPageIndex, onFocusModeChange, renderedPages.length, readingMode]);
  if (hasFailed && openPdfRanges) {
    return <div ref={attachmentRef} data-document-attachment="" data-document-reading-mode={readingMode || undefined} className="flex h-full w-full flex-col">
      <ErrorState title="This PDF could not be loaded." onRetry={() => setHasFailed(false)} />
    </div>;
  }
  if ((!attachment.sourceUrl && !openPdfRanges && renderedPages.length === 0) || hasFailed) {
    return isMobile ? <div ref={attachmentRef} data-document-attachment="" data-document-reading-mode={readingMode || undefined} className="flex h-full w-full flex-col"><GenericFileCard attachment={attachment} /></div> : <GenericFileCard attachment={attachment} />;
  }
  const columnCount = Math.min(normalizePagesPerRow(columns, 1), renderedPages.length || MAX_PAGES_PER_ROW);
  const overviewZoom = isMobile && focusedPageIndex === null && zoom > 1;
  const displayedPages = focusedPageIndex === null
    ? renderedPages.map((page, index) => ({ page, index }))
    : renderedPages[focusedPageIndex]
      ? [{ page: renderedPages[focusedPageIndex], index: focusedPageIndex }]
      : [];
  return <div ref={attachmentRef} data-document-attachment="" data-document-reading-mode={readingMode || undefined} className="flex h-full w-full flex-col">
      {renderedPages.length > 0 ? <div key={focusedPageIndex === null ? 'document-grid' : isMobile ? 'document-focused' : `document-page-${focusedPageIndex}`} ref={zoomSurfaceRef} tabIndex={focusedPageIndex === null ? undefined : 0} onScroll={(event) => {
        if (isMobile && focusedPageIndex === null) {
          updateViewerMemory(memoryKey, { scrollLeft: event.currentTarget.scrollLeft });
          return;
        }
        if (isMobile && focusedPageIndex !== null && pendingRenderedPages.current.has(renderedPages[focusedPageIndex]?.sourceUrl ?? '')) return;
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
      }} {...swipeHandlers} data-mobile-focused-view={isMobile && focusedPageIndex !== null ? '' : undefined} className={`${focusedPageIndex === null ? 'overflow-y-auto p-4 sm:p-6' : 'overflow-hidden p-0 outline-none'} premium-media-mode-enter relative min-h-0 flex-1 bg-[var(--surface-sunken)]`} style={focusedPageIndex !== null ? swipeStyle : overviewZoom ? { overflowX: 'auto' } : undefined}>
        {!readingMode && focusedPageIndex !== null ? <FocusedPageExitControl
          onExit={exitFocus}
        /> : null}
        {!readingMode && focusedPageIndex !== null && renderedPages.length > 1 ? <>
            {!isMobile && focusedPageIndex > 0 ? <button type="button" data-viewer-page-control="" data-ui-shape="icon" tabIndex={controlsVisible ? 0 : -1} onClick={() => moveFocusedPage(-1)} data-side="previous" aria-label="Previous page" className="premium-viewer-page-control side-panel-compact-control absolute left-2 top-1/2 z-30 flex -translate-y-1/2 items-center justify-center text-white">
              <InterfaceIcon icon={ChevronLeftIcon} size="lg" weight="medium" />
            </button> : null}
            {!isMobile && focusedPageIndex < renderedPages.length - 1 ? <button type="button" data-viewer-page-control="" data-ui-shape="icon" tabIndex={controlsVisible ? 0 : -1} onClick={() => moveFocusedPage(1)} data-side="next" aria-label="Next page" className="premium-viewer-page-control side-panel-compact-control absolute right-2 top-1/2 z-30 flex -translate-y-1/2 items-center justify-center text-white">
              <InterfaceIcon icon={ChevronRightIcon} size="lg" weight="medium" />
            </button> : null}
            <FocusedPageCounter current={focusedPageIndex + 1} total={renderedPages.length} showMediaInteractions={showMediaInteractions} />
          </> : null}
        <ol aria-label={`${attachment.displayName} pages`} className={`${focusedPageIndex === null ? 'max-w-[2048px] items-start' : 'h-full max-w-full items-center'} mx-auto grid w-full gap-[2px]`} style={{ gridTemplateColumns: `repeat(${focusedPageIndex === null ? columnCount : 1}, minmax(0, 1fr))`, ...(overviewZoom ? { width: `${zoom * 100}%`, maxWidth: 'none' } : {}) }}>
          {displayedPages.map(({ page, index }) => <li key={isMobile && focusedPageIndex !== null ? 'focused' : page.storagePath} data-project-page-number={index + 1} data-project-continuity-page={isMobile ? page.withinDocumentIndex : undefined} data-reach-attachment={attachment.id} data-project-page-ready={isMobile && focusedPageIndex !== null ? paintedReaderPage === `${attachment.id}:${page.sourceUrl}:${index+1}` : undefined} data-project-page-total={renderedPages.length} role={focusedPageIndex === index ? undefined : 'button'} tabIndex={focusedPageIndex === index ? undefined : 0} aria-pressed={focusedPageIndex === index ? undefined : false} aria-label={`${attachment.displayName}, page ${page.withinDocumentIndex}. ${focusedPageIndex === index ? readingMode ? 'Reading mode. Swipe left or right to turn the page. Pinch to zoom' : 'Single-page view. Scroll to return to all pages. Pinch or Control plus wheel to zoom' : isMobile ? 'Pinch to zoom in place. Double-tap to open single-page view' : 'Pinch or Control plus wheel to zoom into single-page view. Double-click or double-tap also opens it'}`} onDoubleClick={focusedPageIndex === index ? undefined : (event) => {
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
          }} data-focused-page-scroll={focusedPageIndex === index ? '' : undefined} onScroll={isMobile && focusedPageIndex === index ? (event) => {
            if (pendingRenderedPages.current.has(page.sourceUrl)) return;
            updateViewerMemory(`${memoryKey}:page:${index}`, { scrollTop: event.currentTarget.scrollTop, scrollLeft: event.currentTarget.scrollLeft });
          } : undefined} className={`${focusedPageIndex === index ? 'h-full min-h-0 items-start justify-start overflow-auto overscroll-contain' : 'touch-manipulation justify-center'} group/media relative flex w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]`}>
            {isMobile && focusedPageIndex === null && columnCount > 1 ? <DocumentGridPreview source={page.sourceUrl} width={page.width} height={page.height} label={`${attachment.displayName}, page ${page.withinDocumentIndex}`} pageNumber={index + 1} presentedPages={presentedRenderedPages} onReady={()=>markRumPdf(viewTokenRef.current)}/> : <RecoverableDocumentImage
              data-media-page-surface=""
              source={page.sourceUrl}
              onReadStateChange={markRenderedPagePending}
              alt={`${attachment.displayName}, page ${page.withinDocumentIndex}`}
              width={page.width}
              height={page.height}
              loading={(isMobile && focusedPageIndex === index) || page.withinDocumentIndex <= columnCount ? 'eager' : 'lazy'}
              {...{ fetchpriority: (isMobile && focusedPageIndex === index) || page.withinDocumentIndex <= columnCount ? 'high' : 'auto' }}
              decoding="async"
              onError={event => event.currentTarget.closest('[data-project-page-number]')?.setAttribute('data-project-page-ready','false')}
              onLoad={(event) => {
                event.currentTarget.closest('[data-project-page-number]')?.setAttribute('data-project-page-ready','true');
                setPaintedReaderPage(`${attachment.id}:${page.sourceUrl}:${index+1}`);
                markRumPdf(viewTokenRef.current);
                if (isMobile && focusedPageIndex === index) restoreFocusedScroll();
              }}
              className={`${focusedPageIndex === index ? 'premium-focused-media m-auto max-h-none max-w-none' : verticalReading ? 'h-auto w-full' : 'h-auto max-h-full max-w-full'} bg-white object-contain`}
              style={focusedPageIndex === index ? { width: `${zoom * 100}%`, height: readingMode || verticalReading ? 'auto' : `${zoom * 100}%`, flexShrink: readingMode || verticalReading ? 0 : undefined } : undefined}
            />}
            {showMediaInteractions && !isMobile && <MediaInteractionBar placement={focusedPageIndex === index ? 'focused' : 'page'} pageCount={renderedPages.length} isOwner={isOwner} target={{
              projectId,
              attachmentId: attachment.id,
              pageIndex: index,
              label: `${attachment.displayName}, page ${page.withinDocumentIndex}`
            }} />}
          </li>)}
        </ol>
        {isMobile && !readingMode && focusedPageIndex !== null && showMediaInteractions ? <MediaInteractionBar placement="focused" pageCount={renderedPages.length} isOwner={isOwner} target={{
          projectId,
          attachmentId: attachment.id,
          pageIndex: focusedPageIndex,
          label: attachment.displayName
        }} /> : null}
      </div> : <PdfImageDocument verticalReading={verticalReading} manageReadingScroll={manageReadingScroll} readingMode={readingMode} readerPageRequest={readerPageRequest} onReaderRequestHandled={onReaderRequestHandled} projectId={projectId} attachmentId={attachment.id} source={attachment.sourceUrl} openPdfRanges={openPdfRanges} label={attachment.displayName} columns={columns} onError={handlePdfFailure} onPageCount={onPageCountResolved} onPreviewDocument={onPreviewDocument} onFocusModeChange={onFocusModeChange} memoryKey={liveDocumentMemoryKey} controlsVisible={controlsVisible} showMediaInteractions={showMediaInteractions} isOwner={isOwner} pageViewToggleRequest={pageViewToggleRequest} />}
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
