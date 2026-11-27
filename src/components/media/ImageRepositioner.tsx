import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MoveIcon, RotateCcwIcon } from 'lucide-react';
import type { ImageCropResult, ImagePosition, RelativeImageCrop } from '../../types/imageCrop';
import { CENTER_IMAGE_POSITION, cropFromPosition, normalizeImagePosition, panImage, positionFromCrop, renderImageCrop, zoomImage } from '../../utils/imageCrop';
import { pinchDistance } from '../../utils/pinchGesture';
import { Button } from '../ui/Button';
import { InterfaceIcon } from '../ui/InterfaceIcon';

export type ImageRepositionSave = {
  onSave: (result: ImageCropResult) => void | Promise<void>;
  onSavePosition?: never;
} | {
  onSave?: never;
  onSavePosition: (position: ImagePosition) => void | Promise<void>;
};

export type ImageRepositionerProps = ImageRepositionSave & {
  source: string | Blob;
  alt: string;
  /** Rectangles default to 16:9. Circle and square modes always use 1:1. */
  aspectRatio?: number;
  shape?: 'rectangle' | 'square' | 'circle';
  initialPosition?: ImagePosition;
  initialCrop?: RelativeImageCrop;
  startEditing?: boolean;
  pinchToZoom?: boolean;
  disabled?: boolean;
  outputWidth?: number;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** A circular preview normally exports a square image for reusable avatar masks. */
  exportCircle?: boolean;
  onCancel?: () => void;
  onEditingChange?: (editing: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  instructions?: string;
  saveLabel?: string;
};

type CropPointer = Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerType'>;

function getPinch(pointers: ReadonlyMap<number, CropPointer>) {
  if (pointers.size !== 2) return null;
  const [first, second] = Array.from(pointers.values());
  const distance = pinchDistance([first, second]);
  if (distance === null) return null;
  return { distance, x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 };
}

/** Local, transactional crop editor. Only Save exports or invokes the caller. */
export function ImageRepositioner({ source, alt, aspectRatio = 16 / 9, shape = 'rectangle', initialPosition, initialCrop, startEditing = false, pinchToZoom = false, disabled = false, outputWidth, mimeType, exportCircle = false, onSave, onSavePosition, onCancel, onEditingChange, onSavingChange, instructions = 'Drag to reposition. Scroll or use the slider to zoom. Arrow keys make small adjustments.', saveLabel = 'Save' }: ImageRepositionerProps) {
  const ratio = shape === 'rectangle' && Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [position, setPosition] = useState<ImagePosition>(CENTER_IMAGE_POSITION);
  const [editing, setEditing] = useState(startEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const savedRef = useRef<ImagePosition>(CENTER_IMAGE_POSITION);
  const positionRef = useRef(position);
  positionRef.current = position;
  const sourceVersion = useRef(0);
  const busyRef = useRef(false);
  const pointers = useRef(new Map<number, CropPointer>());
  const pinchStart = useRef<{ distance: number; x: number; y: number; position: ImagePosition } | null>(null);
  const resetGesture = useCallback(() => {
    pointers.current.clear();
    pinchStart.current = null;
  }, []);
  const initialRef = useRef({ initialCrop, initialPosition });
  initialRef.current = { initialCrop, initialPosition };
  const callbacks = useRef({ onSave, onSavePosition, onCancel, onEditingChange, onSavingChange });
  callbacks.current = { onSave, onSavePosition, onCancel, onEditingChange, onSavingChange };
  const sliderId = useId();
  const instructionsId = useId();

  useEffect(() => {
    const version = ++sourceVersion.current;
    let ownedUrl: string | null = null;
    let next: HTMLImageElement | null = null;
    setImage(null);
    setError(null);
    setSaving(false);
    callbacks.current.onSavingChange?.(false);
    busyRef.current = false;
    resetGesture();
    const initial = normalizeImagePosition(initialRef.current.initialCrop ? positionFromCrop(initialRef.current.initialCrop) : initialRef.current.initialPosition);
    savedRef.current = initial;
    setPosition(initial);
    setEditing(startEditing);
    try {
      const url = typeof source === 'string' ? source : (ownedUrl = URL.createObjectURL(source));
      next = new Image();
      if (!callbacks.current.onSavePosition) next.crossOrigin = 'anonymous';
      next.decoding = 'async';
      next.onload = () => {
        if (version !== sourceVersion.current || !next) return;
        if (!next.naturalWidth || !next.naturalHeight) { setError('This image has no readable dimensions.'); return; }
        setImage(next);
      };
      next.onerror = () => { if (version === sourceVersion.current) setError('This image couldn’t be loaded. Try again or choose another file.'); };
      next.src = url;
    } catch { setError('This image couldn’t be opened. Choose another file.'); }
    return () => {
      sourceVersion.current = version + 1;
      if (next) { next.onload = null; next.onerror = null; }
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [source, startEditing, loadAttempt, resetGesture]);

  // A new viewport shape changes crop geometry, not the source or the user's
  // current framing. End a gesture when its surface or geometry changes.
  useEffect(resetGesture, [ratio, pinchToZoom, editing, disabled, saving, resetGesture]);

  const update = (next: ImagePosition) => { positionRef.current = next; setPosition(next); };
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !image || !editing || disabled || saving) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = viewport.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      const current = positionRef.current;
      const next = zoomImage(current, { width: image.naturalWidth, height: image.naturalHeight }, ratio, current.zoom * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002), { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height });
      positionRef.current = next;
      setPosition(next);
    };
    // React's delegated wheel event is passive in some browsers.
    viewport.addEventListener('wheel', onWheel, { passive: false });
    const observer = new ResizeObserver(resetGesture);
    observer.observe(viewport);
    return () => { viewport.removeEventListener('wheel', onWheel); observer.disconnect(); };
  }, [image, editing, disabled, saving, ratio, resetGesture]);

  const changeEditing = (value: boolean) => {
    setEditing(value);
    callbacks.current.onEditingChange?.(value);
  };
  const cancel = () => {
    if (busyRef.current) return;
    resetGesture();
    update(savedRef.current);
    setError(null);
    changeEditing(false);
    callbacks.current.onCancel?.();
  };
  const save = async () => {
    if (!image || disabled || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    callbacks.current.onSavingChange?.(true);
    setError(null);
    const version = sourceVersion.current;
    const nextPosition = positionRef.current;
    const sourceSize = { width: image.naturalWidth, height: image.naturalHeight };
    const crop = cropFromPosition(sourceSize, ratio, nextPosition);
    try {
      if (callbacks.current.onSavePosition) {
        await callbacks.current.onSavePosition(nextPosition);
      } else {
        const result = await renderImageCrop(image, crop, { outputWidth, mimeType, circle: exportCircle });
        if (version !== sourceVersion.current) return;
        await callbacks.current.onSave?.({ ...result, crop, position: nextPosition, sourceSize, outputSize: { width: result.canvas.width, height: result.canvas.height } });
      }
      if (version !== sourceVersion.current) return;
      savedRef.current = nextPosition;
      changeEditing(false);
    } catch (caught) {
      if (version === sourceVersion.current) setError(caught instanceof Error ? caught.message : 'The image could not be saved. Try again.');
    } finally {
      if (version === sourceVersion.current) { busyRef.current = false; setSaving(false); callbacks.current.onSavingChange?.(false); }
    }
  };
  const crop = image ? cropFromPosition({ width: image.naturalWidth, height: image.naturalHeight }, ratio, position) : null;
  const canEdit = editing && Boolean(image) && !disabled && !saving;
  const radius = shape === 'circle' ? '50%' : shape === 'square' ? 'var(--shape-compact)' : '8px';
  const beginPinch = () => {
    const pinch = getPinch(pointers.current);
    pinchStart.current = pinch ? { ...pinch, position: positionRef.current } : null;
  };
  const startPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const touch = pinchToZoom && event.pointerType === 'touch';
    if (!canEdit || event.button !== 0 || (!event.isPrimary && !touch)) return;
    const first = pointers.current.values().next().value;
    if (first && (!touch || first.pointerType !== 'touch')) return;
    event.preventDefault();
    if (!first) event.currentTarget.focus({ preventScroll: pinchToZoom });
    pointers.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType });
    event.currentTarget.setPointerCapture(event.pointerId);
    beginPinch();
  };
  const movePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !canEdit || !image) return;
    pointers.current.set(event.pointerId, { ...previous, clientX: event.clientX, clientY: event.clientY });
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    if (pointers.current.size === 1) {
      update(panImage(positionRef.current, size, bounds, event.clientX - previous.clientX, event.clientY - previous.clientY));
      return;
    }
    const pinch = getPinch(pointers.current);
    if (!pinch) return;
    const start = pinchStart.current;
    if (!start) { beginPinch(); return; }
    const relative = ({ x, y }: { x: number; y: number }) => ({ x: (x - bounds.left) / bounds.width, y: (y - bounds.top) / bounds.height });
    update(zoomImage(start.position, size, ratio, start.position.zoom * pinch.distance / start.distance, relative(start), relative(pinch)));
  };
  const stopPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    beginPinch();
    if (event.type !== 'lostpointercapture' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return <div className="image-repositioner min-w-0" onKeyDown={(event) => {
    if (event.key === 'Escape' && editing) { event.preventDefault(); event.stopPropagation(); cancel(); }
  }}>
    <div className="image-reposition-stage relative isolate overflow-hidden rounded-[12px] bg-[var(--surface-sunken)]">
      <div ref={viewportRef} role={editing ? 'group' : undefined} aria-label={editing ? `Reposition ${alt}` : undefined} aria-describedby={editing ? instructionsId : undefined} tabIndex={canEdit ? 0 : undefined}
        style={{ '--crop-ratio': ratio, aspectRatio: ratio, borderRadius: radius, touchAction: canEdit ? 'none' : 'auto', cursor: canEdit ? 'grab' : 'default', overflow: editing ? 'visible' : 'hidden' } as React.CSSProperties}
        className="image-reposition-viewport relative mx-auto outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={stopPointer}
        onPointerCancel={stopPointer} onLostPointerCapture={stopPointer}
        onKeyDown={(event) => {
          if (!canEdit || !image) return;
          const step = event.shiftKey ? 24 : 4;
          const offset: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          const delta = offset[event.key];
          if (!delta) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          update(panImage(positionRef.current, { width: image.naturalWidth, height: image.naturalHeight }, bounds, ...delta));
        }}>
        {image && crop ? <img src={image.src} alt={alt} draggable={false} className="pointer-events-none absolute select-none" style={{ maxWidth: 'none', width: `${100 / crop.width}%`, height: `${100 / crop.height}%`, left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%` }} /> : <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-[14px] text-[var(--text-secondary)]" role="status">{error ? 'Preview unavailable' : 'Loading image…'}</span>}
        {editing && image ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 border border-white/70" style={{ borderRadius: radius, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.45)' }} /> : null}
      </div>
    </div>
    {editing ? <>
      <p id={instructionsId} className="text-[13px] leading-relaxed text-[var(--text-secondary)]">{instructions}</p>
      {typeof source !== 'string' && source.type === 'image/gif' ? <p className="text-[13px] text-[var(--text-secondary)]">Saving this crop creates a still image.</p> : null}
      <div className="flex items-center gap-3">
        <label htmlFor={sliderId} className="text-[14px] font-medium">Zoom</label>
        <input id={sliderId} type="range" min="1" max="3" step="0.01" value={position.zoom} disabled={!canEdit} aria-valuetext={`${Math.round(position.zoom * 100)} percent`} className="min-w-0 flex-1 accent-[var(--accent-primary)]" onChange={(event) => {
          if (image) update(zoomImage(positionRef.current, { width: image.naturalWidth, height: image.naturalHeight }, ratio, Number(event.currentTarget.value)));
        }} />
        <output htmlFor={sliderId} className="w-12 text-right text-[13px] tabular-nums text-[var(--text-secondary)]">{Math.round(position.zoom * 100)}%</output>
        <button type="button" aria-label="Reset image position and zoom" title="Reset" disabled={!canEdit} onClick={() => update(CENTER_IMAGE_POSITION)}
          data-ui-control={pinchToZoom ? 'icon' : undefined} data-control-size={pinchToZoom ? 'sm' : undefined}
          className={pinchToZoom ? undefined : 'shape-compact flex h-9 w-9 items-center justify-center hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40'}>
          <InterfaceIcon icon={RotateCcwIcon} />
        </button>
      </div>
    </> : null}
    {error ? <p role="alert" className="text-[13px] leading-relaxed text-[var(--status-danger)]">{error} {!image ? <button type="button" className="font-semibold underline" onClick={() => setLoadAttempt((n) => n + 1)}>Try again</button> : null}</p> : null}
    <div className="flex flex-wrap justify-end gap-2">
      {editing ? <><Button variant="ghost" size="sm" disabled={saving || disabled} onClick={cancel}>Cancel</Button><Button variant="primary" size="sm" disabled={!canEdit} onClick={() => void save()}>{saving ? 'Saving…' : saveLabel}</Button></> : <Button variant="secondary" size="sm" disabled={!image || disabled} onClick={() => changeEditing(true)}><InterfaceIcon icon={MoveIcon} />Reposition</Button>}
    </div>
  </div>;
}
