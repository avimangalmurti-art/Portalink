import React, { useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingState } from '../ui/StateViews';
import type { ProjectAttachment } from '../../types/domain';
import { ResponsiveImage } from '../ui/ResponsiveImage';

/**
 * One image page: loading, ready, and failure, per page rather than per project,
 * so one unreachable file never blanks the pages around it.
 */
function ImagePage({
  attachment,
  pageNumber,
  pageCount,
  priorityCount

}: {attachment: ProjectAttachment;pageNumber: number;pageCount: number;priorityCount: number;}) {
  const hostRef = useRef<HTMLLIElement>(null);
  const [shouldRender, setShouldRender] = useState(pageNumber <= priorityCount);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // Remounting the element is what a retry actually means for an image.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (shouldRender) return undefined;
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldRender(true);
        observer.disconnect();
      }
    }, { rootMargin: '1200px 0px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, [shouldRender]);
  useEffect(() => {
    if (!shouldRender || status !== 'loading') {
      return undefined;
    }
    const timeout = window.setTimeout(() => setStatus('error'), 30_000);
    return () => window.clearTimeout(timeout);
  }, [attempt, shouldRender, status]);
  if (!attachment.sourceUrl) {
    return <div className="flex items-center justify-center p-8">
        <ErrorState title="Nothing to show yet" description={`${attachment.displayName} has no preview available in this session.`} />
      </div>;
  }
  return <li ref={hostRef} aria-label={pageCount > 1 ? `Page ${pageNumber} of ${pageCount}` : undefined} className="block min-h-[240px] list-none" style={attachment.metadata?.widthPixels && attachment.metadata?.heightPixels ? {
    aspectRatio: `${attachment.metadata.widthPixels} / ${attachment.metadata.heightPixels}`
  } : undefined}>
      {!shouldRender ? <div className="h-full min-h-[240px] w-full" aria-hidden="true" /> : null}
      {shouldRender ? <>
      {status === 'loading' && <div className="flex min-h-[240px] w-full items-center justify-center">
          <LoadingState label={`Loading ${attachment.displayName}`} />
        </div>}
      {status === 'error' ? <div className="flex min-h-[240px] w-full items-center justify-center p-8">
          <ErrorState title="This image could not be displayed" description={attachment.fileName} onRetry={() => {
        setStatus('loading');
        setAttempt((current) => current + 1);
      }} />
        </div> : <ResponsiveImage key={attempt} src={attachment.sourceUrl} alt={attachment.displayName} width={attachment.metadata?.widthPixels} height={attachment.metadata?.heightPixels} sizes="(min-width: 1100px) 70vw, 100vw" priority={pageNumber <= priorityCount} onLoad={() => setStatus('ready')} onError={() => setStatus('error')} className={`block h-auto w-full ${status === 'ready' ? '' : 'hidden'}`} />}
      </> : null}
    </li>;
}

/**
 * A project's images, stacked as pages in one continuous scroll.
 *
 * The work is read top to bottom rather than one file at a time, because a
 * multi-image piece is one piece — asking the viewer to step between files
 * would present a sequence as a set of unrelated attachments.
 *
 * Each page is sized by the WIDTH it is given, anchored to the top-left, which
 * is what makes the work respond to the space it has: when the response rail
 * closes the column widens and the pages grow into it, and when it opens they
 * contract to match. Fitting to height instead would freeze them at one size
 * with the freed space showing as empty canvas.
 */
export function ImageAttachment({
  pages,
  columns = 1








}: { /** Ordered image pages. A single-image project simply has one. */pages: ProjectAttachment[]; /**
   * How many pages sit side by side. Presentation only — it changes how much
   * width a page is given, never the page's own proportions or its order.
   */columns?: number;}) {const columnCount = Math.max(1, Math.min(columns, pages.length));
  /*
   * Pages are dealt across the columns up front, one after another, rather than
   * left to CSS column flow. Column flow fills a column to the bottom of the
   * container before it starts the next one, so with a tall first page the space
   * beside it stayed empty until the viewer scrolled. Dealing them means page two
   * occupies the next column the moment there is one, and each column keeps its
   * own running height — a landscape page beside a portrait one still leaves no
   * band of dead space, and nothing is stretched or cropped to line a row up.
   */
  const columnPages: ProjectAttachment[][] = Array.from({
    length: columnCount
  }, () => []);
  pages.forEach((attachment, index) => {
    columnPages[index % columnCount].push(attachment);
  });
  const indexOf = new Map(pages.map((attachment, index) => [attachment.id, index]));
  return <div className="relative h-full w-full">
      <ol className="scrollbar-overlay m-0 flex h-full w-full list-none items-start gap-1 overflow-x-hidden overflow-y-auto p-0">
      {columnPages.map((column, columnIndex) => <li key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-1">
          {/* The pages themselves stay list items, so a screen reader still hears
             "Page 2 of 5" in the work's own order regardless of which column it
             was dealt into. */}
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {column.map((attachment) => <ImagePage key={attachment.id} attachment={attachment} pageNumber={(indexOf.get(attachment.id) ?? 0) + 1} pageCount={pages.length} priorityCount={columnCount} />)}
          </ol>
        </li>)}
      </ol>
    </div>;
}
