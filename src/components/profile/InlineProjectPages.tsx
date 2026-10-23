import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Project, ProjectAttachment } from '../../types/domain';
import { resolveCataloguePageIndex, type CataloguePagePosition } from '../../features/profile/cataloguePagePosition';
import { useElementSize } from '../../hooks/useElementSize';
import { usePresentation } from '../../presentation/usePresentation';
import { motionMs } from '../../presentation/motion/motion';
import { ImagePage } from '../media/ImageAttachment';
import { AttachmentRenderer } from '../media/AttachmentRenderer';
import { ErrorState } from '../ui/StateViews';
import { getProjectContinuityArtwork, projectContinuityStyle } from '../../utils/projectContinuity';
import { inlineDocumentCount, inlineDocumentCountKey, inlineDotLimit, inlineDotWindow, inlineKeyboardPage, inlinePositionMatches, inlineProjectSlides, type InlineProjectSlide } from './inlineProjectPageModel';
import { useInlineProjectSwipe } from './useInlineProjectSwipe';
import './inline-project-pages.css';

const PdfPage = lazy(() => import('../media/PdfPage').then(module => ({ default: module.PdfPage })));
const noAction = () => undefined;

type Props = {
  project: Project;
  active: boolean;
  cover: React.ReactNode;
  position?: CataloguePagePosition;
  onSelect: (position: CataloguePagePosition) => void;
  onOpen: (event?: React.MouseEvent<HTMLElement>) => void;
  href?: string;
  label: string;
  ownerId?: string;
  /** Attachment summaries cannot establish real page counts or removed targets. */
  metadataComplete?: boolean;
};

function slidePosition(slide: InlineProjectSlide): CataloguePagePosition {
  return { index: slide.index, key: slide.key, ...(slide.attachmentId ? { attachmentId: slide.attachmentId } : {}), ...(slide.page ? { page: slide.page } : {}) };
}

function interactiveSlide(slide: InlineProjectSlide): boolean {
  return Boolean(slide.attachment && slide.attachment.kind !== 'image' && slide.attachment.kind !== 'document');
}

function slideArtwork(project: Project, slide: InlineProjectSlide): string | undefined {
  if (!slide.attachment) return getProjectContinuityArtwork(project, true);
  if (slide.attachment.kind === 'image') return JSON.stringify([slide.attachment.id, 0]);
  if (slide.attachment.kind === 'document') return JSON.stringify([slide.attachment.id, slide.page]);
  return undefined;
}

function slideDescription(project: Project, slide: InlineProjectSlide, total: number): string {
  const description = !slide.attachment ? 'Cover' : slide.attachment.kind === 'document'
    ? `${slide.attachment.displayName}, page ${slide.page}` : slide.attachment.displayName;
  return `${description}. Slide ${slide.index + 1} of ${total} in ${project.title}.`;
}

/** Actual project media, fitted into the cover's unchanged card box. */
function InlineAttachmentPage({ project, slide, current, active, onCount }: {
  project: Project; slide: InlineProjectSlide; current: boolean; active: boolean; onCount: (attachment: ProjectAttachment, count: number) => void;
}) {
  const isMobile = usePresentation() === 'mobile';
  const attachment = slide.attachment;
  if (!attachment) return null;
  if (attachment.kind === 'image') return <ol className="inline-project-image-list"><ImagePage
    projectId={project.id} attachment={attachment} pageNumber={slide.page ?? 1} pageCount={project.attachments?.filter(item => item.kind === 'image').length ?? 1}
    priorityCount={1} isFocused isMobile={isMobile} inlinePreview showMediaInteractions={false} onToggleFocus={noAction} /> </ol>;
  if (attachment.kind === 'document') {
    const page = attachment.metadata?.renderedPages?.find(item => item.attachmentId === attachment.id && item.withinDocumentIndex === slide.page && item.sourceUrl);
    if (page?.sourceUrl) {
      const rendered: ProjectAttachment = { ...attachment, kind: 'image', sourceUrl: page.sourceUrl,
        displayName: `${attachment.displayName}, page ${page.withinDocumentIndex}`,
        metadata: { ...attachment.metadata, widthPixels: page.width, heightPixels: page.height } };
      return <ol className="inline-project-image-list"><ImagePage projectId={project.id} attachment={rendered} pageNumber={slide.page ?? 1}
        pageCount={attachment.metadata?.pageCount ?? attachment.metadata?.renderedPages?.length ?? 1} priorityCount={1}
        isFocused isMobile={isMobile} inlinePreview showMediaInteractions={false} onToggleFocus={noAction} /></ol>;
    }
    if (attachment.sourceUrl) return <Suspense fallback={<span className="inline-project-loading" aria-hidden="true"><span className="premium-media-loading-mark" /></span>}>
      <PdfPage source={attachment.sourceUrl} pageNumber={slide.page} strictPageNumber fit="contain" label={`${attachment.displayName}, page ${slide.page}`}
        onPageCountChange={count => onCount(attachment, count)} />
    </Suspense>;
    return <div className="p-5"><ErrorState title="Nothing to show yet" description={`${attachment.displayName} has no preview available in this session.`} /></div>;
  }
  if (attachment.kind === 'audio' && !attachment.sourceUrl) return <div className="p-5"><ErrorState title="Nothing to play yet" description={`${attachment.displayName} has no playable source in this session.`} /></div>;
  return current ? <AttachmentRenderer projectId={project.id} projectTitle={project.title} attachment={attachment} videoActive={active}
    inlinePreview showMediaInteractions={false} onClose={noAction} /> : null;
}

