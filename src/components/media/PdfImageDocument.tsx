import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, RotateCcwIcon } from 'lucide-react';
import { loadPdfJs } from './PdfPage';
import type { PdfDocument, PdfLoadingTask, PdfPageProxy } from './PdfPage';
import { MAX_PAGES_PER_ROW, normalizePagesPerRow } from '../../features/projects/pageLayout';
import { useSinglePageZoom } from './useSinglePageZoom';
import { readViewerMemory, updateViewerMemory } from './viewerMemory';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { MediaInteractionBar } from '../../features/media-interactions/MediaInteractionBar';
import { FocusedPageExitControl } from './FocusedPageExitControl';

const MAX_RENDER_DIMENSION = 2048;
const PDF_LOAD_TIMEOUT_MS = 30_000;
const PAGE_RENDER_TIMEOUT_MS = 20_000;

type PdfImageDocumentProps = {
  projectId: string;
  attachmentId: string;
  source: string;
  label: string;
  columns?: number;
  onError: () => void;
  /** The PDF's immutable total, resolved from its own document catalog. */
  onPageCount?: (pageCount: number) => void;
  onFocusModeChange?: (focused: boolean) => void;
  memoryKey: string;
  controlsVisible?: boolean;
  showMediaInteractions?: boolean;
  pageOverviewRequest?: number;
};

type PdfImagePageProps = {
  projectId: string;
  attachmentId: string;
  document: PdfDocument;
  pageNumber: number;
  label: string;
  enabled: boolean;
  isFocused: boolean;
  zoom: number;
  showMediaInteractions: boolean;
  onToggleFocus: (pageNumber: number) => void;
  onSettled: (pageNumber: number) => void;
};

