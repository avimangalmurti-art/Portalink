import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircleIcon, BoxIcon, CheckIcon, CodeIcon, FileIcon, FileTextIcon, GripVerticalIcon, ImageIcon, InfoIcon, Loader2Icon, MoreHorizontalIcon, MusicIcon, PlusIcon, RulerIcon, TableIcon, VideoIcon, XIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { formatFileSize } from '../../features/publishing/mediaRules';
import { canBeCover, processingLabel, supportedFormatGroups } from '../../features/publishing/assetTypes';
import type { MediaPreparation } from '../../features/publishing/useMediaPreparation';
import type { MediaUpload } from '../../features/publishing/useMediaUpload';
import type { AssetFamily, PreparedMedia, UploadItemState } from '../../types/publishing';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { imageDimensionsLabel, imageResolutionNotice } from '../../utils/imageMetadata';
import { ProjectFilesMenu } from './ProjectFilesMenu';
import { ModalPortal } from '../ui/ModalPortal';
import { useModalFocus } from '../../hooks/useModalFocus';
import { positionAnchoredMenu } from '../../utils/anchoredMenu';

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
  const fileOptionsRef = useRef<HTMLButtonElement>(null);
  const requirementsRef = useRef<HTMLDivElement>(null);
  const removeConfirmationRef = useRef<HTMLDivElement>(null);
  const {
    items,
    error,
    state,
    capability,
  } = media;
  const [isRemovingAll, setIsRemovingAll] = useState(false);
  useEffect(() => {
    if (!showsFormats) return;
    const frame = requestAnimationFrame(() => requirementsRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [showsFormats]);
  useEffect(() => {
    if (!isRemovingAll) return;
    const frame = requestAnimationFrame(() => removeConfirmationRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isRemovingAll]);
  // Editing the list is impossible while its bytes are being sent.
  const isTransferring = upload?.phase === 'uploading' || upload?.phase === 'cancelling';
  const isLocked = disabled || isTransferring || upload?.phase === 'uploaded';
  const percent = upload?.fraction === null || upload?.fraction === undefined ? null : Math.round(upload.fraction * 100);
  const requestReplace = (mediaId: string) => {
    replaceTargetRef.current = mediaId;
    replaceRef.current?.click();
  };
  return <section aria-labelledby="publish-files-label" className={`project-form-media ${items.length > 0 ? 'project-form-media--populated' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id="publish-files-label" className="text-[13px] font-semibold text-[var(--text-primary)]">Project files</h3>
        <div className="flex items-center gap-1">
          {items.length > 0 && <Button variant="secondary" size="sm" disabled={isLocked || media.isFull} onClick={() => addRef.current?.click()}><InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />Add</Button>}
          <ProjectFilesMenu triggerRef={fileOptionsRef} hasFiles={items.length > 0} locked={isLocked} showsRequirements={showsFormats} onRequirements={() => setShowsFormats((open) => !open)} onRemoveAll={() => setIsRemovingAll(true)} />
        </div>
      </div>
      {isRemovingAll && <div ref={removeConfirmationRef} tabIndex={-1} role="group" aria-label="Confirm removing all files" className="rounded-[10px] border border-[var(--hairline-strong)] p-2.5 outline-none">
        <p className="text-[13px] text-[var(--text-primary)]">Remove all files from this draft?</p>
        <div className="mt-2 flex justify-end gap-2"><Button size="sm" disabled={isLocked} onClick={() => { setIsRemovingAll(false); fileOptionsRef.current?.focus(); }}>Keep files</Button><Button size="sm" variant="danger" disabled={isLocked} onClick={() => { media.clear(); setIsRemovingAll(false); fileOptionsRef.current?.focus(); }}>Remove all</Button></div>
      </div>}

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
    }} className={`project-media-dropzone flex flex-col items-center justify-center gap-2 rounded-[12px] border px-4 py-3 text-center transition-colors duration-150 motion-reduce:transition-none ${isDragOver ? 'border-[var(--accent-color)] bg-[var(--surface-sunken)]' : 'border-[var(--hairline-strong)] bg-[var(--surface-inset)]'}`}>
          <Button id="publish-add-files" variant="secondary" size="sm" disabled={disabled} onClick={() => addRef.current?.click()}>
            <InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />
            Choose files
          </Button>
          <p className="text-[13px] text-[var(--text-secondary)]">or drop files here</p>
        </div> : <div className="project-media-selection">
          <ul aria-label="Project files, in presentation order" className="project-media-list scrollbar-slim m-0 flex list-none flex-col gap-1.5 p-0">
          {items.map((item, index) => <AssetRow key={item.id} asset={item} index={index} total={items.length} disabled={isLocked} transport={upload ? {
        phase: upload.phase,
        // Per-file progress only when the service attributes bytes to files.
        item: upload.itemProgress[item.id] ?? null
      } : null} onReorder={media.reorder} onSetCover={() => media.setCoverPage(item.id, item.metadata?.coverPageNumber ?? 1, item.metadata?.pageCount)} onReplace={() => requestReplace(item.id)} onRename={(title) => media.rename(item.id, title)} onRemove={() => media.remove(item.id)} />)}
          </ul>
        </div>}

      {showsFormats && <div ref={requirementsRef} tabIndex={-1} role="group" aria-label="File requirements" className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-inset)] p-3 outline-none">
        <div className="mb-2 flex items-center justify-between gap-2"><p className="text-[12px] font-semibold text-[var(--text-secondary)]">File requirements</p><button type="button" aria-label="Close file requirements" onClick={() => { setShowsFormats(false); fileOptionsRef.current?.focus(); }} className="shape-compact flex h-6 w-6 items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><XIcon className="h-3.5 w-3.5" aria-hidden="true" /></button></div>
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
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<ReturnType<typeof positionAnchoredMenu> | null>(null);
  useModalFocus(isMenuOpen, menuRef, () => setIsMenuOpen(false));
  useLayoutEffect(() => {
    if (!isMenuOpen) return;
    const position = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const viewport = window.visualViewport;
      const offsetTop = viewport?.offsetTop ?? 0;
      const anchor = trigger.getBoundingClientRect();
      const next = positionAnchoredMenu({ right: anchor.right, top: anchor.top - offsetTop, bottom: anchor.bottom - offsetTop }, menu.offsetWidth, menu.scrollHeight, viewport?.width ?? window.innerWidth, viewport?.height ?? window.innerHeight);
      setMenuPosition({ ...next, top: next.top + offsetTop });
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [isMenuOpen]);
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
      if (!rowRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) {
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

      {asset.previewUrl && asset.family === 'image' ? <ResponsiveImage src={asset.previewUrl} alt={`Local preview of ${asset.fileName}`} width={40} height={40} sizes="40px" className="h-10 w-10 shrink-0 rounded-[7px] object-cover" /> : <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
          <Icon className="h-4 w-4" />
        </span>}

      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-[var(--text-primary)]" title={asset.displayTitle}>{asset.displayTitle}</span>
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
        <button ref={triggerRef} type="button" disabled={disabled} onClick={() => setIsMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={isMenuOpen} aria-label={`Options for ${asset.displayTitle}`} className="flex h-8 w-8 items-center justify-center rounded-[7px] text-[var(--text-tertiary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 motion-reduce:transition-none">
          <InterfaceIcon icon={MoreHorizontalIcon} weight="medium" />
        </button>
        {isMenuOpen && <ModalPortal><div ref={menuRef} tabIndex={-1} role="menu" aria-label={`Options for ${asset.displayTitle}`} style={menuPosition ?? { visibility: 'hidden' }} className="fixed z-[100] w-[184px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] py-1 shadow-[0_12px_28px_rgba(15,23,42,0.2)] outline-none">
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
          </div></ModalPortal>}
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
