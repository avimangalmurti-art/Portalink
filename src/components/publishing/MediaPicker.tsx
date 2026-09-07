import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircleIcon, BoxIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CodeIcon, FileIcon, FileTextIcon, GripVerticalIcon, ImageIcon, InfoIcon, Loader2Icon, MoreHorizontalIcon, MusicIcon, PlusIcon, RulerIcon, TableIcon, VideoIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { formatFileSize } from '../../features/publishing/mediaRules';
import { canBeCover, processingLabel, supportedFormatGroups } from '../../features/publishing/assetTypes';
import type { MediaPreparation } from '../../features/publishing/useMediaPreparation';
import type { MediaUpload } from '../../features/publishing/useMediaUpload';
import type { AssetFamily, PreparedMedia, UploadItemState } from '../../types/publishing';
import { PdfPage } from '../media/PdfPage';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { imageDimensionsLabel, imageResolutionNotice } from '../../utils/imageMetadata';
import { ProjectCover } from '../media/ProjectCover';
import { ImageRepositionDialog } from '../media/ImageRepositionDialog';
import { normalizeProjectCoverFrame } from '../../utils/coverFrame';

/**
 * Project files — the universal asset list.
 *
 * A project is whatever the work is made of, so this never asks the creator to
 * pick a format first: files are dropped or chosen, Portalink identifies each
 * one, and the list becomes the order visitors will experience.
 *
 * Transport is reported, never invented. Progress, uploading, uploaded, failure,
 * and cancellation come from the `upload` prop, which relays what `MediaService`
 * actually emitted — so with the current unavailable implementation none of those
 * states can appear, and the list reads exactly as it did before. Each row still
 * states the real preview capability of its asset, and `processing` (server-side
 * conversion afterwards) stays a separate line from `uploading` (bytes moving).
 */
