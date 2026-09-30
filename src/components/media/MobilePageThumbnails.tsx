import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PdfDocument } from './PdfPage';

/** Move the overview reading surface without focusing or expanding a page. */
function jumpToProjectPage(surface: HTMLElement | null, number: number) {
  const page = surface?.querySelector<HTMLElement>(`[data-project-page-number="${number}"]`);
  if (!surface || !page) return false;
  let scroller = page.parentElement;
  while (scroller && surface.contains(scroller)) {
    if (/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight) {
      scroller.scrollTo({ top: scroller.scrollTop + page.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
        behavior: 'instant' });
      return true;
    }
    scroller = scroller.parentElement;
  }
  if (surface.closest('[data-mobile-page-reader]') && !surface.querySelector('[data-mobile-focused-view]')) {
    const safeTop = parseFloat(getComputedStyle(surface).getPropertyValue('--mobile-content-safe-top')) || 0;
    window.scrollTo({ top: window.scrollY + page.getBoundingClientRect().top - safeTop, behavior: 'instant' });
    return true;
  }
  return false;
}

function PageThumbnail({ number, source, pdfDocument }: {
  number: number; source?: string | null; pdfDocument: PdfDocument | null;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearby, setNearby] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === 'undefined') { setNearby(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNearby(true); observer.disconnect(); }
    }, { root: host.closest('[data-mobile-page-thumbnails]'), rootMargin: '160px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setStatus('loading');
    if (!nearby || !pdfDocument || source) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PdfDocument['getPage']>>['render']> | undefined;
    const timeout = window.setTimeout(() => { cancelled = true; task?.cancel(); setStatus('failed'); }, 20_000);
    void (async () => {
      // The viewer owns this document. Never open/destroy another PDF per thumbnail.
      const page = await pdfDocument.getPage(number);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const native = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(280 / native.width, 360 / native.height) });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      task = page.render({ canvas, viewport, background: '#ffffff' });
      await task.promise;
      if (!cancelled) { window.clearTimeout(timeout); setStatus('ready'); }
    })().catch(() => {
      if (!cancelled) { window.clearTimeout(timeout); setStatus('failed'); }
    });
    return () => { cancelled = true; window.clearTimeout(timeout); task?.cancel(); };
  }, [nearby, number, pdfDocument, source]);

  return <span ref={hostRef} className="mobile-page-thumbnail-art" aria-hidden="true" data-preview-state={status}>
    {nearby && source ? <img src={source} alt="" decoding="async" onLoad={() => setStatus('ready')} onError={() => setStatus('failed')} />
      : pdfDocument ? <canvas ref={canvasRef} /> : null}
    {status !== 'ready' && <span className="mobile-page-thumbnail-placeholder">{status === 'failed' ? 'Preview unavailable' : number}</span>}
  </span>;
}

export function MobilePageThumbnails({ id, current, total, surfaceRef, previewSources, pdfDocument, onSelectPage }: {
  onSelectPage?: (page: number) => void;
  id: string; current: number; total: number; surfaceRef: React.RefObject<HTMLDivElement>;
  previewSources: readonly (string | null | undefined)[]; pdfDocument: PdfDocument | null;
}) {
  const listRef = useRef<HTMLElement>(null);
  // Start at the current page, but don't fight the user's scrolling afterward.
  useLayoutEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLButtonElement>('[aria-current="page"]');
    if (!list || !selected) return;
    list.scrollTop += selected.getBoundingClientRect().top - list.getBoundingClientRect().top - 12;
    selected.focus({ preventScroll: true });
  }, []);
  return <nav id={id} ref={listRef} data-mobile-page-thumbnails="" className="mobile-page-thumbnails" aria-label="Project pages">
    {Array.from({ length: total }, (_, index) => <button key={index + 1} type="button"
      aria-label={`Go to page ${index + 1}`} aria-current={current === index + 1 ? 'page' : undefined}
      onClick={() => onSelectPage ? onSelectPage(index + 1) : jumpToProjectPage(surfaceRef.current, index + 1)} className="mobile-page-thumbnail">
      <PageThumbnail number={index + 1} source={previewSources[index]} pdfDocument={pdfDocument} />
      <span className="mobile-page-thumbnail-number" aria-hidden="true">{index + 1}</span>
    </button>)}
  </nav>;
}
