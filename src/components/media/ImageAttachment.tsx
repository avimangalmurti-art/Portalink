import { useDocumentReadingScroll } from './useDocumentReadingScroll';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { ErrorState } from '../ui/StateViews';
import type { ProjectAttachment } from '../../types/domain';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { useSinglePageZoom } from './useSinglePageZoom';
import { useFocusedPageSwipe } from './useFocusedPageSwipe';
import { readViewerMemory, updateViewerMemory } from './viewerMemory';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { MediaInteractionBar } from '../../features/media-interactions/MediaInteractionBar';
import { FocusedPageExitControl } from './FocusedPageExitControl';
import { FocusedPageCounter } from './FocusedPageCounter';

function deepLinkedImageId(pages: ProjectAttachment[]): string | null {
  if (typeof window === 'undefined') return null;
  const attachmentId = new URLSearchParams(window.location.search).get('media');
  return attachmentId && pages.some((page) => page.id === attachmentId) ? attachmentId : null;
}

/**
 * One image page: loading, ready, and failure, per page rather than per project,
 * so one unreachable file never blanks the pages around it.
 * On mobile, the observer gates nearby pages; native lazy loading cannot start
 * an image that stays display:none until its load event.
 */
function ImagePage({
  projectId,
  attachment,
  pageNumber,
  pageCount,
  priorityCount,
  isFocused = false,
  isMobile = false,
  zoom = 1,
  showMediaInteractions = true,
  isOwner = false,
  focusMemoryKey,
  onToggleFocus

}: {projectId: string;attachment: ProjectAttachment;pageNumber: number;pageCount: number;priorityCount: number;isFocused?: boolean;isMobile?: boolean;zoom?: number;showMediaInteractions?: boolean;isOwner?: boolean;focusMemoryKey?: string;onToggleFocus: (attachmentId: string) => void;}) {
  const hostRef = useRef<HTMLLIElement>(null);
  const lastTouchRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastTouchToggleAtRef = useRef(0);
  const [shouldRender, setShouldRender] = useState(pageNumber <= priorityCount);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // Remounting the element is what a retry actually means for an image.
  const [attempt, setAttempt] = useState(0);
  const loadingStyle = {
    '--page-loading-ratio': attachment.metadata?.widthPixels && attachment.metadata?.heightPixels
      ? `${attachment.metadata.widthPixels} / ${attachment.metadata.heightPixels}` : undefined,
  } as React.CSSProperties;
  useLayoutEffect(() => {
    if (!isFocused || !focusMemoryKey) return;
    const remembered = readViewerMemory(focusMemoryKey);
    if (hostRef.current) {
      hostRef.current.scrollTop = remembered.scrollTop ?? 0;
      hostRef.current.scrollLeft = remembered.scrollLeft ?? 0;
    }
  }, [focusMemoryKey, isFocused, status]);
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
  return <li ref={hostRef} data-project-page-number={pageNumber} data-project-page-total={pageCount} data-reach-attachment={attachment.id} data-project-page-ready={status === 'ready'} data-focused-page-scroll={isFocused ? '' : undefined} role={isFocused ? undefined : 'button'} tabIndex={isFocused ? undefined : 0} aria-pressed={isFocused ? undefined : false} aria-label={`${pageCount > 1 ? `Page ${pageNumber} of ${pageCount}. ` : ''}${isFocused ? 'Single-image view. Scroll to return to all images. Pinch or Control plus wheel to zoom' : 'Expand image to fill the viewer'}`} onScroll={!isFocused || !focusMemoryKey ? undefined : (event) => updateViewerMemory(focusMemoryKey, { scrollTop: event.currentTarget.scrollTop, scrollLeft: event.currentTarget.scrollLeft })} onDoubleClick={isFocused ? undefined : (event) => {
    event.preventDefault();
    // Some touch browsers synthesize a mouse double-click after the second
    // pointer-up. The touch handler has already toggled by then, so ignore that
    // follow-on event instead of immediately toggling the image back.
    if (performance.now() - lastTouchToggleAtRef.current < 500) return;
    onToggleFocus(attachment.id);
  }} onPointerUp={isFocused ? undefined : (event) => {
    if (event.pointerType !== 'touch') return;
    const now = performance.now();
    const previous = lastTouchRef.current;
    const isDoubleTap = previous && now - previous.time < 320 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 24;
    lastTouchRef.current = { time: now, x: event.clientX, y: event.clientY };
    if (isDoubleTap) {
      event.preventDefault();
      lastTouchRef.current = null;
      lastTouchToggleAtRef.current = now;
      onToggleFocus(attachment.id);
    }
  }} onKeyDown={isFocused ? undefined : (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggleFocus(attachment.id);
    }
  }} className={`${isFocused ? 'flex h-full min-h-0 w-full items-start justify-start overflow-auto overscroll-contain' : 'block touch-manipulation'} group/media relative list-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]`} style={!isFocused && attachment.metadata?.widthPixels && attachment.metadata?.heightPixels ? {
    aspectRatio: `${attachment.metadata.widthPixels} / ${attachment.metadata.heightPixels}`
  } : undefined}>
      {!shouldRender ? <div data-page-loading="" style={loadingStyle} className="h-full min-h-[240px] w-full" aria-hidden="true" /> : null}
      {shouldRender ? <>
      {status === 'loading' && <div data-page-loading="" data-initial-page-loading={pageNumber === 1 ? '' : undefined} style={loadingStyle} role="status" aria-label={`Loading ${attachment.displayName}`} className="premium-media-placeholder flex min-h-[240px] w-full items-center justify-center">
          <span className="premium-media-loading-mark" aria-hidden="true" />
        </div>}
      {status === 'error' ? <div className="flex min-h-[240px] w-full items-center justify-center p-8">
          <ErrorState title="This image could not be displayed" description={attachment.fileName} onRetry={() => {
        setStatus('loading');
        setAttempt((current) => current + 1);
      }} />
        </div> : <ResponsiveImage data-media-page-surface="" key={attempt} src={attachment.sourceUrl} alt={attachment.displayName} width={attachment.metadata?.widthPixels} height={attachment.metadata?.heightPixels} sizes={isFocused ? '100vw' : '(min-width: 1100px) 70vw, 100vw'} priority={pageNumber <= priorityCount} loading={isMobile ? 'eager' : 'lazy'} onLoad={() => setStatus('ready')} onError={() => setStatus('error')} className={`${isFocused ? 'premium-focused-media m-auto max-h-none max-w-none object-contain' : 'h-auto w-full'} block ${status === 'ready' ? 'premium-media-ready' : 'hidden'}`} style={isFocused ? { width: `${zoom * 100}%`, height: `${zoom * 100}%` } : undefined} />}
      </> : null}
      {showMediaInteractions && <MediaInteractionBar placement={isFocused ? 'focused' : 'page'} pageCount={pageCount} isOwner={isOwner} target={{
        projectId,
        attachmentId: attachment.id,
        pageIndex: pageNumber - 1,
        label: pageCount > 1 ? `${attachment.displayName}, image ${pageNumber}` : attachment.displayName
      }} />}
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
  projectId,
  pages,
  columns = 1,
  onFocusModeChange,
  controlsVisible = true,
  showMediaInteractions = true,
  isOwner = false,
  memoryScope = 'workspace',
  pageViewToggleRequest = 0,
  verticalReading = false








}: {projectId: string; verticalReading?: boolean; /** Ordered image pages. A single-image project simply has one. */pages: ProjectAttachment[]; /**
   * How many pages sit side by side. Presentation only — it changes how much
   * width a page is given, never the page's own proportions or its order.
   */columns?: number;onFocusModeChange?: (focused: boolean) => void;controlsVisible?: boolean;showMediaInteractions?: boolean;isOwner?: boolean;memoryScope?: string;pageViewToggleRequest?: number;}) {
  const memoryKey = `${memoryScope}:images:${projectId}`;
  const pageIdsKey = pages.map((page) => page.id).join('|');
  const linkedImageId = deepLinkedImageId(pages);
  const [focusedPageId, setFocusedPageId] = useState<string | null>(() => {
    if (verticalReading) return null;
    if (linkedImageId) return linkedImageId;
    const remembered = readViewerMemory(memoryKey).focusedPageId;
    return remembered && pages.some((page) => page.id === remembered) ? remembered : null;
  });
  const zoomSurfaceRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLOListElement>(null);
  const handledViewToggleRequestRef = useRef(pageViewToggleRequest);
  const columnCount = Math.max(1, Math.min(columns, pages.length));
  const focusedPage = pages.find((page) => page.id === focusedPageId) ?? null;
  const focusedPageIndex = focusedPage ? pages.indexOf(focusedPage) : -1;
  useEffect(() => {
    if (verticalReading) { setFocusedPageId(null); return; }
    if (linkedImageId) {
      setFocusedPageId(linkedImageId);
      return;
    }
    const remembered = readViewerMemory(memoryKey).focusedPageId;
    const pageIds = pageIdsKey ? pageIdsKey.split('|') : [];
    setFocusedPageId(remembered && pageIds.includes(remembered) ? remembered : null);
  }, [linkedImageId, memoryKey, pageIdsKey, verticalReading]);
  useEffect(() => {
    if (focusedPageId && !pageIdsKey.split('|').includes(focusedPageId)) {
      setFocusedPageId(null);
      updateViewerMemory(memoryKey, { focusedPageId: null });
    }
  }, [focusedPageId, memoryKey, pageIdsKey]);
  useEffect(() => {
    onFocusModeChange?.(focusedPage !== null);
    return () => onFocusModeChange?.(false);
  }, [focusedPage, onFocusModeChange]);
  const focusPage = useCallback((attachmentId: string) => {
    setFocusedPageId(attachmentId);
    updateViewerMemory(memoryKey, { focusedPageId: attachmentId, lastFocusedPageId: attachmentId });
  }, [memoryKey]);
  const exitFocus = useCallback(() => {
    setFocusedPageId((current) => {
      updateViewerMemory(memoryKey, { focusedPageId: null, ...(current ? { lastFocusedPageId: current } : {}) });
      return null;
    });
  }, [memoryKey]);
  useEffect(() => {
    if (pageViewToggleRequest <= handledViewToggleRequestRef.current) return;
    handledViewToggleRequestRef.current = pageViewToggleRequest;
    if (focusedPageId) {
      exitFocus();
      return;
    }
    const rememberedPageId = readViewerMemory(memoryKey).lastFocusedPageId;
    const pageToRestore = rememberedPageId && pages.some((page) => page.id === rememberedPageId)
      ? rememberedPageId
      : pages[0]?.id;
    if (pageToRestore) focusPage(pageToRestore);
  }, [exitFocus, focusPage, focusedPageId, memoryKey, pageViewToggleRequest, pages]);
  const zoom = useSinglePageZoom({
    surfaceRef: zoomSurfaceRef,
    active: focusedPage !== null,
    onEnter: (pageNumber, nextZoom) => {
      const page = pages[pageNumber - 1];
      if (!page) return;
      updateViewerMemory(`${memoryKey}:${page.id}`, { zoom: nextZoom, scrollTop: 0, scrollLeft: 0 });
      focusPage(page.id);
    },
    onExit: exitFocus,
    memoryKey: focusedPage ? `${memoryKey}:${focusedPage.id}` : memoryKey
  });

  const moveFocusedPage = useCallback((direction: -1 | 1) => {
    if (focusedPageIndex < 0) return;
    const nextIndex = Math.min(pages.length - 1, Math.max(0, focusedPageIndex + direction));
    if (nextIndex !== focusedPageIndex) focusPage(pages[nextIndex].id);
  }, [focusPage, focusedPageIndex, pages]);

  const { isMobile, swipeStyle, swipeHandlers } = useFocusedPageSwipe({ active: focusedPage !== null, zoom, onMove: moveFocusedPage, onExit: exitFocus });
  useEffect(() => {
    if (focusedPage) zoomSurfaceRef.current?.focus({ preventScroll: true });
  }, [focusedPage]);

  useDocumentReadingScroll(isMobile && !focusedPage, gridScrollRef, memoryKey, verticalReading && linkedImageId ? pages.findIndex(page => page.id === linkedImageId) + 1 : null);
  useLayoutEffect(() => {
    if (isMobile || focusedPage) return;
    const element = gridScrollRef.current;
    if (element) element.scrollTop = readViewerMemory(memoryKey).scrollTop ?? 0;
  }, [focusedPage, memoryKey, isMobile]);

  if (focusedPage) {
    return <div ref={zoomSurfaceRef} tabIndex={0} aria-label={`Image ${focusedPageIndex + 1} of ${pages.length}. Use arrow keys or swipe to move between images`} onKeyDown={(event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveFocusedPage(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveFocusedPage(1);
      }
    }} {...swipeHandlers} data-mobile-focused-view={isMobile ? '' : undefined} className="premium-media-mode-enter relative h-full min-h-0 w-full overflow-hidden outline-none" style={swipeStyle}>
        <FocusedPageExitControl
          onExit={exitFocus}
          label="Exit single-image view"
        />
        {pages.length > 1 ? <>
            {!isMobile && focusedPageIndex > 0 ? <button type="button" data-viewer-page-control="" data-side="previous" tabIndex={controlsVisible ? 0 : -1} onClick={() => moveFocusedPage(-1)} aria-label="Previous image" className="premium-viewer-page-control side-panel-compact-control absolute left-2 top-1/2 z-30 flex -translate-y-1/2 items-center justify-center text-white">
              <InterfaceIcon icon={ChevronLeftIcon} size="lg" weight="medium" />
            </button> : null}
            {!isMobile && focusedPageIndex < pages.length - 1 ? <button type="button" data-viewer-page-control="" data-side="next" tabIndex={controlsVisible ? 0 : -1} onClick={() => moveFocusedPage(1)} aria-label="Next image" className="premium-viewer-page-control side-panel-compact-control absolute right-2 top-1/2 z-30 flex -translate-y-1/2 items-center justify-center text-white">
              <InterfaceIcon icon={ChevronRightIcon} size="lg" weight="medium" />
            </button> : null}
            <FocusedPageCounter current={focusedPageIndex + 1} total={pages.length} showMediaInteractions={showMediaInteractions} />
          </> : null}
        <ol className="m-0 h-full w-full list-none p-0">
          <ImagePage isMobile={isMobile} projectId={projectId} attachment={focusedPage} pageNumber={pages.indexOf(focusedPage) + 1} pageCount={pages.length} priorityCount={isMobile ? pages.length : 1} isFocused zoom={zoom} showMediaInteractions={showMediaInteractions && !isMobile} isOwner={isOwner} focusMemoryKey={`${memoryKey}:${focusedPage.id}`} onToggleFocus={focusPage} />
        </ol>
        {isMobile && showMediaInteractions ? <MediaInteractionBar placement="focused" pageCount={pages.length} isOwner={isOwner} target={{
          projectId,
          attachmentId: focusedPage.id,
          pageIndex: focusedPageIndex,
          label: focusedPage.displayName
        }} /> : null}
      </div>;
  }
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
  return <div ref={zoomSurfaceRef} className="premium-media-mode-enter relative h-full w-full">
      <ol ref={gridScrollRef} onScroll={(event) => updateViewerMemory(memoryKey, { scrollTop: event.currentTarget.scrollTop })} className="scrollbar-overlay m-0 flex h-full w-full list-none items-start gap-[2px] overflow-x-hidden overflow-y-auto p-0">
      {columnPages.map((column, columnIndex) => <li key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-[2px]">
          {/* The pages themselves stay list items, so a screen reader still hears
             "Page 2 of 5" in the work's own order regardless of which column it
             was dealt into. */}
          <ol className="m-0 flex list-none flex-col gap-[2px] p-0">
            {column.map((attachment) => <ImagePage isMobile={isMobile} key={attachment.id} projectId={projectId} attachment={attachment} pageNumber={(indexOf.get(attachment.id) ?? 0) + 1} pageCount={pages.length} priorityCount={columnCount} showMediaInteractions={showMediaInteractions && !isMobile} isOwner={isOwner} onToggleFocus={focusPage} />)}
          </ol>
        </li>)}
      </ol>
    </div>;
}
