import React, { useCallback, useEffect, useRef, useState } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { GenericFileCard } from './GenericFileCard';
import { PdfImageDocument } from './PdfImageDocument';
import type { ProjectAttachment } from '../../types/domain';
import { MAX_PAGES_PER_ROW, normalizePagesPerRow } from '../../features/projects/pageLayout';

/**
 * Every real PDF page is presented as page artwork inside the platform. The
 * browser's native PDF plug-in is never embedded, so its toolbar and Acrobat-
 * style reader chrome cannot leak into the product experience.
 */
export function DocumentAttachment({
  attachment,
  columns = 1,
  processing,
  onPageCountResolved,


}: {
  attachment: ProjectAttachment;
  columns?: number;
  onPageCountResolved?: (pageCount: number) => void;
  processing?: {
    state: 'processing' | 'processing-failed';
    message: string | null;
    canRetry: boolean;
    isRetrying: boolean;
    onRetry: () => void;
  };
}) {
  const [hasFailed, setHasFailed] = useState(false);
  const [focusedPageIndex, setFocusedPageIndex] = useState<number | null>(null);
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
    setFocusedPageIndex(null);
    lastTouchRef.current = null;
  }, [attachment.id]);
  if (!attachment.sourceUrl || hasFailed) {
    return <GenericFileCard attachment={attachment} />;
  }
  const columnCount = Math.min(normalizePagesPerRow(columns, 1), renderedPages.length || MAX_PAGES_PER_ROW);
  const displayedPages = focusedPageIndex === null
    ? renderedPages.map((page, index) => ({ page, index }))
    : renderedPages[focusedPageIndex]
      ? [{ page: renderedPages[focusedPageIndex], index: focusedPageIndex }]
      : [];
  const focusPage = (index: number) => setFocusedPageIndex(index);
  return <div className="flex h-full w-full flex-col">
      {renderedPages.length > 0 ? <div className={`${focusedPageIndex === null ? 'overflow-y-auto' : 'overflow-hidden'} relative min-h-0 flex-1 bg-[var(--surface-sunken)] p-4 sm:p-6`}>
        {focusedPageIndex !== null && <button
          type="button"
          onClick={() => setFocusedPageIndex(null)}
          aria-label="Close single-page view"
          title="Return to all pages"
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur-md transition hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4 sm:top-4"
        >
          <XIcon aria-hidden="true" className="h-5 w-5" />
        </button>}
        <ol aria-label={`${attachment.displayName} pages`} className={`${focusedPageIndex === null ? 'max-w-[2048px] items-start' : 'h-full max-w-full items-center'} mx-auto grid w-full gap-2 sm:gap-3`} style={{ gridTemplateColumns: `repeat(${focusedPageIndex === null ? columnCount : 1}, minmax(0, 1fr))` }}>
          {displayedPages.map(({ page, index }) => <li key={page.storagePath} role={focusedPageIndex === index ? undefined : 'button'} tabIndex={focusedPageIndex === index ? undefined : 0} aria-pressed={focusedPageIndex === index ? undefined : false} aria-label={`${attachment.displayName}, page ${page.withinDocumentIndex}. ${focusedPageIndex === index ? 'Single-page view' : 'Double-click or double-tap to fill the viewer'}`} title={focusedPageIndex === index ? undefined : 'Double-click or double-tap to fill the viewer'} onDoubleClick={focusedPageIndex === index ? undefined : (event) => {
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
          }} className={`${focusedPageIndex === index ? 'h-full min-h-0 touch-auto' : 'touch-manipulation'} flex w-full justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]`}>
            <img
              src={page.sourceUrl}
              alt={`${attachment.displayName}, page ${page.withinDocumentIndex}`}
              width={page.width}
              height={page.height}
              loading={page.withinDocumentIndex <= columnCount ? 'eager' : 'lazy'}
              fetchPriority={page.withinDocumentIndex <= columnCount ? 'high' : 'auto'}
              decoding="async"
              className={`${focusedPageIndex === index ? 'h-full w-full' : 'h-auto max-h-full max-w-full'} bg-white object-contain`}
            />
          </li>)}
        </ol>
      </div> : <PdfImageDocument source={attachment.sourceUrl} label={attachment.displayName} columns={columns} onError={handlePdfFailure} onPageCount={onPageCountResolved} />}
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
