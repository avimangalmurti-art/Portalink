import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileTextIcon, RotateCcwIcon } from 'lucide-react';
import { loadPdfJs } from './PdfPage';
import type { PdfDocument, PdfLoadingTask, PdfPageProxy } from './PdfPage';
import { MAX_PAGES_PER_ROW, normalizePagesPerRow } from '../../features/projects/pageLayout';

const MAX_RENDER_DIMENSION = 2048;
const PDF_LOAD_TIMEOUT_MS = 30_000;
const PAGE_RENDER_TIMEOUT_MS = 20_000;

type PdfImageDocumentProps = {
  source: string;
  label: string;
  columns?: number;
  onError: () => void;
  /** The PDF's immutable total, resolved from its own document catalog. */
  onPageCount?: (pageCount: number) => void;
};

type PdfImagePageProps = {
  document: PdfDocument;
  pageNumber: number;
  label: string;
  enabled: boolean;
  onSettled: (pageNumber: number) => void;
};

function PdfImagePage({
  document,
  pageNumber,
  label,
  enabled,
  onSettled
}: PdfImagePageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onSettledRef = useRef(onSettled);
  const [page, setPage] = useState<PdfPageProxy | null>(null);
  const [aspectRatio, setAspectRatio] = useState(8.5 / 11);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'waiting' | 'loading' | 'ready' | 'failed'>('waiting');

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
      setAspectRatio(nativeViewport.width / nativeViewport.height);
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

    const availableWidth = host.getBoundingClientRect().width;
    if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
      return undefined;
    }

    const nativeViewport = page.getViewport({ scale: 1 });
    const cssScale = availableWidth / nativeViewport.width;
    const cssViewport = page.getViewport({ scale: cssScale });
    const deviceScale = Math.max(1, window.devicePixelRatio || 1);
    const dimensionScale = MAX_RENDER_DIMENSION / Math.max(cssViewport.width, cssViewport.height);
    const outputScale = Math.min(deviceScale, dimensionScale);
    const renderViewport = page.getViewport({ scale: cssScale * outputScale });

    canvas.width = Math.max(1, Math.ceil(renderViewport.width));
    canvas.height = Math.max(1, Math.ceil(renderViewport.height));
    canvas.style.width = `${Math.floor(cssViewport.width)}px`;
    canvas.style.height = `${Math.floor(cssViewport.height)}px`;
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
  }, [layoutRevision, page, pageNumber]);

  return <div
    ref={hostRef}
    role="img"
    aria-label={`${label}, page ${pageNumber}`}
    aria-busy={status === 'waiting' || status === 'loading'}
    className="relative w-full overflow-hidden bg-white"
    style={{ aspectRatio }}
  >
    {status === 'waiting' || status === 'loading' ? <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
      <FileTextIcon className="h-6 w-6" />
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
        title="Retry page"
        className="inline-flex items-center justify-center rounded-[var(--control-radius)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <RotateCcwIcon aria-hidden="true" className="h-4 w-4" />
      </button>
    </span> : null}
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`block max-w-full bg-white transition-opacity duration-150 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
    />
    {status === 'failed' && <span className="sr-only">Page image unavailable</span>}
  </div>;
}

/**
 * Loads a PDF once, then lazily paints each real page as a standalone image.
 * There is intentionally no PDF toolbar, iframe, pagination chrome, or browser
 * plug-in UI: the document reads like a vertical sequence of uploaded artwork.
 */
export function PdfImageDocument({ source, label, columns = 1, onError, onPageCount }: PdfImageDocumentProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  const onPageCountRef = useRef(onPageCount);
  const settledPagesRef = useRef(new Set<number>());
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [renderThrough, setRenderThrough] = useState(0);
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
  }, [source]);

  return <div ref={scrollRootRef} className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-sunken)] p-2 sm:p-4">
    {!document && <div role="status" aria-live="polite" className="flex h-full min-h-48 items-center justify-center text-[var(--text-tertiary)]">
      <FileTextIcon className="h-6 w-6" />
      <span className="sr-only">Preparing page images</span>
    </div>}
    {document && <ol aria-label={`${label} pages`} className="mx-auto grid w-full max-w-[1600px] items-start gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
      {Array.from({ length: pageCount }, (_, index) => <li key={index + 1} className="flex w-full justify-center">
        <PdfImagePage
          document={document}
          pageNumber={index + 1}
          label={label}
          enabled={index < renderThrough}
          onSettled={handlePageSettled}
        />
      </li>)}
    </ol>}
  </div>;
}
