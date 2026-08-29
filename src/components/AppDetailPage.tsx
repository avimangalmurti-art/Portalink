import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { PageActions } from './profile/PageActions';
import { CreatorAvatar } from './profile/CreatorAvatar';
import { ProjectCover } from './media/ProjectCover';
import type { FeatureCardApp } from './FeatureCard';
import { InterfaceIcon } from './ui/InterfaceIcon';
type AppDetailPageProps = {
  app: FeatureCardApp;
  savedState?: ProductDetailState;
  onStateChange: (state: ProductDetailState) => void;
  onBack: () => void;
  onOpenCreator?: (creator: {
    id: string;
    name: string;
    kind: string;
  }) => void;
};
export type ProductDetailView = 'overview' | 'highlights' | 'designer' | 'colours' | 'sizing' | 'materials' | 'reviews' | 'shipping';
export type ProductDetailState = {
  activeView: ProductDetailView;
  scrollTop: number;
};
const MIN_ZOOM = 40;
const MAX_ZOOM = 200;
const ZOOM_STEP = 5;
// A metadata line only renders when the product already carries that value —
// nothing here is invented or padded out.
function DetailRow({
  label,
  children



}: {label: string;children: React.ReactNode;}) {
  return <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{label}</dt>
      <dd className="m-0 text-[13px] leading-[1.45] text-[var(--text-primary)]">{children}</dd>
    </div>;
}
export function AppDetailPage({
  app,
  onBack,
  onOpenCreator
}: AppDetailPageProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const pageCount = app.pageCount ?? 1;
  const aspectRatio = app.aspectRatio ?? 1 / 1.414;
  const fileName = app.fileName ?? app.name;
  // Zoom is captured inside the document stage only, so the wheel never zooms
  // the browser or the page behind the viewer.
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    let accumulated = 0;
    function onWheel(event: WheelEvent) {
      const fitsWithoutScrolling = stage!.scrollHeight <= stage!.clientHeight + 1;
      // Zoom on a held modifier, or on a plain wheel when there is nothing to
      // scroll — so reading a long document is never hijacked.
      if (!event.ctrlKey && !event.metaKey && !event.altKey && !fitsWithoutScrolling) {
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
    }
    stage.addEventListener('wheel', onWheel, {
      passive: false
    });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {
    closeButtonRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onBack();
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onBack]);
  const openCreator = app.creatorName && onOpenCreator ? () => onOpenCreator({
    id: app.creatorId ?? app.creatorName ?? '',
    name: app.creatorName ?? '',
    kind: app.creatorKind ?? ''
  }) : undefined;
  // Documents report pages; single-file work does not.
  const showPageCount = pageCount > 1;
  return <motion.div className="modal-scrim fixed inset-0 z-40 flex items-stretch justify-center bg-black/45 p-4 sm:p-6 lg:p-8" role="presentation" initial={{
    opacity: 0
  }} animate={{
    opacity: 1
  }} exit={{
    opacity: 0
  }} transition={{
    duration: shouldReduceMotion ? 0 : 0.18
  }} onMouseDown={(event) => {
    if (event.target === event.currentTarget) {
      onBack();
    }
  }}>
      <motion.section data-material="content" role="dialog" aria-modal="true" aria-label={fileName} className="feed-starfield flex h-full w-full max-w-[1440px] flex-col overflow-hidden rounded-[18px] bg-transparent" initial={shouldReduceMotion ? {
      opacity: 0
    } : {
      opacity: 0,
      scale: 0.985
    }} animate={{
      opacity: 1,
      scale: 1
    }} exit={shouldReduceMotion ? {
      opacity: 0
    } : {
      opacity: 0,
      scale: 0.99
    }} transition={{
      duration: shouldReduceMotion ? 0 : 0.18,
      ease: [0.23, 1, 0.32, 1]
    }}>
        {/* Compact top bar: close, what this is, who made it, existing actions. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--hairline)] px-3 sm:px-4">
          <button ref={closeButtonRef} type="button" onClick={onBack} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={XIcon} size="lg" weight="medium" />
          </button>
          <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
            <h1 className="min-w-0 truncate text-[15px] font-semibold text-[var(--text-primary)]">{fileName}</h1>
            {app.creatorName && <span aria-hidden="true" className="hidden shrink-0 text-[13px] text-[var(--text-tertiary)] sm:inline">·</span>}
            {/* The creator name takes the accent on hover, so it reads as a way
               through to their profile. */}
            {app.creatorName && (openCreator ? <button type="button" onClick={openCreator} data-creator-link="" className="hidden shrink-0 items-center gap-1.5 rounded-[7px] text-[13px] text-[var(--text-secondary)] transition-colors duration-150 hover:text-[var(--accent-text)] focus-visible:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:flex">
                <CreatorAvatar name={app.creatorName} avatar={app.creatorAvatar} className="h-5 w-5 text-[10px]" />
                {app.creatorName}
              </button> : <span className="hidden shrink-0 items-center gap-1.5 text-[13px] text-[var(--text-secondary)] sm:flex"><CreatorAvatar name={app.creatorName} avatar={app.creatorAvatar} className="h-5 w-5 text-[10px]" />{app.creatorName}</span>)}
          </div>
        </header>

        {/* Stage dominates; the rail sits beside it on desktop, beneath on narrow. */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div ref={stageRef} className="scrollbar-slim min-h-0 flex-1 overflow-y-auto bg-transparent px-4 py-5 sm:px-8 sm:py-7">
            <div className="mx-auto flex w-full flex-col items-center gap-4" style={{
            maxWidth: `${720 * (zoom / 100)}px`
          }}>
              {Array.from({
              length: pageCount
            }).map((_, index) => <div key={index} className="w-full">
                  {/* The real source page leads; remaining pages of a longer
                   document stay neutral rather than inventing contents. */}
                  <div aria-label={`Page ${index + 1} of ${pageCount}`} className="w-full overflow-hidden rounded-[10px] bg-[var(--surface-placeholder)]" style={{
                aspectRatio
              }}>
                    {index === 0 && app.coverImage && <ProjectCover source={app.coverImage} alt={app.coverAlt ?? app.name} kind={app.coverKind} fit="contain" aspectRatio={app.aspectRatio} sizes="(min-width: 900px) 62vw, 100vw" priority />}
                  </div>
                  {/* The same response row every viewer shows beneath a page. */}
                  <PageActions />
                </div>)}
            </div>
            {/* A live readout, so the wheel's effect is never ambiguous. */}
            <p role="status" aria-live="polite" className="mt-4 text-center text-[12px] font-medium tabular-nums text-[var(--text-tertiary)]">{zoom}%</p>
          </div>

          <aside aria-label="Content details" className="scrollbar-slim min-h-0 shrink-0 overflow-y-auto border-t border-[var(--hairline)] px-4 py-5 sm:px-5 lg:w-[300px] lg:border-l lg:border-t-0 xl:w-[340px]">
            {/* Creator identity leads, visually distinct from the title. */}
            {app.creatorName && <div className="mb-5">
                {openCreator ? <button type="button" onClick={openCreator} aria-label={`Open ${app.creatorName}'s profile`} data-creator-link="" className="group/creator flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                    <CreatorAvatar name={app.creatorName} avatar={app.creatorAvatar} className="h-9 w-9 text-[13px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold leading-[1.3] text-[var(--text-primary)] transition-colors duration-150 group-hover/creator:text-[var(--accent-text)]">{app.creatorName}</span>
                      {app.creatorKind && <span className="block truncate text-[12px] text-[var(--text-tertiary)]">{app.creatorKind}</span>}
                    </span>
                  </button> : <div className="flex items-center gap-2.5 px-1.5 py-1.5">
                    <CreatorAvatar name={app.creatorName} avatar={app.creatorAvatar} className="h-9 w-9 text-[13px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold leading-[1.3] text-[var(--text-primary)]">{app.creatorName}</span>
                      {app.creatorKind && <span className="block truncate text-[12px] text-[var(--text-tertiary)]">{app.creatorKind}</span>}
                    </span>
                  </div>}
              </div>}

            <h2 className="text-[17px] font-semibold leading-[1.3] text-[var(--text-primary)]">{app.name}</h2>
            {app.description && <p className="mt-2 text-[13px] leading-[1.55] text-[var(--text-secondary)]">{app.description}</p>}

            <dl className="mt-6 flex flex-col gap-4 border-t border-[var(--hairline)] pt-5">
              {app.mediaLabel && <DetailRow label="Type">{app.mediaLabel}</DetailRow>}
              {app.tagline && <DetailRow label="Details">{app.tagline}</DetailRow>}
              <DetailRow label="File">{fileName}</DetailRow>
              {showPageCount && <DetailRow label="Pages">{pageCount}</DetailRow>}
            </dl>
          </aside>
        </div>
      </motion.section>
    </motion.div>;
}
