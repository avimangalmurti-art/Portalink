import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MinusIcon, PlusIcon, XIcon } from 'lucide-react';
import { PageActions } from './PageActions';
import { InterfaceIcon } from '../ui/InterfaceIcon';
type PdfViewerProps = {
  fileName: string;
  pageCount?: number;
  onClose: () => void;
};
const MIN_ZOOM = 15;
const MAX_ZOOM = 200;
const DEFAULT_ZOOM = 55;
const FOCUS_ZOOM = 60;
const ZOOM_STEP = 5;
const BASE_PAGE_WIDTH = 760;
const PAGE_GAP = 20;
const MAX_COLUMNS = 9;
const PAGE_GUTTER = 32;

// The display size the reader chooses is reused for the next document they open.
let preferredZoom = DEFAULT_ZOOM;
export function PdfViewer({
  fileName,
  pageCount = 6,
  onClose
}: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hoveredPage, setHoveredPage] = useState<number | null>(null);
  const [zoom, setZoomState] = useState(preferredZoom);
  const setZoom = useCallback((value: number | ((current: number) => number)) => {
    setZoomState((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      // The size the reader picks becomes the size every document opens at.
      preferredZoom = next;
      return next;
    });
  }, []);
  const [availableWidth, setAvailableWidth] = useState(0);
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) {
      return;
    }
    const measure = () => setAvailableWidth(viewport.clientWidth - PAGE_GUTTER * 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  // Double-clicking a page opens that page on its own at reading size.
  const openPageAtFocusZoom = useCallback((index: number) => {
    setZoom(FOCUS_ZOOM);
    setCurrentPage(index + 1);
    window.requestAnimationFrame(() => {
      pageRefs.current[index]?.scrollIntoView({
        block: 'start',
        behavior: 'smooth'
      });
    });
  }, [setZoom]);
  const pageWidth = BASE_PAGE_WIDTH * (zoom / 100);
  // Only as wide as the columns that actually fit, so the grid stays centred.
  const fittingColumns = availableWidth > 0 ? Math.max(1, Math.min(MAX_COLUMNS, Math.floor((availableWidth + PAGE_GAP) / (pageWidth + PAGE_GAP)))) : MAX_COLUMNS;
  const trackMaxWidth = fittingColumns * pageWidth + (fittingColumns - 1) * PAGE_GAP;
  useEffect(() => {
    setCurrentPage(1);
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: 'auto'
    });
  }, [fileName]);
  const handleScroll = useCallback(() => {
    const viewport = scrollRef.current;
    if (!viewport) {
      return;
    }
    const midpoint = viewport.getBoundingClientRect().top + viewport.clientHeight / 2;
    let nextPage = 1;
    pageRefs.current.forEach((element, index) => {
      if (!element) {
        return;
      }
      if (element.getBoundingClientRect().top <= midpoint) {
        nextPage = index + 1;
      }
    });
    setCurrentPage((current) => current === nextPage ? current : nextPage);
  }, []);
  const adjustZoom = useCallback((delta: number) => {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + delta)));
  }, []);

  // Pinch / ctrl-scroll zoom is captured inside the viewer only, so the browser
  // never zooms the whole page. A non-passive listener is required to cancel it.
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) {
      return;
    }
    let accumulated = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      accumulated += event.deltaY;
      if (Math.abs(accumulated) < 40) {
        return;
      }
      const direction = accumulated > 0 ? -1 : 1;
      accumulated = 0;
      setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + direction * ZOOM_STEP)));
    };
    viewport.addEventListener('wheel', onWheel, {
      passive: false
    });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);
  // Escape is the expected way out of a full-bleed document view.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <div className="flex h-full min-h-0 w-full flex-col bg-[var(--surface-sunken)]" aria-label={`${fileName} document viewer`}>
      {/* A reading toolbar, not an identity bar: the title is gone — the portal
         sidebar already names the work — and what remains is the page readout and
         the display-size control, which report and change this document. */}
      <header data-mobile-safe-header="" data-material="toolbar" className="global-control-header side-panel-content-inset shrink-0 justify-end bg-[var(--surface-canvas)]">
        <p aria-live="polite" className="shrink-0 text-[13px] tabular-nums text-[var(--text-tertiary)]">
          Page {hoveredPage ?? currentPage} of {pageCount}
        </p>
        <div className="side-panel-header-control side-panel-control-row min-w-0 bg-[var(--surface-sunken)] px-1.5">
          <button type="button" onClick={() => adjustZoom(-ZOOM_STEP)} aria-label="Show smaller" disabled={zoom <= MIN_ZOOM} className="side-panel-compact-control shape-compact flex shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={MinusIcon} size="sm" weight="medium" />
          </button>
          <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={ZOOM_STEP} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Display size" className="zoom-range h-1 w-24 min-w-8 flex-1 cursor-pointer" />
          <button type="button" onClick={() => adjustZoom(ZOOM_STEP)} aria-label="Show larger" disabled={zoom >= MAX_ZOOM} className="side-panel-compact-control shape-compact flex shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-35 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />
          </button>
        </div>
      </header>

      <div data-mobile-scroll-end="" ref={scrollRef} onScroll={handleScroll} className="scrollbar-slim min-h-0 flex-1 overflow-auto overscroll-contain p-8" style={{
      touchAction: 'pan-x pan-y'
    }}>
        <ol role="list" className="mx-auto flex flex-wrap items-start justify-start" style={{
        gap: `${PAGE_GAP}px`,
        maxWidth: `${trackMaxWidth}px`
      }}>
          {Array.from({
          length: pageCount
        }).map((_, index) => <li key={index} ref={(element) => {
          pageRefs.current[index] = element;
        }} onDoubleClick={() => openPageAtFocusZoom(index)} onMouseEnter={() => setHoveredPage(index + 1)} onMouseLeave={() => setHoveredPage((current) => current === index + 1 ? null : current)} style={{
          width: `${pageWidth}px`
        }}>
              <div aria-label={`Page ${index + 1}`} data-artboard="" className="flex aspect-[1/1.294] w-full flex-col gap-[3%] rounded-[4px] bg-[var(--surface-placeholder)] p-[8%] outline outline-1 outline-transparent transition-[outline-color] duration-[var(--m-fast)] hover:outline-[var(--hairline-strong)]">
                <span aria-hidden="true" className="block h-[9%] w-[72%] rounded-[3px] bg-[var(--text-disabled)]" />
                <span aria-hidden="true" className="block h-[9%] w-[54%] rounded-[3px] bg-[var(--text-disabled)]" />
                <span aria-hidden="true" className="mt-[4%] block h-[34%] w-full rounded-[3px] bg-[var(--text-disabled)]" />
                <div className="mt-auto flex flex-col gap-[2.5%]" aria-hidden="true">
                  <span className="block h-[3%] w-full rounded-full bg-[var(--text-disabled)]" />
                  <span className="block h-[3%] w-[92%] rounded-full bg-[var(--text-disabled)]" />
                  <span className="block h-[3%] w-[64%] rounded-full bg-[var(--text-disabled)]" />
                </div>
              </div>
              {/* Response actions sit under each page, left-aligned. */}
              <PageActions showViews />
            </li>)}
        </ol>
      </div>

    </div>;
}
