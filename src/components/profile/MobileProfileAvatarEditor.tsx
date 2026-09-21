import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircleIcon, ImageIcon, MoveIcon, UploadIcon } from 'lucide-react';
import type { ImagePosition } from '../../types/imageCrop';
import type { PreparedAvatar } from '../../types/profile';
import { CENTER_IMAGE_POSITION, MAX_IMAGE_ZOOM, MIN_IMAGE_ZOOM, cropFromPosition, positionFromCrop, renderImageCrop, zoomImage } from '../../utils/imageCrop';
import { ImageRepositionDialog } from '../media/ImageRepositionDialog';
import { ResponsiveImage } from '../ui/ResponsiveImage';

export type MobileProfileAvatarEditorProps = {
  pending: PreparedAvatar | null;
  error: string | null;
  currentUrl?: string;
  currentInitials?: string;
  disabled?: boolean;
  storageNotice?: string | null;
  onSelect: (file: File | null, crop?: Pick<PreparedAvatar, 'originalSource' | 'crop'>) => void | Promise<void>;
  onClear: () => void;
  /** Keep the outer Save action disabled until the pending crop is ready. */
  onBusyChange: (busy: boolean) => void;
  children?: ReactNode;
};

/** Mobile framing controls edit only the parent's unsaved avatar selection. */
export function MobileProfileAvatarEditor({ pending, error, currentUrl, currentInitials, disabled = false, storageNotice, onSelect, onClear, onBusyChange, children }: MobileProfileAvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sliderId = useId();
  const source = pending?.originalSource ?? pending?.file ?? currentUrl;
  const selectedUrl = pending?.previewUrl ?? currentUrl;
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [position, setPosition] = useState<ImagePosition>(() => pending?.crop ? positionFromCrop(pending.crop) : CENTER_IMAGE_POSITION);
  const [exporting, setExporting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [repositioning, setRepositioning] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const positionRef = useRef(position);
  const savedPositionRef = useRef(position);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const initialCropRef = useRef(pending?.crop);
  initialCropRef.current = pending?.crop;
  const callbacks = useRef({ onSelect, onBusyChange });
  callbacks.current = { onSelect, onBusyChange };
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const zoomJobRef = useRef<number | null>(null);
  const replacementRef = useRef(false);
  const repositioningRef = useRef(false);
  const selectionCountRef = useRef(0);

  const reportBusy = useCallback(() => {
    if (!mountedRef.current) return;
    const preparing = zoomJobRef.current !== null || replacementRef.current || selectionCountRef.current > 0;
    const busy = preparing || repositioningRef.current;
    setExporting(preparing);
    if (busyRef.current !== busy) {
      busyRef.current = busy;
      callbacks.current.onBusyChange(busy);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      revision.current += 1;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      zoomJobRef.current = null;
      callbacks.current.onBusyChange(false);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let ownedUrl: string | null = null;
    let next: HTMLImageElement | null = null;
    revision.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    zoomJobRef.current = null;
    repositioningRef.current = false;
    setRepositioning(false);
    reportBusy();
    setImage(null);
    setEditError(null);
    const initial = initialCropRef.current ? positionFromCrop(initialCropRef.current) : CENTER_IMAGE_POSITION;
    positionRef.current = initial;
    savedPositionRef.current = initial;
    setPosition(initial);
    if (source) {
      try {
        const url = typeof source === 'string' ? source : (ownedUrl = URL.createObjectURL(source));
        next = new Image();
        next.crossOrigin = 'anonymous';
        next.decoding = 'async';
        next.onload = () => {
          if (!active || !next) return;
          if (!next.naturalWidth || !next.naturalHeight) {
            setEditError('This image has no readable dimensions. Choose another image.');
            return;
          }
          setImage(next);
        };
        next.onerror = () => {
          if (active) setEditError('This image could not be prepared for editing. Choose another image.');
        };
        next.src = url;
      } catch {
        setEditError('This image could not be opened. Choose another image.');
      }
    }
    return () => {
      active = false;
      revision.current += 1;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (next) { next.onload = null; next.onerror = null; }
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [source, reportBusy]);

  useEffect(() => {
    const saved = pending?.crop ? positionFromCrop(pending.crop) : CENTER_IMAGE_POSITION;
    savedPositionRef.current = saved;
    if (zoomJobRef.current === null) {
      positionRef.current = saved;
      setPosition(saved);
    }
  }, [pending?.crop]);

  const selectPending = async (file: File, framing?: Pick<PreparedAvatar, 'originalSource' | 'crop'>) => {
    selectionCountRef.current += 1;
    reportBusy();
    try {
      await callbacks.current.onSelect(file, framing);
    } finally {
      selectionCountRef.current -= 1;
      reportBusy();
    }
  };

  const replaceImage = async (file: File | null) => {
    if (!file || disabled || busyRef.current) return;
    replacementRef.current = true;
    setReplacing(true);
    setEditError(null);
    reportBusy();
    try {
      await selectPending(file);
    } catch (caught) {
      if (mountedRef.current) setEditError(caught instanceof Error ? caught.message : 'The picture could not be selected. Try again.');
    } finally {
      replacementRef.current = false;
      if (mountedRef.current) setReplacing(false);
      reportBusy();
    }
  };

  const changeZoom = (zoom: number) => {
    if (!image || !source || disabled || repositioningRef.current || replacementRef.current) return;
    const next = zoomImage(positionRef.current, { width: image.naturalWidth, height: image.naturalHeight }, 1, zoom);
    positionRef.current = next;
    setPosition(next);
    setEditError(null);
    const version = ++revision.current;
    zoomJobRef.current = version;
    const isCurrent = () => mountedRef.current && version === revision.current && sourceRef.current === source;
    if (timer.current) clearTimeout(timer.current);
    reportBusy();
    timer.current = setTimeout(() => {
      timer.current = null;
      const crop = cropFromPosition({ width: image.naturalWidth, height: image.naturalHeight }, 1, next);
      void renderImageCrop(image, crop, { outputWidth: 512, mimeType: 'image/webp' }).then(async ({ blob }) => {
        if (!isCurrent()) return;
        const file = croppedAvatarFile(blob);
        await selectPending(file, { originalSource: source, crop });
        if (isCurrent()) savedPositionRef.current = next;
      }).catch((caught: unknown) => {
        if (!isCurrent()) return;
        positionRef.current = savedPositionRef.current;
        setPosition(savedPositionRef.current);
        setEditError(caught instanceof Error ? caught.message : 'The picture could not be adjusted. Try again.');
      }).finally(() => {
        if (zoomJobRef.current === version) zoomJobRef.current = null;
        reportBusy();
      });
    }, 120);
  };

  const crop = image ? cropFromPosition({ width: image.naturalWidth, height: image.naturalHeight }, 1, position) : null;
  const locked = disabled || exporting || repositioning;
  const message = error ?? editError;

  return <div className="mobile-profile-avatar">
    <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-label="Choose profile image" disabled={locked} onChange={(event) => {
      const file = event.currentTarget.files?.[0] ?? null;
      event.currentTarget.value = '';
      void replaceImage(file);
    }} />
    <button type="button" className="mobile-profile-avatar-preview" disabled={locked} aria-label={selectedUrl ? 'Replace profile image' : 'Choose profile image'} onClick={() => inputRef.current?.click()}>
      {image && crop ? <img src={image.src} alt="Profile picture preview" draggable={false} className="mobile-profile-avatar-image" style={{ position: 'absolute', maxWidth: 'none', width: `${100 / crop.width}%`, height: `${100 / crop.height}%`, left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%` }} /> : selectedUrl ? <ResponsiveImage src={selectedUrl} alt="Profile picture preview" width={160} height={160} sizes="160px" priority className="h-full w-full object-cover" /> : <span className="mobile-profile-avatar-placeholder" aria-hidden="true">{currentInitials || <ImageIcon size={40} />}</span>}
    </button>
    <div className="mobile-profile-avatar-controls">
      <button type="button" className="mobile-profile-avatar-action" disabled={locked} onClick={() => inputRef.current?.click()}><UploadIcon size={16} aria-hidden="true" /><span>{selectedUrl ? 'Replace' : 'Choose image'}</span></button>
      <button type="button" className="mobile-profile-avatar-action" disabled={locked || !image} onClick={() => {
        if (busyRef.current || disabled) return;
        repositioningRef.current = true;
        setRepositioning(true);
        reportBusy();
      }}><MoveIcon size={16} aria-hidden="true" /><span>Reposition</span></button>
      <div className="mobile-profile-avatar-zoom">
        <label htmlFor={sliderId}>Zoom</label>
        <input id={sliderId} type="range" min={MIN_IMAGE_ZOOM} max={MAX_IMAGE_ZOOM} step="0.01" value={position.zoom} aria-valuetext={`${Math.round(position.zoom * 100)} percent`} disabled={disabled || replacing || repositioning || !image} onChange={(event) => changeZoom(Number(event.currentTarget.value))} />
      </div>
      {children ? <div className="mobile-profile-avatar-visibility">{children}</div> : null}
    </div>
    {pending || message ? <div className="mobile-profile-avatar-status">
      {pending ? <button type="button" className="mobile-profile-avatar-reset" disabled={locked} onClick={onClear}>Undo photo changes</button> : null}
      {pending && storageNotice ? <p>{storageNotice}</p> : null}
      {pending?.originalSource instanceof File && pending.originalSource.type === 'image/gif' ? <p>Saving this crop creates a still image.</p> : null}
      {message ? <p role="alert"><AlertCircleIcon size={14} aria-hidden="true" />{message}</p> : null}
    </div> : null}
    {repositioning && source ? <ImageRepositionDialog title="Reposition profile picture" source={source} alt="Profile picture" shape="square" initialCrop={pending?.crop} outputWidth={512} mimeType="image/webp" onClose={() => {
      if (selectionCountRef.current > 0) return;
      repositioningRef.current = false;
      setRepositioning(false);
      reportBusy();
    }} onSave={async ({ blob, crop: nextCrop }) => {
      if (!mountedRef.current || sourceRef.current !== source || !repositioningRef.current) return;
      await selectPending(croppedAvatarFile(blob), { originalSource: source, crop: nextCrop });
      if (!mountedRef.current || sourceRef.current !== source) return;
      const saved = positionFromCrop(nextCrop);
      savedPositionRef.current = saved;
      positionRef.current = saved;
      setPosition(saved);
      repositioningRef.current = false;
      setRepositioning(false);
      reportBusy();
    }} /> : null}
  </div>;
}

function croppedAvatarFile(blob: Blob) {
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
  return new File([blob], `profile-picture.${extension}`, { type: blob.type });
}
