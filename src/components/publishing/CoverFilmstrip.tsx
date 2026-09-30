import { useEffect, useRef, useState } from 'react';
import { FileIcon, MoveIcon, RotateCcwIcon } from 'lucide-react';
import type { PreparedMedia } from '../../types/publishing';
import type { ProjectCoverFrame } from '../../types/domain';
import type { ImageSize } from '../../types/imageCrop';
import type { MediaPreparation } from '../../features/publishing/useMediaPreparation';
import { canBeCover } from '../../features/publishing/assetTypes';
import { normalizeProjectCoverFrame } from '../../utils/coverFrame';
import { cropFromPosition, imagePositionStyle, zoomImage } from '../../utils/imageCrop';
import { loadPdfJs, pdfSourceOptions, type PdfDocument, type PdfLoadingTask } from '../media/PdfPage';
import { projectPreviewSource } from '../media/projectPreviewSource';
import { useInlineCoverCrop } from './useInlineCoverCrop';

type ThumbnailProps = {
  item: PreparedMedia; page: number; pdf?: PdfDocument; selected: boolean; disabled: boolean;
  frame: ProjectCoverFrame; onSelect: () => void; onChange: (frame: ProjectCoverFrame) => void;
  onReady: (size: ImageSize) => void;
  compact?: boolean; previewOnly?: boolean; readOnly?: boolean;
};

