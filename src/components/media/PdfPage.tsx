import React, { useEffect, useRef, useState } from 'react';
import { FileTextIcon } from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './pdf-page.css';
import { markRumPdf, rumViewToken } from '../../features/performance/rum';

export type PdfJs = typeof import('pdfjs-dist');
export type PdfLoadingTask = ReturnType<PdfJs['getDocument']>;
export type PdfDocument = Awaited<PdfLoadingTask['promise']>;
export type PdfPageProxy = Awaited<ReturnType<PdfDocument['getPage']>>;

let pdfJsPromise: Promise<PdfJs> | null = null;

export async function loadPdfJs(recoverFailedImport = false): Promise<PdfJs> {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return pdfjs;
    });
  }
  const pending = pdfJsPromise;
  if (!recoverFailedImport) return pending;
  try {
    return await pending;
  } catch (error) {
    // MOBILE can retry a disconnected engine download on the next real return.
    if (pdfJsPromise === pending) pdfJsPromise = null;
    throw error;
  }
}

export function pdfSourceOptions(source: string, previewOnly = false) {
  const isLargeOriginal = source.includes('/__portalink_media/');
  const isRemotePreview = previewOnly && /^https?:\/\//i.test(source);
  return {
    url: source,
    // A wall of PDF covers must not stream every full original in parallel.
    // Request just the ranges needed for the selected cover. Local blob upload
    // previews and the full ordinary-document viewer keep their existing path.
    ...(isLargeOriginal || isRemotePreview ? { disableAutoFetch: true, disableStream: true, rangeChunkSize: 1024 * 1024 } : {}),
  };
}

type PdfPageProps = {
  source: string;
  onRenderFailure?: () => void;
  label: string;
  pageNumber?: number;
  strictPageNumber?: boolean;
  onPageCountChange?: (pageCount: number) => void;
  className?: string;
  fit?: 'contain' | 'cover';
  objectPosition?: string;
  showLoadingIndicator?: boolean;
};

/**
 * Renders a real PDF page to canvas.
 *
 * PDF.js is loaded only when the page is close to the viewport, so a discovery
 * grid does not download every document just to prepare off-screen covers.
 */
export function PdfPage({
  source, onRenderFailure,
  showLoadingIndicator = false,
  label,
  pageNumber = 1,
  strictPageNumber = false,
  onPageCountChange,
  className = '',
  fit = 'contain',
  objectPosition
}: PdfPageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [page, setPage] = useState<PdfPageProxy | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldRender(true);
        observer.disconnect();
      }
    }, {
      rootMargin: '240px'
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldRender || !source) {
      return undefined;
    }

    let cancelled = false;
    let loadingTask: PdfLoadingTask | null = null;
    setPage(null);
    setStatus('loading');

    void (async () => {
      const pdfjs = await loadPdfJs(strictPageNumber);
      if (cancelled) {
        return;
      }
      loadingTask = pdfjs.getDocument(pdfSourceOptions(source, true));
      const document = await loadingTask.promise;
      onPageCountChange?.(document.numPages);
      // Explicit message pages must never silently display a different page.
      if (strictPageNumber && (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > document.numPages)) {
        throw new Error('Requested page is unavailable');
      }
      const nextPage = await document.getPage(Math.min(pageNumber, document.numPages));
      if (!cancelled) {
        setPage(nextPage);
      }
    })().catch((error: unknown) => {
      if (!cancelled) {
        setStatus('failed');
      }
    });

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [onPageCountChange, pageNumber, shouldRender, source, strictPageNumber]);

  useEffect(() => {
    if (!shouldRender) {
      return undefined;
    }

    const host = hostRef.current;
    if (!host) {
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
  }, [shouldRender]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!page || !host || !canvas) {
      return undefined;
    }

    const containerBounds = host.getBoundingClientRect();
    if (containerBounds.width <= 0 || containerBounds.height <= 0) {
      return undefined;
    }

    const baseViewport = page.getViewport({ scale: 1 });
    const widthScale = containerBounds.width / baseViewport.width;
    const heightScale = containerBounds.height / baseViewport.height;
    const fitScale = fit === 'cover' ? Math.max(widthScale, heightScale) : Math.min(widthScale, heightScale);

    if (!Number.isFinite(fitScale) || fitScale <= 0) {
      return undefined;
    }

    // Render additional pixels for Retina/HiDPI screens. CSS constrains the
    // bitmap back to the measured contain size without changing its aspect.
    const outputScale = Math.max(1, window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale: fitScale * outputScale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    let cancelled = false;
    const renderTask = page.render({
      canvas,
      viewport,
      background: '#ffffff'
    });
    const viewToken = rumViewToken();

    void renderTask.promise.then(() => {
      if (!cancelled) {
        setStatus('ready');
        markRumPdf(viewToken);
      }
    }).catch((error: unknown) => {
      if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
        setStatus('failed');
      }
    });

    return () => {
      cancelled = true;
      renderTask.cancel();
    };
  }, [fit, layoutRevision, page]);

  useEffect(() => { if (status === 'failed') onRenderFailure?.(); }, [status, onRenderFailure]);

  return <div ref={hostRef} role="img" aria-label={label} aria-busy={status === 'loading'} className={`pdf-page-viewport relative ${status === 'loading' && showLoadingIndicator ? 'bg-[var(--surface-canvas)]' : 'bg-white'} ${className}`}>
      {status !== 'ready' && <span data-project-cover-loading={status === 'loading' && showLoadingIndicator ? '' : undefined} aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
          {status === 'loading' && showLoadingIndicator
            ? <span className="premium-media-loading-mark" />
            : <FileTextIcon className="h-6 w-6" />}
        </span>}
      <div className="pdf-page-wrapper">
        <canvas ref={canvasRef} style={fit === 'cover' ? { width: '100%', height: '100%', objectFit: 'cover', objectPosition } : undefined} className={`pdf-page-canvas ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`} />
      </div>
      {status === 'failed' && <span className="sr-only">PDF preview unavailable</span>}
    </div>;
}