/** One project only. The surrounding wall continues to own vertical navigation. */
export function InlineProjectPages({ project, active, cover, position, onSelect, onOpen, href, label, ownerId, metadataComplete = false }: Props) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const [near, setNear] = useState(false);
  const [documentCounts, setDocumentCounts] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState('');
  const slides = useMemo(() => inlineProjectSlides(metadataComplete ? project : {}, documentCounts), [project, documentCounts, metadataComplete]);
  const keys = slides.map(slide => slide.key);
  const unknownDocuments = (metadataComplete ? project.attachments ?? [] : []).filter(attachment => attachment.kind === 'document' && attachment.sourceUrl
    && inlineDocumentCount(attachment, documentCounts[inlineDocumentCountKey(attachment)]) === undefined);
  const unresolved = !metadataComplete || unknownDocuments.length > 0;
  const selected = unresolved && position && !keys.includes(position.key) ? 0 : resolveCataloguePageIndex(keys, position);
  const selectedSlide = slides[selected];
  const selectedDescription = slideDescription(project, selectedSlide, slides.length);
  const lastSelection = useRef(selectedSlide.key);
  const onCount = useCallback((attachment: ProjectAttachment, count: number) => {
    if (!Number.isSafeInteger(count) || count < 1) return;
    const key = inlineDocumentCountKey(attachment);
    setDocumentCounts(previous => previous[key] === count ? previous : { ...previous, [key]: count });
  }, []);
  const select = (index: number) => {
    const slide = slides[index];
    if (slide && slide.key !== selectedSlide.key) onSelect(slidePosition(slide));
  };
  const swipe = useInlineProjectSwipe(active && !unresolved && slides.length > 1, selected, slides.length, select);
  useEffect(() => {
    const host = ref.current;
    if (!host || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '240px 0px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, [ref]);
  const unknownKey = unknownDocuments.map(inlineDocumentCountKey).join('|');
  useEffect(() => {
    if (!active || !near || !unknownKey) return;
    let disposed = false;
    let currentTask: { destroy: () => Promise<void> } | undefined;
    void (async () => {
      const { loadPdfJs, pdfSourceOptions } = await import('../media/PdfPage');
      const pdf = await loadPdfJs();
      for (const attachment of unknownDocuments) {
        if (disposed || !attachment.sourceUrl) break;
        const task = pdf.getDocument(pdfSourceOptions(attachment.sourceUrl, true));
        currentTask = task;
        try {
          const document = await task.promise;
          if (!disposed) onCount(attachment, document.numPages);
        } catch { /* The selected page retains the existing PDF failure presentation. */ }
        finally { currentTask = undefined; void task.destroy(); }
      }
    })().catch(() => undefined);
    return () => { disposed = true; void currentTask?.destroy(); };
    // Attachment identity/source signatures, not signed-object reference churn, own each task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, near, unknownKey, onCount]);
  useEffect(() => {
    if (!unresolved && project.attachments && position && !inlinePositionMatches(position, selectedSlide)) onSelect(slidePosition(selectedSlide));
  }, [unresolved, project.attachments, position, selectedSlide, selected, onSelect]);
  useEffect(() => {
    if (lastSelection.current === selectedSlide.key) return;
    const timer = window.setTimeout(() => { lastSelection.current = selectedSlide.key; setAnnouncement(selectedDescription); }, motionMs('base'));
    return () => window.clearTimeout(timer);
  }, [selectedSlide.key, selectedDescription]);
  const pagination = inlineDotWindow(selected, slides.length, inlineDotLimit(width));
  const keyboard = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!active) return;
    const target = event.target as Element;
    if (target !== event.currentTarget && !target.closest('[data-inline-project-open]')) return;
    const next = inlineKeyboardPage(event.key, selected, slides.length);
    if (next !== null && slides.length > 1) {
      event.preventDefault(); event.stopPropagation();
      ref.current?.focus({ preventScroll: true });
      select(next);
    } else if (target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); event.stopPropagation(); onOpen();
    }
  };
  return <div ref={ref} className="inline-project-pages" role="group" aria-roledescription={slides.length > 1 ? 'carousel' : undefined}
    aria-label={`${project.title} pages`} tabIndex={active ? 0 : -1} data-inline-selected={selected} data-inline-slide-count={slides.length}
    onKeyDown={keyboard} {...swipe.handlers}>
    <div className="inline-project-track" data-dragging={swipe.dragging || undefined} style={{ transform: `translate3d(calc(${-selected * 100}% + ${swipe.offset}px),0,0)` }}>
      {slides.filter(slide => Math.abs(slide.index - selected) <= 1).map(slide => {
        const current = slide.index === selected;
        const interactive = interactiveSlide(slide);
        const content = slide.attachment ? <InlineAttachmentPage project={project} slide={slide} current={current} active={active && current} onCount={onCount} /> : cover;
        const openProps = { 'data-inline-project-open': '', 'data-preview-open': current ? '' : undefined, 'data-project-continuity-surface': '',
          'data-project-continuity-id': project.id, 'data-project-continuity-owner': ownerId, 'data-project-continuity-artwork': slideArtwork(project, slide),
          style: projectContinuityStyle(project.id), 'aria-label': label, tabIndex: active && current ? 0 : -1,
          onClick: (event: React.MouseEvent<HTMLElement>) => { if (active && current) onOpen(event); else event.preventDefault(); }, onDragStart: (event: React.DragEvent) => event.preventDefault(),
          className: 'inline-project-open project-preview-artwork' };
        return <div key={slide.key} className="inline-project-slide" style={{ left: `${slide.index * 100}%` }} aria-hidden={!current || undefined}
          ref={element => { if (element) element.inert = !current; }} data-inline-slide-key={slide.key}>
          {interactive ? <>
            {href ? <Link to={href} {...openProps} /> : <button type="button" {...openProps} />}
            {current && <div className="inline-project-content" data-inline-media-interactive="" onClick={event => {
              if ((event.target as Element).closest('a,button,input,textarea,select,video,audio,[contenteditable="true"],[role="slider"],canvas')) { event.stopPropagation(); return; }
              onOpen(event);
            }}>{content}</div>}
          </> : href ? <Link to={href} {...openProps}><div className="inline-project-content">{content}</div></Link>
            : <button type="button" {...openProps}><div className="inline-project-content">{content}</div></button>}
        </div>;
      })}
    </div>
    {slides.length > 1 && !unresolved && pagination.length > 0 && <div className="inline-project-pagination" role="slider" aria-label={`Pages in ${project.title}`} data-inline-project-control=""
      aria-valuemin={1} aria-valuemax={slides.length} aria-valuenow={selected + 1} aria-valuetext={selectedDescription}
      aria-orientation="horizontal" aria-disabled={!active || undefined} tabIndex={active ? 0 : -1}
      onClick={event => {
        event.preventDefault(); event.stopPropagation();
        if (!active || event.detail === 0) return;
        const dots = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-inline-dot-index]')];
        const nearest = dots.reduce<HTMLElement | undefined>((closest, dot) => {
          const distance = (item: HTMLElement) => { const rect = item.getBoundingClientRect(); return Math.abs(event.clientX - rect.left - rect.width / 2); };
          return !closest || distance(dot) < distance(closest) ? dot : closest;
        }, undefined);
        if (nearest) select(Number(nearest.dataset.inlineDotIndex));
      }} onKeyDown={event => {
          if (!active) return;
          const key = event.key === 'ArrowUp' ? 'ArrowRight' : event.key === 'ArrowDown' ? 'ArrowLeft' : event.key;
          const next = inlineKeyboardPage(key, selected, slides.length);
          if (next === null) return;
          event.preventDefault(); event.stopPropagation(); select(next);
        }}>
      <span className="inline-project-dots" aria-hidden="true">
        {pagination.map(index => <span key={index} className="inline-project-dot" data-inline-dot-index={index} data-selected={index === selected}
          data-window-edge={index !== selected && ((index === pagination[0] && index > 0) || (index === pagination[pagination.length - 1] && index < slides.length - 1)) || undefined} />)}
      </span>
    </div>}
    <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
  </div>;
}