function PdfImagePage({
  projectId,
  attachmentId,
  document,
  pageNumber,
  label,
  enabled,
  isFocused,
  zoom,
  showMediaInteractions,
  onToggleFocus,
  onSettled
}: PdfImagePageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastTouchRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastTouchToggleAtRef = useRef(0);
  const onSettledRef = useRef(onSettled);
  const [page, setPage] = useState<PdfPageProxy | null>(null);
  const [aspectRatio, setAspectRatio] = useState(8.5 / 11);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'waiting' | 'loading' | 'ready' | 'failed'>('waiting');
  const [baseCanvasSize, setBaseCanvasSize] = useState<{ width: number; height: number } | null>(null);

  onSettledRef.current = onSettled;

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;
    let loadedPage: PdfPageProxy | null = null;
    setStatus('loading');

    void document.getPage(pageNumber).then((nextPage) => {
      loadedPage = nextPage;
      if (cancelled) {
        nextPage.cleanup();
        return;
      }
      const nativeViewport = nextPage.getViewport({ scale: 1 });
      const nextAspectRatio = nativeViewport.width / nativeViewport.height;
      setAspectRatio(nextAspectRatio);
      setPage(nextPage);
    }).catch(() => {
      if (!cancelled) {
        setStatus('failed');
        onSettledRef.current(pageNumber);
      }
    });

    return () => {
      cancelled = true;
      loadedPage?.cleanup();
    };
  }, [attempt, document, enabled, pageNumber]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) {
      return undefined;
    }

    let resizeTimer: number | undefined;
    const scheduleRender = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setLayoutRevision((revision) => revision + 1);
      }, 120);
    };
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleRender);
    resizeObserver?.observe(host);
    window.addEventListener('resize', scheduleRender, { passive: true });

    return () => {
      window.clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleRender);
    };
  }, [enabled]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!page || !host || !canvas) {
      return undefined;
    }

    const bounds = host.getBoundingClientRect();
    const availableWidth = bounds.width;
    const availableHeight = bounds.height;
    if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
      return undefined;
    }

    const nativeViewport = page.getViewport({ scale: 1 });
    const widthScale = availableWidth / nativeViewport.width;
    const heightScale = availableHeight > 0 ? availableHeight / nativeViewport.height : widthScale;
    // Focused zoom is applied with CSS below rather than repainting the PDF on
    // every wheel or pinch frame. The canvas is rendered once at the fitted
    // device resolution, which keeps the gesture responsive and removes the
    // render queue that previously made zoom feel delayed.
    const cssScale = isFocused ? Math.min(widthScale, heightScale) : widthScale;
    const cssViewport = page.getViewport({ scale: cssScale });
    const deviceScale = Math.max(1, window.devicePixelRatio || 1);
    const dimensionScale = MAX_RENDER_DIMENSION / Math.max(cssViewport.width, cssViewport.height);
    const outputScale = Math.min(deviceScale, dimensionScale);
    const renderViewport = page.getViewport({ scale: cssScale * outputScale });

    canvas.width = Math.max(1, Math.ceil(renderViewport.width));
    canvas.height = Math.max(1, Math.ceil(renderViewport.height));
    setBaseCanvasSize({
      width: Math.max(1, Math.floor(cssViewport.width)),
      height: Math.max(1, Math.floor(cssViewport.height))
    });
    setStatus('loading');

    let cancelled = false;
    let settled = false;
    const renderTask = page.render({
      canvas,
      viewport: renderViewport,
      background: '#ffffff'
    });
    const renderTimeout = window.setTimeout(() => {
      if (settled || cancelled) {
        return;
      }
      settled = true;
      renderTask.cancel();
      setStatus('failed');
      onSettledRef.current(pageNumber);
    }, PAGE_RENDER_TIMEOUT_MS);

    void renderTask.promise.then(() => {
      if (!cancelled && !settled) {
        settled = true;
        window.clearTimeout(renderTimeout);
        setStatus('ready');
        onSettledRef.current(pageNumber);
      }
    }).catch((error: unknown) => {
      if (!cancelled && !settled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
        settled = true;
        window.clearTimeout(renderTimeout);
        setStatus('failed');
        onSettledRef.current(pageNumber);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(renderTimeout);
      renderTask.cancel();
    };
  }, [isFocused, layoutRevision, page, pageNumber]);

  return <div
    ref={hostRef}
    role={isFocused ? undefined : 'button'}
    tabIndex={isFocused ? undefined : 0}
    aria-pressed={isFocused ? undefined : false}
    aria-label={`${label}, page ${pageNumber}. ${isFocused ? 'Single-page view' : 'Double-click or double-tap to fill the viewer'}`}
    aria-busy={status === 'waiting' || status === 'loading'}
    onDoubleClick={isFocused ? undefined : (event) => {
      event.preventDefault();
      if (performance.now() - lastTouchToggleAtRef.current < 500) return;
      onToggleFocus(pageNumber);
    }}
    onPointerUp={isFocused ? undefined : (event) => {
      if (event.pointerType !== 'touch') return;
      const now = performance.now();
      const previous = lastTouchRef.current;
      const isDoubleTap = previous && now - previous.time < 320 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 24;
      lastTouchRef.current = { time: now, x: event.clientX, y: event.clientY };
      if (isDoubleTap) {
        event.preventDefault();
        lastTouchRef.current = null;
        lastTouchToggleAtRef.current = now;
        onToggleFocus(pageNumber);
      }
    }}
    onKeyDown={isFocused ? undefined : (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggleFocus(pageNumber);
      }
    }}
    className={`${isFocused ? `flex h-full w-full overflow-auto overscroll-contain ${zoom > 1 ? 'items-start justify-start' : 'items-center justify-center'}` : 'w-full touch-manipulation overflow-hidden'} group/media relative bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]`}
    style={isFocused ? undefined : { aspectRatio }}
  >
    {status === 'waiting' || status === 'loading' ? <span aria-hidden="true" className="premium-media-placeholder absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
      <span className="premium-media-loading-mark" />
    </span> : null}
    {status === 'failed' ? <span className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)]">
      <button
        type="button"
        onClick={() => {
          setPage(null);
          setStatus('loading');
          setAttempt((current) => current + 1);
        }}
        aria-label={`Retry ${label}, page ${pageNumber}`}
        className="inline-flex items-center justify-center rounded-[var(--control-radius)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <RotateCcwIcon aria-hidden="true" className="h-4 w-4" />
      </button>
    </span> : null}
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`block ${isFocused ? 'premium-focused-media max-w-none' : 'max-w-full'} bg-white transition-opacity duration-200 ${status === 'ready' ? 'premium-media-ready opacity-100' : 'opacity-0'}`}
      style={baseCanvasSize ? {
        width: `${baseCanvasSize.width * (isFocused ? zoom : 1)}px`,
        height: `${baseCanvasSize.height * (isFocused ? zoom : 1)}px`
      } : undefined}
    />
    {showMediaInteractions && <MediaInteractionBar placement={isFocused ? 'focused' : 'page'} target={{
      projectId,
      attachmentId,
      pageIndex: pageNumber - 1,
      label: `${label}, page ${pageNumber}`
    }} />}
    {status === 'failed' && <span className="sr-only">Page image unavailable</span>}
  </div>;
}