const FAMILY_ICONS: Record<AssetFamily, typeof FileIcon> = {
  image: ImageIcon,
  document: FileTextIcon,
  presentation: FileTextIcon,
  data: TableIcon,
  video: VideoIcon,
  audio: MusicIcon,
  model: BoxIcon,
  cad: RulerIcon,
  design: ImageIcon,
  code: CodeIcon,
  archive: FileIcon
};
function previewPageCountFor(item: PreparedMedia): number {
  return item.family === 'document' ? Math.max(1, item.metadata?.pageCount ?? 1) : 1;
}
type MediaPickerProps = {
  media: MediaPreparation;
  /**
   * The live transport, when there is one. Absent — or reporting `idle` — means
   * no bytes are moving, and no progress or uploaded state is shown. With the
   * current unavailable implementation this never leaves `idle`, so the picker
   * looks exactly as it did.
   */
  upload?: MediaUpload;
  disabled?: boolean;
};
export function MediaPicker({
  media,
  upload,
  disabled = false
}: MediaPickerProps) {
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showsFormats, setShowsFormats] = useState(false);
  const {
    items,
    error,
    state,
    capability,
    setCoverPage,
  } = media;
  const [repositionId, setRepositionId] = useState<string | null>(null);
  const repositionItem = items.find((item) => item.id === repositionId);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [previewPageNumber, setPreviewPageNumber] = useState(1);
  const previewItem = items.find((item) => item.id === previewItemId) ?? items[0] ?? null;
  const activePreviewItemId = previewItem?.id ?? null;
  const activePreviewFamily = previewItem?.family ?? null;
  const activePreviewStoredPageCount = previewItem?.metadata?.pageCount;
  const previewItemIndex = previewItem ? items.findIndex((item) => item.id === previewItem.id) : -1;
  const previewPageCount = previewItem ? previewPageCountFor(previewItem) : 1;
  const totalPreviewPages = items.reduce((total, item) => total + previewPageCountFor(item), 0);
  const absolutePreviewPage = previewItemIndex < 0
    ? 0
    : items.slice(0, previewItemIndex).reduce((total, item) => total + previewPageCountFor(item), 0) + previewPageNumber;
  const hasPreviousPreview = previewItemIndex > 0 || previewPageNumber > 1;
  const hasNextPreview = previewItemIndex >= 0
    && (previewPageNumber < previewPageCount || previewItemIndex < items.length - 1);

  useEffect(() => {
    if (items.length === 0) {
      setPreviewItemId(null);
      setPreviewPageNumber(1);
      return;
    }
    if (!previewItemId || !items.some((item) => item.id === previewItemId)) {
      setPreviewItemId(items[0].id);
      setPreviewPageNumber(1);
    }
  }, [items, previewItemId]);

  useEffect(() => {
    if (!activePreviewItemId) {
      return;
    }
    const safePage = Math.min(previewPageNumber, activePreviewStoredPageCount ?? 1);
    if (safePage !== previewPageNumber) {
      setPreviewPageNumber(safePage);
    }
    setCoverPage(activePreviewItemId, safePage, activePreviewStoredPageCount);
  }, [activePreviewItemId, activePreviewStoredPageCount, previewPageNumber, setCoverPage]);

  const showPreview = useCallback((itemIndex: number, pageNumber: number) => {
    const item = items[itemIndex];
    if (!item) {
      return;
    }
    const safePage = Math.max(1, Math.min(pageNumber, previewPageCountFor(item)));
    setPreviewItemId(item.id);
    setPreviewPageNumber(safePage);
    setCoverPage(item.id, safePage, item.metadata?.pageCount);
  }, [items, setCoverPage]);

  const showPreviousPreview = () => {
    if (!previewItem || !hasPreviousPreview) {
      return;
    }
    if (previewPageNumber > 1) {
      showPreview(previewItemIndex, previewPageNumber - 1);
      return;
    }
    const previousIndex = previewItemIndex - 1;
    showPreview(previousIndex, previewPageCountFor(items[previousIndex]));
  };

  const showNextPreview = () => {
    if (!previewItem || !hasNextPreview) {
      return;
    }
    if (previewPageNumber < previewPageCount) {
      showPreview(previewItemIndex, previewPageNumber + 1);
      return;
    }
    showPreview(previewItemIndex + 1, 1);
  };

  const handleDocumentPageCount = useCallback((pageCount: number) => {
    if (!activePreviewItemId || activePreviewFamily !== 'document') {
      return;
    }
    const safePage = Math.min(previewPageNumber, pageCount);
    if (safePage !== previewPageNumber) {
      setPreviewPageNumber(safePage);
    }
    setCoverPage(activePreviewItemId, safePage, pageCount);
  }, [activePreviewFamily, activePreviewItemId, previewPageNumber, setCoverPage]);
  // Editing the list is impossible while its bytes are being sent.
  const isTransferring = upload?.phase === 'uploading' || upload?.phase === 'cancelling';
  const isLocked = disabled || isTransferring || upload?.phase === 'uploaded';
  const percent = upload?.fraction === null || upload?.fraction === undefined ? null : Math.round(upload.fraction * 100);
  const requestReplace = (mediaId: string) => {
    replaceTargetRef.current = mediaId;
    replaceRef.current?.click();
  };
  return <section aria-labelledby="publish-files-label" className="flex flex-col gap-2">
      {repositionItem?.family === 'image' && repositionItem.previewUrl ? <ImageRepositionDialog key={repositionItem.id} title="Reposition project cover" source={repositionItem.file} alt={repositionItem.displayTitle} aspectRatio={16 / 9} initialPosition={normalizeProjectCoverFrame(repositionItem.metadata?.coverFrame)} outputWidth={1920} onClose={() => setRepositionId(null)} onSave={({ position, crop }) => {
        media.setCoverFrame(repositionItem.id, { ...position, crop, aspectRatio: 16 / 9 });
        setRepositionId(null);
      }} /> : null}
      <div className="flex items-center justify-between gap-3">
        <h3 id="publish-files-label" className="text-[13px] font-semibold text-[var(--text-primary)]">Project files</h3>
        {items.length > 0 && <Button variant="ghost" size="sm" disabled={isLocked || media.isFull} onClick={() => addRef.current?.click()}>
            <InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />
            Add
          </Button>}
      </div>

      {/* One hidden input for adding, one for replacing a specific row. */}
      <input ref={addRef} type="file" multiple className="sr-only" aria-labelledby="publish-files-label" disabled={disabled} onChange={(event) => {
      media.select(event.target.files);
      event.target.value = '';
    }} />
      <input ref={replaceRef} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={disabled} onChange={(event) => {
      media.select(event.target.files, replaceTargetRef.current ?? undefined);
      replaceTargetRef.current = null;
      event.target.value = '';
    }} />

      {items.length === 0 ? <div onDragOver={(event) => {
      event.preventDefault();
      setIsDragOver(true);
    }} onDragLeave={() => setIsDragOver(false)} onDrop={(event) => {
      event.preventDefault();
      setIsDragOver(false);
      if (!disabled) {
        media.select(event.dataTransfer.files);
      }
    }} className={`flex flex-col items-center gap-2 rounded-[12px] border px-4 py-7 text-center transition-colors duration-150 motion-reduce:transition-none ${isDragOver ? 'border-[var(--accent-color)] bg-[var(--surface-sunken)]' : 'border-[var(--hairline-strong)] bg-[var(--surface-inset)]'}`}>
          <Button id="publish-add-files" variant="secondary" size="sm" disabled={disabled} onClick={() => addRef.current?.click()}>
            <InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />
            Choose files
          </Button>
          <p className="text-[13px] text-[var(--text-secondary)]">or drop files here</p>
        </div> : <div className="flex flex-col gap-2">
          {previewItem?.family === 'image' && previewItem.previewUrl ? <div className="flex justify-end"><Button variant="secondary" size="sm" disabled={isLocked} onClick={() => setRepositionId(previewItem.id)}>Reposition cover</Button></div> : null}
          <div aria-label={`Cover preview of ${previewItem?.displayTitle ?? 'selected file'}, page ${absolutePreviewPage} of ${totalPreviewPages}`} style={{ aspectRatio: previewItem?.metadata?.coverFrame?.aspectRatio ?? 4 / 3 }} className="relative w-full overflow-hidden rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)]">
            <ProjectCover source={previewItem?.previewUrl} alt={`Cover preview of ${previewItem?.fileName ?? 'selected file'}`} kind={previewItem?.family === 'document' ? 'document' : previewItem?.family === 'video' ? 'video' : undefined} pageNumber={previewPageNumber} onDocumentPageCountChange={handleDocumentPageCount} fit={previewItem?.metadata?.coverFrame ? "cover" : "contain"} frame={previewItem?.metadata?.coverFrame} aspectRatio={previewItem?.metadata?.widthPixels && previewItem.metadata.heightPixels ? previewItem.metadata.widthPixels / previewItem.metadata.heightPixels : 4 / 3} sizes="440px" priority />
            <button type="button" aria-label="Previous cover page" disabled={isLocked || !hasPreviousPreview} onClick={showPreviousPreview} className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--surface-media-control)] text-[var(--media-control-text)] shadow-md transition-opacity duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-default disabled:opacity-30 motion-reduce:transition-none">
              <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next cover page" disabled={isLocked || !hasNextPreview} onClick={showNextPreview} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--surface-media-control)] text-[var(--media-control-text)] shadow-md transition-opacity duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-default disabled:opacity-30 motion-reduce:transition-none">
              <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="shape-compact pointer-events-none absolute bottom-2 left-2 bg-[var(--surface-media-control)] px-2 py-1 text-[10px] font-semibold text-[var(--media-control-text)] shadow-sm">Cover · {absolutePreviewPage} of {totalPreviewPages}</span>
          </div>
          <ul aria-label="Project files, in presentation order" className="scrollbar-slim m-0 flex max-h-[180px] list-none flex-col gap-1.5 overflow-y-auto p-0">
          {items.map((item, index) => <AssetRow key={item.id} asset={item} index={index} total={items.length} disabled={isLocked} transport={upload ? {
        phase: upload.phase,
        // Per-file progress only when the service attributes bytes to files.
        item: upload.itemProgress[item.id] ?? null
      } : null} onReorder={media.reorder} onSetCover={() => showPreview(index, item.metadata?.coverPageNumber ?? 1)} onReplace={() => requestReplace(item.id)} onRename={(title) => media.rename(item.id, title)} onRemove={() => media.remove(item.id)} />)}
          </ul>
        </div>}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <button type="button" onClick={() => setShowsFormats((open) => !open)} aria-expanded={showsFormats} className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] transition-colors duration-150 hover:text-[var(--text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none">
          File requirements
          <ChevronDownIcon className={`h-3 w-3 transition-transform duration-150 motion-reduce:transition-none ${showsFormats ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {items.length > 0 && <button type="button" disabled={isLocked} onClick={media.clear} className="text-[12px] text-[var(--text-tertiary)] transition-colors duration-150 hover:text-[var(--text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 motion-reduce:transition-none">
            Remove all
          </button>}
      </div>

      {showsFormats && <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-inset)] p-3">
        <p className="mb-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">File size follows your current storage allowance. Large files upload in resumable parts. For sharp full-screen covers, use images at least 1600 px on the longest edge. Original files and their embedded colour profiles are preserved.</p>
        <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[12px] leading-relaxed sm:grid-cols-2">
          {supportedFormatGroups.map((group) => <div key={group.title} className="min-w-0">
              <dt className="font-semibold text-[var(--text-secondary)]">{group.title}</dt>
              <dd className="m-0 text-[var(--text-tertiary)]">{group.formats}</dd>
            </div>)}
        </dl>
      </div>}

      {/* The honest state of the transport, never a fake upload. */}
      {state === 'upload-unavailable' && capability && !upload?.isBusy && <p role="status" className="flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          <InfoIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {capability.reason}
        </p>}

      {/* Real transport states. Every one of these is driven by a service event,
         so none of them can appear with an unavailable implementation. */}
      {(upload?.phase === 'uploading' || upload?.phase === 'cancelling') && <div className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-inset)] p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p role="status" aria-live="polite" className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-[var(--text-primary)]">
              <Loader2Icon className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span className="min-w-0">
                {upload.phase === 'cancelling' ? 'Cancelling the upload…' : percent === null ? 'Uploading your files…' : `Uploading your files — ${percent}%`}
              </span>
            </p>
            <Button variant="ghost" size="sm" disabled={upload.phase === 'cancelling'} onClick={() => void upload.cancel()}>
              {upload.phase === 'cancelling' ? 'Cancelling…' : 'Cancel upload'}
            </Button>
          </div>
          {/* The value is the service's, and the text alongside it carries the
           same information for anyone not seeing the bar. */}
          <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? 'Progress not reported yet' : `${percent}%`} className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{
          width: `${percent ?? 0}%`
        }} />
          </div>
        </div>}

      {upload?.phase === 'uploaded' && <p role="status" aria-live="polite" className="flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          <InterfaceIcon icon={CheckIcon} size="sm" weight="medium" className="mt-[1px]" />
          Your files are stored. Publishing will not upload them again.
        </p>}

      {upload?.phase === 'cancelled' && <p role="status" aria-live="polite" className="flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          <InfoIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Upload cancelled. Your details and files are exactly as you left them.
        </p>}

      {upload?.cleanupError && <div role="alert" className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--status-danger)]/40 bg-[var(--surface-inset)] p-2.5">
          <p className="flex items-start gap-1.5 text-[12px] font-medium leading-relaxed text-[var(--text-primary)]">
            <AlertCircleIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {upload.cleanupError}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" size="sm" disabled={upload.isCleaningUp} onClick={() => void upload.cleanupPersisted()}>
              {upload.isCleaningUp ? 'Removing…' : 'Try again'}
            </Button>
            <Button variant="ghost" size="sm" onClick={upload.dismissCleanupError}>Dismiss</Button>
          </div>
        </div>}
      {error && <p role="alert" className="flex items-start gap-1.5 text-[12px] font-medium leading-relaxed text-[var(--text-primary)]">
          <AlertCircleIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>}
    </section>;
}
/** How one file's transport state reads. Empty while nothing is being sent. */
function transportLabel(phase: MediaUpload['phase'] | undefined, item: {
  fraction: number;
  state: UploadItemState;
} | null): string {
  if (!phase || phase === 'idle') {
    return '';
  }
  if (item) {
    switch (item.state) {
      case 'uploading':
        return `Uploading ${Math.round(item.fraction * 100)}%`;
      case 'uploaded':
        return 'Stored';
      case 'failed':
        return 'Upload failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return phase === 'uploading' ? 'Waiting to upload' : '';
    }
  }
  // No per-file attribution from the transport: the row reports the operation's
  // state rather than inventing a figure of its own.
  switch (phase) {
    case 'uploading':
      return 'Uploading';
    case 'cancelling':
      return 'Cancelling';
    case 'uploaded':
      return 'Stored';
    case 'failed':
      return 'Upload failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return '';
  }
}
function AssetRow({
  asset,
  index,
  total,
  disabled,
  transport,
  onReorder,
  onSetCover,
  onReplace,
  onRename,
  onRemove

















}: {asset: PreparedMedia;index: number;total: number;disabled: boolean;transport: {phase: MediaUpload['phase'];item: {fraction: number;state: UploadItemState;} | null;} | null;onReorder: (fromIndex: number, toIndex: number) => void;onSetCover: () => void;onReplace: () => void;onRename: (title: string) => void;onRemove: () => void;}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const Icon = FAMILY_ICONS[asset.family] ?? FileIcon;
  const status = processingLabel(asset.processingState);
  const transportState = transportLabel(transport?.phase, transport?.item ?? null);
  const coverEligible = canBeCover(asset.family, asset.capability);
  const dimensions = asset.metadata?.widthPixels && asset.metadata.heightPixels ? {
    widthPixels: asset.metadata.widthPixels,
    heightPixels: asset.metadata.heightPixels
  } : null;
  const dimensionsLabel = imageDimensionsLabel(dimensions);
  const resolutionNotice = asset.family === 'image' ? imageResolutionNotice(dimensions, 'artwork', asset.mimeType === 'image/svg+xml') : null;
  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }
    const close = (event: MouseEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isMenuOpen]);
  return <li ref={rowRef} draggable={!disabled} onDragStart={(event) => {
    event.dataTransfer.setData('text/plain', String(index));
    event.dataTransfer.effectAllowed = 'move';
  }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(from) && from !== index) {
      onReorder(from, index);
    }
  }} className="relative flex items-center gap-2.5 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-inset)] p-2">
      {/* Reorder: drag, or arrow keys for anyone not using a pointer. */}
      <span aria-hidden="true" className={`shrink-0 text-[var(--text-tertiary)] ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}>
        <GripVerticalIcon className="h-4 w-4" />
      </span>
      <button type="button" disabled={disabled || index === 0} onClick={() => onReorder(index, index - 1)} aria-label={`Move ${asset.displayTitle} earlier`} className="sr-only focus:not-sr-only focus:relative focus:rounded-[6px] focus:px-1.5 focus:py-1 focus:text-[12px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Up</button>
      <button type="button" disabled={disabled || index === total - 1} onClick={() => onReorder(index, index + 1)} aria-label={`Move ${asset.displayTitle} later`} className="sr-only focus:not-sr-only focus:relative focus:rounded-[6px] focus:px-1.5 focus:py-1 focus:text-[12px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Down</button>

      {asset.previewUrl && asset.family === 'image' ? <ResponsiveImage src={asset.previewUrl} alt={`Local preview of ${asset.fileName}`} width={40} height={40} sizes="40px" className="h-10 w-10 shrink-0 rounded-[7px] object-cover" /> : asset.previewUrl && asset.family === 'document' ? <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[7px]"><PdfPage source={asset.previewUrl} label={`Local preview of ${asset.fileName}`} /></span> : <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
          <Icon className="h-4 w-4" />
        </span>}

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-[var(--text-primary)]" title={asset.displayTitle}>{asset.displayTitle}</span>
          {asset.isCover && <span className="shrink-0 rounded-[5px] bg-[var(--surface-sunken)] px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-secondary)]">Cover</span>}
        </p>
        <p className="truncate text-[12px] text-[var(--text-secondary)]">
          {asset.typeLabel} · {formatFileSize(asset.sizeBytes)}
          {dimensionsLabel ? ` · ${dimensionsLabel}` : ''}
          {status ? ` · ${status}` : ''}
          {/* Transport, kept distinct from processing: this is about bytes
             moving, not about server-side conversion afterwards. */}
          {transportState ? ` · ${transportState}` : ''}
        </p>
        {resolutionNotice && <p role="status" className="mt-0.5 text-[11px] leading-snug text-[var(--text-secondary)]">{resolutionNotice}</p>}
        {/* A per-file bar only when the service attributes bytes to this file. */}
        {transport?.item?.state === 'uploading' && <span role="progressbar" aria-label={`Upload progress for ${asset.displayTitle}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(transport.item.fraction * 100)} className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <span className="block h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{
          width: `${Math.round(transport.item.fraction * 100)}%`
        }} />
          </span>}
      </div>

      <div className="shrink-0">
        <button type="button" disabled={disabled} onClick={() => setIsMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={isMenuOpen} aria-label={`Options for ${asset.displayTitle}`} className="flex h-8 w-8 items-center justify-center rounded-[7px] text-[var(--text-tertiary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 motion-reduce:transition-none">
          <InterfaceIcon icon={MoreHorizontalIcon} weight="medium" />
        </button>
        {isMenuOpen && <div role="menu" className="absolute right-2 top-[calc(100%-6px)] z-20 w-[184px] overflow-hidden rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] py-1 shadow-[0_12px_28px_rgba(15,23,42,0.2)]">
            {/* Only actions that make sense for this asset. */}
            {coverEligible && !asset.isCover && <MenuAction label="Set as cover" onSelect={() => {
          onSetCover();
          setIsMenuOpen(false);
        }} />}
            <MenuAction label="Rename" onSelect={() => {
          setIsMenuOpen(false);
          const next = window.prompt('Display title', asset.displayTitle);
          if (next !== null) {
            onRename(next);
          }
        }} />
            <MenuAction label="Replace" onSelect={() => {
          setIsMenuOpen(false);
          onReplace();
        }} />
            <MenuAction label="Remove" onSelect={() => {
          setIsMenuOpen(false);
          onRemove();
        }} />
          </div>}
      </div>
    </li>;
}
function MenuAction({
  label,
  onSelect



}: {label: string;onSelect: () => void;}) {
  return <button type="button" role="menuitem" onClick={onSelect} className="flex w-full items-center px-3 py-2 text-left text-[13px] text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none">
      {label}
    </button>;
}