function CoverThumbnail({ item, page, pdf, selected, disabled, frame, onSelect, onChange, onReady, compact, previewOnly, readOnly }: ThumbnailProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<{ url?: string; error?: string; size?: ImageSize }>({});
  const [size, setSize] = useState<ImageSize | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ready = useRef(onReady);
  ready.current = onReady;
  const source = item.family === 'image' ? item.previewUrl : preview.url;
  const shouldRender = visible || selected;
  const editable = selected && !disabled && !previewOnly && Boolean(size);
  const crop = useInlineCoverCrop({ active: editable, frame, size, onChange });
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '160px' });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (selected && size) ready.current(size);
  }, [selected, size]);
  useEffect(() => {
    if (!shouldRender || !item.previewUrl || item.family === 'image') return;
    if (item.family === 'document' && !pdf) return;
    if (!['document', 'video'].includes(item.family)) return;
    const abort = new AbortController();
    let ownedUrl: string | undefined;
    const sourceUrl = item.previewUrl;
    let originalSize: ImageSize | undefined;
    let render: ReturnType<Awaited<ReturnType<PdfDocument['getPage']>>['render']> | undefined;
    setPreview({});
    setSize(null);
    void (async () => {
      let blob: Blob;
      if (pdf) {
        const pdfPage = await pdf.getPage(page);
        abort.signal.throwIfAborted();
        const original = pdfPage.getViewport({ scale: 1 });
        originalSize = { width: original.width, height: original.height };
        const viewport = pdfPage.getViewport({ scale: Math.min(640 / original.width, 640 / original.height) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        render = pdfPage.render({ canvas, viewport, background: '#ffffff' });
        await render.promise;
        abort.signal.throwIfAborted();
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Preview unavailable')), 'image/png'));
      } else {
        blob = await projectPreviewSource(sourceUrl, 'video', 1, abort.signal);
      }
      abort.signal.throwIfAborted();
      ownedUrl = URL.createObjectURL(blob);
      setPreview({ url: ownedUrl, size: originalSize });
    })().catch(() => { if (!abort.signal.aborted) setPreview({ error: 'Preview unavailable' }); });
    return () => { abort.abort(); render?.cancel(); if (ownedUrl) URL.revokeObjectURL(ownedUrl); };
  }, [shouldRender, pdf, page, item.previewUrl, item.family, attempt]);
  const label = item.family === 'document' ? `${item.displayTitle}, page ${page}` : item.displayTitle;
  const ratio = frame.aspectRatio ?? 4 / 3;
  return <div ref={host} className="cover-filmstrip-item">
    <div className="cover-filmstrip-slot">
      <button {...crop} type="button" disabled={disabled} aria-label={readOnly ? `Selected cover: ${label}` : previewOnly ? 'Edit project cover' : `${selected ? 'Cover: ' : 'Use as cover: '}${label}`} aria-pressed={previewOnly ? undefined : selected}
        aria-describedby={selected && !previewOnly ? 'cover-crop-help' : undefined} title={editable ? 'Drag to reposition · Scroll to zoom' : undefined} onClick={onSelect}
        className={`cover-filmstrip-thumbnail shape-compact relative block overflow-hidden border bg-[var(--surface-sunken)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 ${selected ? 'border-[var(--accent-color)] ring-2 ring-[var(--accent-color)]' : 'border-[var(--hairline-strong)] hover:border-[var(--text-tertiary)]'}`}
        style={{ '--thumbnail-ratio': ratio, aspectRatio: ratio, touchAction: previewOnly ? 'pan-y' : editable ? 'none' : 'pan-x', cursor: editable ? 'grab' : 'pointer' } as React.CSSProperties}>
        {source ? <img key={attempt} src={source} alt="" draggable={false} loading={selected ? 'eager' : 'lazy'} onLoad={(event) => { const image = event.currentTarget; setSize(preview.size ?? { width: image.naturalWidth, height: image.naturalHeight }); }} onError={() => { setSize(null); setPreview({ error: 'Preview unavailable' }); }}
          className={`pointer-events-none h-full w-full select-none ${selected ? 'object-cover' : 'object-contain'}`} style={selected ? imagePositionStyle(frame) : undefined} /> : <span className="flex h-full min-h-12 items-center justify-center text-[var(--text-tertiary)]"><FileIcon className="h-6 w-6" aria-hidden="true" /></span>}
        {selected && !previewOnly ? <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-[5px] bg-[var(--surface-media-control)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--media-control-text)]">Cover</span> : null}
        {editable ? <span aria-hidden="true" className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-[5px] bg-[var(--surface-media-control)] text-[var(--media-control-text)] opacity-80"><MoveIcon className="h-3.5 w-3.5" /></span> : null}
      </button>
    </div>
    {!compact || item.family === 'document' && !previewOnly ? <p className="truncate text-center text-[12px] text-[var(--text-secondary)]" title={label}>{item.family === 'document' ? `Page ${page}` : item.displayTitle}</p> : null}
    {preview.error ? <button type="button" disabled={disabled} onClick={() => setAttempt((value) => value + 1)} className="text-[12px] text-[var(--status-danger)] underline">Retry preview</button> : null}
  </div>;
}

function FileThumbnails({ item, media, render }: { item: PreparedMedia; media: MediaPreparation; render: (page: number, pdf?: PdfDocument) => React.ReactNode }) {
  const [pdf, setPdf] = useState<PdfDocument>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { setPageCount } = media;
  useEffect(() => {
    if (item.family !== 'document' || !item.previewUrl) return;
    let cancelled = false;
    const sourceUrl = item.previewUrl;
    let task: PdfLoadingTask | undefined;
    setPdf(undefined);
    setFailed(false);
    void (async () => {
      const pdfjs = await loadPdfJs();
      if (cancelled) return;
      task = pdfjs.getDocument(pdfSourceOptions(sourceUrl));
      const document = await task.promise;
      if (cancelled) return;
      setPageCount(item.id, document.numPages);
      setPdf(document);
    })().catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; void task?.destroy().catch(() => undefined); };
  }, [item.id, item.family, item.previewUrl, setPageCount, attempt]);
  return <div className="flex shrink-0 gap-2" role="group" aria-label={item.displayTitle}>
    {Array.from({ length: pdf?.numPages ?? item.metadata?.pageCount ?? 1 }, (_, index) => render(index + 1, pdf))}
    {failed ? <button type="button" className="max-w-36 self-center text-[12px] text-[var(--status-danger)] underline" onClick={() => setAttempt((value) => value + 1)}>Couldn’t load pages. Try again</button> : null}
  </div>;
}

/** One selected page and crop shared by profile cards and discovery. */
export function CoverFilmstrip({ media, disabled, compact = false, readOnly = false, naturalShape = false }: { media: MediaPreparation; disabled: boolean; compact?: boolean; readOnly?: boolean; naturalShape?: boolean }) {
  const [editing, setEditing] = useState(false);
  const collapsed = readOnly || (compact && !editing);
  const drafts = useRef(new Map<string, ProjectCoverFrame>());
  const [loaded, setLoaded] = useState<{ key: string; size: ImageSize } | null>(null);
  const cover = media.items.find((item) => item.isCover);
  const page = cover?.metadata?.coverPageNumber ?? 1;
  const key = `${cover?.id}:${page}`;
  const naturalRatio = naturalShape && cover?.metadata?.widthPixels && cover.metadata.heightPixels ? cover.metadata.widthPixels / cover.metadata.heightPixels : 4 / 3;
  const frame = { ...normalizeProjectCoverFrame(cover?.metadata?.coverFrame), aspectRatio: cover?.metadata?.coverFrame?.aspectRatio ?? naturalRatio };
  const size = loaded?.key === key ? loaded.size : null;
  const change = (next: ProjectCoverFrame) => {
    if (!cover || disabled || readOnly) return;
    drafts.current.set(key, next);
    media.setCoverFrame(cover.id, next, page);
  };
  const select = (item: PreparedMedia, nextPage: number) => {
    if (disabled || readOnly || (item.id === cover?.id && nextPage === page)) return;
    if (cover) drafts.current.set(key, frame);
    const saved = drafts.current.get(`${item.id}:${nextPage}`) ?? ((item.metadata?.coverPageNumber ?? 1) === nextPage ? item.metadata?.coverFrame : undefined);
    media.setCoverPage(item.id, nextPage, item.metadata?.pageCount, saved ?? { x: .5, y: .5, zoom: 1, aspectRatio: frame.aspectRatio });
  };
  const eligible = media.items.filter((item) => canBeCover(item.family, item.capability));
  if (!eligible.length) return null;
  const editable = Boolean(size && cover?.previewUrl && ['image', 'document', 'video'].includes(cover.family));
  return <section data-compact-cover={compact || undefined} data-cover-collapsed={collapsed || undefined} data-cover-readonly={readOnly || undefined} className="cover-filmstrip rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-inset)] p-2" aria-labelledby="publish-cover-label">
    <div className="flex items-center justify-between gap-3">
      <h3 id="publish-cover-label" className="text-[13px] font-semibold text-[var(--text-primary)]">Cover</h3>
      {compact && !readOnly ? <button type="button" aria-expanded={editing} disabled={disabled} onClick={() => setEditing((open) => !open)} className="shape-compact min-h-11 px-3 text-[14px] font-medium text-[var(--accent-text)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{editing ? 'Done' : 'Edit cover'}</button> : null}
    </div>
    <div className="cover-filmstrip-track scrollbar-slim" role="group" aria-label={readOnly ? 'Selected project cover' : 'Choose a project cover'}>
      {eligible.filter((item) => !collapsed || item.id === cover?.id).map((item) => <FileThumbnails key={item.id} item={item} media={media} render={(number, pdf) => {
        const selected = item.id === cover?.id && number === page;
        if (collapsed && !selected) return null;
        return <CoverThumbnail key={number} compact={compact} readOnly={readOnly} previewOnly={collapsed} item={item} page={number} pdf={pdf} selected={selected} disabled={disabled || readOnly} frame={selected ? frame : { x: .5, y: .5, zoom: 1, aspectRatio: 4 / 3 }} onSelect={() => readOnly ? undefined : collapsed ? setEditing(true) : select(item, number)} onChange={change}
          onReady={(dimensions) => {
            if (!selected) return;
            setLoaded({ key, size: dimensions });
            if (!cover?.metadata?.coverFrame?.crop) change({ ...frame, crop: cropFromPosition(dimensions, frame.aspectRatio, frame) });
          }} />;
      }} />)}
    </div>
    {!readOnly && <p id="cover-crop-help" className="sr-only">Drag or use arrow keys to reposition the selected cover. Scroll to zoom.</p>}
    {!collapsed && <div className="cover-panel-controls border-t border-[var(--hairline)] pt-2">
    <label className="flex min-w-0 flex-col gap-1 text-[12px] text-[var(--text-secondary)]">Cover shape
      <select aria-label="Cover shape" disabled={disabled || !editable} value={frame.aspectRatio} className="text-control h-8 w-full min-w-0 rounded-[8px] px-2 text-[13px]" onChange={(event) => { if (size) { const ratio = Number(event.target.value); change({ ...frame, aspectRatio: ratio, crop: cropFromPosition(size, ratio, frame) }); } }}>
        {[{ value: 1, label: 'Square · 1:1' }, { value: 4 / 3, label: 'Landscape · 4:3' }, { value: 16 / 9, label: 'Wide · 16:9' }, { value: 3 / 4, label: 'Portrait · 3:4' }, { value: frame.aspectRatio, label: 'Current shape' }].filter((item, index, all) => all.findIndex((other) => Math.abs(other.value - item.value) < .00001) === index).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
    <div className="flex min-w-0 flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
      <div className="flex items-center justify-between gap-2"><label htmlFor="cover-zoom">Zoom</label><output htmlFor="cover-zoom" className="tabular-nums">{Math.round(frame.zoom * 100)}%</output></div>
      <div className="flex min-w-0 items-center gap-1">
      <input id="cover-zoom" type="range" min="1" max="3" step=".01" value={frame.zoom} disabled={disabled || !editable} className="h-8 min-w-0 flex-1 accent-[var(--accent-color)]" onChange={(event) => { if (size) { const next = zoomImage(frame, size, frame.aspectRatio, Number(event.target.value)); change({ ...next, aspectRatio: frame.aspectRatio, crop: cropFromPosition(size, frame.aspectRatio, next) }); } }} />
      <button type="button" aria-label="Reset cover crop" title="Reset cover crop" disabled={disabled || !editable} className="shape-compact flex h-8 w-8 shrink-0 items-center justify-center hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40" onClick={() => { if (size) { const next = { x: .5, y: .5, zoom: 1, aspectRatio: frame.aspectRatio }; change({ ...next, crop: cropFromPosition(size, frame.aspectRatio, next) }); } }}><RotateCcwIcon className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>
    </div>}
  </section>;
}
