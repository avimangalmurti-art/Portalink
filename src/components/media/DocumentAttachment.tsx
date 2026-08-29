import React, { useCallback, useEffect, useState } from 'react';
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
  if (!attachment.sourceUrl || hasFailed) {
    return <GenericFileCard attachment={attachment} />;
  }
  const columnCount = Math.min(normalizePagesPerRow(columns, 1), renderedPages.length || MAX_PAGES_PER_ROW);
  return <div className="flex h-full w-full flex-col">
      {renderedPages.length > 0 ? <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-sunken)] p-4 sm:p-6">
        <ol aria-label={`${attachment.displayName} pages`} className="mx-auto grid w-full max-w-[2048px] items-start gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
          {renderedPages.map((page) => <li key={page.storagePath} className="flex w-full justify-center">
            <img
              src={page.sourceUrl}
              alt={`${attachment.displayName}, page ${page.withinDocumentIndex}`}
              width={page.width}
              height={page.height}
              loading={page.withinDocumentIndex <= columnCount ? 'eager' : 'lazy'}
              fetchPriority={page.withinDocumentIndex <= columnCount ? 'high' : 'auto'}
              decoding="async"
              className="h-auto max-h-full max-w-full bg-white object-contain"
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
