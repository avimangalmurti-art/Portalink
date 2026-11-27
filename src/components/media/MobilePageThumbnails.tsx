import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PdfDocument } from './PdfPage';

import { jumpToProjectPage, type ProjectReadingPart } from './projectPageScroll';

export type ReadingPartPreviews = Readonly<Record<string, { sources: readonly (string | null | undefined)[]; document?: PdfDocument | null }>>;

function PageThumbnail({ number, documentPage = number, source, pdfDocument }: {
  number: number; documentPage?: number; source?: string | null; pdfDocument: PdfDocument | null;
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
      const page = await pdfDocument.getPage(documentPage);
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
  }, [nearby, documentPage, pdfDocument, source]);

  return <span ref={hostRef} className="mobile-page-thumbnail-art" aria-hidden="true" data-preview-state={status}>
    {nearby && source ? <img src={source} alt="" decoding="async" onLoad={() => setStatus('ready')} onError={() => setStatus('failed')} />
      : pdfDocument ? <canvas ref={canvasRef} /> : null}
    {status !== 'ready' && <span className="mobile-page-thumbnail-placeholder">{status === 'failed' ? 'Preview unavailable' : number}</span>}
  </span>;
}

export function MobilePageThumbnails({ id, current, total, surfaceRef, previewSources, pdfDocument, readingParts, readingPartPreviews, onSelectPage }: {
  onSelectPage?: (page: number) => void;
  id: string; current: number; total: number; surfaceRef: React.RefObject<HTMLDivElement>;
  previewSources: readonly (string | null | undefined)[]; pdfDocument: PdfDocument | null;
  readingParts?: readonly ProjectReadingPart[];
  readingPartPreviews?: ReadingPartPreviews;
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
  return <nav id={id} ref={listRef} data-mobile-page-thumbnails="" data-ui-shape="popup" className="mobile-page-thumbnails" aria-label="Project pages">
    {Array.from({ length: total }, (_, index) => {
      const number = index + 1;
      const part = readingParts?.find(({ firstPage, count }) => number >= firstPage && number < firstPage + count);
      const documentPage = part ? number - part.firstPage + 1 : number;
      const preview = part ? readingPartPreviews?.[part.attachmentId] : undefined;
      return <button key={part ? `${part.attachmentId}:${documentPage}` : number} type="button"
        aria-label={`Go to page ${number}`} aria-current={current === number ? 'page' : undefined}
        onClick={() => onSelectPage ? onSelectPage(number) : jumpToProjectPage(surfaceRef.current, number)} className="mobile-page-thumbnail">
        <PageThumbnail number={number} documentPage={documentPage} source={part ? preview?.sources[documentPage - 1] : previewSources[index]}
          pdfDocument={part ? preview?.document ?? null : pdfDocument} />
        <span className="mobile-page-thumbnail-number" aria-hidden="true">{number}</span>
      </button>;
    })}
  </nav>;
}