/**
 * Loads a PDF once, then lazily paints each real page as a standalone image.
 * There is intentionally no PDF toolbar, iframe, pagination chrome, or browser
 * plug-in UI: the document reads like a vertical sequence of uploaded artwork.
 */
export function PdfImageDocument({ projectId, attachmentId, source, label, columns = 1, onError, onPageCount, onFocusModeChange, memoryKey, controlsVisible = true, showMediaInteractions = true, pageOverviewRequest = 0 }: PdfImageDocumentProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  const onPageCountRef = useRef(onPageCount);
  const settledPagesRef = useRef(new Set<number>());
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderThrough, setRenderThrough] = useState(0);
  const linkedPageNumber = () => {
    if (typeof window === 'undefined') return null;
    const query = new URLSearchParams(window.location.search);
    if (query.get('media') !== attachmentId) return null;
    const pageNumber = Number(query.get('page'));
    return Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : null;
  };
  const [focusedPageNumber, setFocusedPageNumber] = useState<number | null>(() => linkedPageNumber() ?? readViewerMemory(memoryKey).focusedPageNumber ?? null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const exitFocus = useCallback(() => {
    setFocusedPageNumber(null);
    updateViewerMemory(memoryKey, { focusedPageNumber: null, zoom: 1 });
  }, [memoryKey]);
  useEffect(() => {
    if (pageOverviewRequest > 0) exitFocus();
  }, [exitFocus, pageOverviewRequest]);
  const zoom = useSinglePageZoom({
    surfaceRef: scrollRootRef,
    active: focusedPageNumber !== null,
    onExit: exitFocus,
    memoryKey: focusedPageNumber ? `${memoryKey}:page:${focusedPageNumber}` : memoryKey
  });
  useEffect(() => {
    onFocusModeChange?.(focusedPageNumber !== null);
    return () => onFocusModeChange?.(false);
  }, [focusedPageNumber, onFocusModeChange]);
  const columnCount = Math.min(normalizePagesPerRow(columns, 1), pageCount || MAX_PAGES_PER_ROW);

  onErrorRef.current = onError;
  onPageCountRef.current = onPageCount;

  const handlePageSettled = useCallback((pageNumber: number) => {
    if (settledPagesRef.current.has(pageNumber)) {
      return;
    }
    settledPagesRef.current.add(pageNumber);
    setRenderThrough((current) => Math.min(pageCount, current + 1));
  }, [pageCount]);

  useEffect(() => {
    if (pageCount > 0) {
      setRenderThrough((current) => Math.max(current, Math.min(pageCount, columnCount)));
    }
  }, [columnCount, pageCount]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PdfLoadingTask | null = null;
    let loadTimeout: number | undefined;

    settledPagesRef.current.clear();
    setDocument(null);
    setPageCount(0);
    setRenderThrough(0);
    setFocusedPageNumber(linkedPageNumber() ?? readViewerMemory(memoryKey).focusedPageNumber ?? null);
    void (async () => {
      const pdfjs = await loadPdfJs();
      if (cancelled) {
        return;
      }
      loadingTask = pdfjs.getDocument({ url: source });
      loadTimeout = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        cancelled = true;
        void loadingTask?.destroy();
        onErrorRef.current();
      }, PDF_LOAD_TIMEOUT_MS);
      const nextDocument = await loadingTask.promise;
      if (cancelled) {
        await loadingTask.destroy();
        return;
      }
      window.clearTimeout(loadTimeout);
      setDocument(nextDocument);
      setPageCount(nextDocument.numPages);
      onPageCountRef.current?.(nextDocument.numPages);
    })().catch(() => {
      if (!cancelled) {
        window.clearTimeout(loadTimeout);
        onErrorRef.current();
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimeout);
      void loadingTask?.destroy();
    };
  }, [memoryKey, source]);

  const focusPage = useCallback((pageNumber: number) => {
    setFocusedPageNumber(pageNumber);
    updateViewerMemory(memoryKey, { focusedPageNumber: pageNumber });
  }, [memoryKey]);
  const moveFocusedPage = useCallback((direction: -1 | 1) => {
    if (focusedPageNumber === null) return;
    const next = Math.min(pageCount, Math.max(1, focusedPageNumber + direction));
    if (next !== focusedPageNumber) focusPage(next);
  }, [focusPage, focusedPageNumber, pageCount]);
  useEffect(() => {
    if (focusedPageNumber !== null && pageCount > 0 && focusedPageNumber > pageCount) exitFocus();
  }, [exitFocus, focusedPageNumber, pageCount]);
  useEffect(() => {
    if (focusedPageNumber !== null) scrollRootRef.current?.focus({ preventScroll: true });
  }, [focusedPageNumber]);
  useLayoutEffect(() => {
    if (focusedPageNumber !== null) return;
    const element = scrollRootRef.current;
    if (element) element.scrollTop = readViewerMemory(memoryKey).scrollTop ?? 0;
  }, [document, focusedPageNumber, memoryKey]);
  const pageNumbers = focusedPageNumber === null
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : [focusedPageNumber];

  return <div key={focusedPageNumber === null ? 'pdf-grid' : `pdf-page-${focusedPageNumber}`} ref={scrollRootRef} tabIndex={focusedPageNumber === null ? undefined : 0} onScroll={focusedPageNumber === null ? (event) => updateViewerMemory(memoryKey, { scrollTop: event.currentTarget.scrollTop }) : undefined} onKeyDown={focusedPageNumber === null ? undefined : (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocusedPage(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocusedPage(1);
    }
  }} onPointerDown={focusedPageNumber === null ? undefined : (event) => {
    if (event.pointerType === 'touch' && zoom <= 1.01) swipeStartRef.current = { x: event.clientX, y: event.clientY };
  }} onPointerUp={focusedPageNumber === null ? undefined : (event) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || event.pointerType !== 'touch' || zoom > 1.01) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > 56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) moveFocusedPage(deltaX < 0 ? 1 : -1);
  }} className={`${focusedPageNumber === null ? 'overflow-y-auto p-2 sm:p-4' : 'overflow-hidden p-0 outline-none'} premium-media-mode-enter relative min-h-0 flex-1 bg-[var(--surface-sunken)]`} style={focusedPageNumber === null ? undefined : { touchAction: 'pan-x pan-y' }}>
    {focusedPageNumber !== null ? <FocusedPageExitControl
      onExit={exitFocus}
    /> : null}
    {focusedPageNumber !== null && pageCount > 1 ? <>
        {focusedPageNumber > 1 ? <button type="button" data-viewer-page-control="" tabIndex={controlsVisible ? 0 : -1} onClick={() => moveFocusedPage(-1)} aria-label="Previous page" className="premium-viewer-page-control absolute left-6 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white sm:left-8">
          <InterfaceIcon icon={ChevronLeftIcon} size="lg" weight="medium" />
        </button> : null}
        {focusedPageNumber < pageCount ? <button type="button" data-viewer-page-control="" tabIndex={controlsVisible ? 0 : -1} onClick={() => moveFocusedPage(1)} aria-label="Next page" className="premium-viewer-page-control absolute right-6 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white sm:right-8">
          <InterfaceIcon icon={ChevronRightIcon} size="lg" weight="medium" />
        </button> : null}
        <span data-viewer-page-control="" className="premium-viewer-page-counter pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums text-white">{focusedPageNumber} / {pageCount}</span>
      </> : null}
    {!document && <div role="status" aria-live="polite" className="premium-media-placeholder flex h-full min-h-48 items-center justify-center text-[var(--text-tertiary)]">
      <span className="premium-media-loading-mark" aria-hidden="true" />
      <span className="sr-only">Preparing page images</span>
    </div>}
    {document && <ol aria-label={`${label} pages`} className={`${focusedPageNumber === null ? 'max-w-[1600px] items-start' : 'h-full max-w-full items-center'} mx-auto grid w-full gap-2 sm:gap-3`} style={{ gridTemplateColumns: `repeat(${focusedPageNumber === null ? columnCount : 1}, minmax(0, 1fr))` }}>
      {pageNumbers.map((pageNumber) => <li key={pageNumber} className={`${focusedPageNumber === pageNumber ? 'h-full min-h-0' : ''} group/media flex w-full justify-center`}>
        <PdfImagePage
          projectId={projectId}
          attachmentId={attachmentId}
          document={document}
          pageNumber={pageNumber}
          label={label}
          enabled={focusedPageNumber === pageNumber || pageNumber <= renderThrough}
          isFocused={focusedPageNumber === pageNumber}
          zoom={focusedPageNumber === pageNumber ? zoom : 1}
          showMediaInteractions={showMediaInteractions}
          onToggleFocus={focusPage}
          onSettled={handlePageSettled}
        />
      </li>)}
    </ol>}
  </div>;
}
