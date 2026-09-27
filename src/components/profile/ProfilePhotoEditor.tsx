import { useEffect, useId, useRef, useState } from 'react';
import { RotateCcwIcon } from 'lucide-react';
import type { ImagePosition, RelativeImageCrop } from '../../types/imageCrop';
import { CENTER_IMAGE_POSITION, MAX_IMAGE_ZOOM, MIN_IMAGE_ZOOM, cropFromPosition, panImage, positionFromCrop, renderImageCrop, zoomImage } from '../../utils/imageCrop';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ModalPortal } from '../ui/ModalPortal';
import './profilePhotoEditor.css';

type Point = { x: number; y: number };
export type ProfilePhotoEditorProps = {
  source: string | Blob;
  initialCrop?: RelativeImageCrop;
  onCancel: () => void;
  onSave: (result: { blob: Blob; crop: RelativeImageCrop }) => void | Promise<void>;
};

/** A single full-screen, local photo transaction. Only Save changes the profile draft. */
export function ProfilePhotoEditor({ source, initialCrop, onCancel, onSave }: ProfilePhotoEditorProps) {
  const screenRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ position: ImagePosition; midpoint: Point; distance: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [position, setPosition] = useState<ImagePosition>(() => initialCrop ? positionFromCrop(initialCrop) : CENTER_IMAGE_POSITION);
  const positionRef = useRef(position);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busyRef = useRef(false);
  const revision = useRef(0);
  const initialRef = useRef(initialCrop);
  initialRef.current = initialCrop;
  const callbacks = useRef({ onCancel, onSave });
  callbacks.current = { onCancel, onSave };
  const headingId = useId();
  const instructionsId = useId();
  const zoomId = useId();
  const cancel = () => { if (!busyRef.current) callbacks.current.onCancel(); };
  // This is an opaque full-screen editing task, not a floating card. Contain its
  // keyboard focus while the unsaved Edit Profile page stays mounted underneath.
  useModalFocus(true, screenRef, cancel, true);

  const update = (next: ImagePosition) => { positionRef.current = next; setPosition(next); };
  useEffect(() => {
    const version = ++revision.current;
    const activePointers = pointers.current;
    let ownedUrl: string | null = null;
    const next = new Image();
    setImage(null);
    setError(null);
    setSaving(false);
    busyRef.current = false;
    pointers.current.clear();
    pinch.current = null;
    const initial = initialRef.current ? positionFromCrop(initialRef.current) : CENTER_IMAGE_POSITION;
    positionRef.current = initial;
    setPosition(initial);
    next.crossOrigin = 'anonymous';
    next.decoding = 'async';
    next.onload = () => {
      if (version !== revision.current) return;
      if (next.naturalWidth && next.naturalHeight) setImage(next);
      else setError('This image has no readable dimensions. Choose another image.');
    };
    next.onerror = () => { if (version === revision.current) setError('This image could not be loaded. Try again or choose another image.'); };
    try { next.src = typeof source === 'string' ? source : (ownedUrl = URL.createObjectURL(source)); }
    catch { setError('This image could not be opened. Choose another image.'); }
    return () => {
      revision.current += 1;
      activePointers.clear();
      next.onload = null;
      next.onerror = null;
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [source, attempt]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !image || saving) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = frame.getBoundingClientRect();
      if (!bounds.width || !bounds.height || busyRef.current) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      update(zoomImage(positionRef.current, { width: image.naturalWidth, height: image.naturalHeight }, 1,
        positionRef.current.zoom * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002),
        { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }));
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    const observer = new ResizeObserver(() => { pointers.current.clear(); pinch.current = null; });
    observer.observe(frame);
    return () => { frame.removeEventListener('wheel', onWheel); observer.disconnect(); };
  }, [image, saving]);

  const rebasePinch = () => {
    const points = [...pointers.current.values()];
    pinch.current = points.length === 2 ? {
      position: positionRef.current,
      midpoint: midpoint(points[0], points[1]),
      distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
    } : null;
  };
  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    rebasePinch();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const save = async () => {
    if (!image || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    setError(null);
    pointers.current.clear();
    pinch.current = null;
    const version = revision.current;
    const crop = cropFromPosition({ width: image.naturalWidth, height: image.naturalHeight }, 1, positionRef.current);
    try {
      const { blob } = await renderImageCrop(image, crop, { outputWidth: 512, mimeType: 'image/webp' });
      if (version !== revision.current) return;
      await callbacks.current.onSave({ blob, crop });
    } catch (caught) {
      if (version === revision.current) setError(caught instanceof Error ? caught.message : 'This photo could not be saved. Try again.');
    } finally {
      if (version === revision.current) { busyRef.current = false; setSaving(false); }
    }
  };
  const crop = image ? cropFromPosition({ width: image.naturalWidth, height: image.naturalHeight }, 1, position) : null;
  const canEdit = Boolean(image) && !saving;

  return <ModalPortal><section ref={screenRef} className="profile-photo-editor" data-material="content" role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1}>
    <header className="profile-photo-editor-header">
      <button type="button" onClick={cancel} disabled={saving}>Cancel</button>
      <h1 id={headingId}>Edit profile photo</h1>
      <button type="button" onClick={() => void save()} disabled={!canEdit}>{saving ? 'Saving…' : 'Save'}</button>
    </header>
    <div className="profile-photo-editor-body">
      <div ref={frameRef} className="profile-photo-frame" role="group" aria-label="Profile photo crop" aria-describedby={instructionsId} tabIndex={canEdit ? 0 : -1}
        onPointerDown={(event) => {
          if (!canEdit || busyRef.current || event.button !== 0 || pointers.current.size >= 2) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          rebasePinch();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!image || !canEdit || busyRef.current || !pointers.current.has(event.pointerId)) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (!bounds.width || !bounds.height) return;
          const previous = [...pointers.current.values()];
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const next = [...pointers.current.values()];
          const size = { width: image.naturalWidth, height: image.naturalHeight };
          const baseline = pinch.current;
          if (next.length === 2 && baseline) {
            const to = midpoint(next[0], next[1]);
            // Always derive the entire gesture from its starting transform. An
            // incremental, already-clamped zoom drifts during two-finger pans
            // at the minimum/maximum when the pointers report one at a time.
            const framed = baseline.distance > 0 ? zoomImage(baseline.position, size, 1,
              baseline.position.zoom * Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y) / baseline.distance,
              { x: (baseline.midpoint.x - bounds.left) / bounds.width, y: (baseline.midpoint.y - bounds.top) / bounds.height }) : baseline.position;
            update(panImage(framed, size, bounds, to.x - baseline.midpoint.x, to.y - baseline.midpoint.y));
          } else update(panImage(positionRef.current, size, bounds, next[0].x - previous[0].x, next[0].y - previous[0].y));
        }} onPointerUp={finishPointer} onPointerCancel={finishPointer} onLostPointerCapture={(event) => { pointers.current.delete(event.pointerId); rebasePinch(); }}
        onKeyDown={(event) => {
          if (!image || !canEdit || busyRef.current) return;
          const step = event.shiftKey ? 24 : 4;
          const offset: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          const delta = offset[event.key];
          if (!delta) return;
          event.preventDefault();
          update(panImage(positionRef.current, { width: image.naturalWidth, height: image.naturalHeight }, event.currentTarget.getBoundingClientRect(), ...delta));
        }}>
        {image && crop ? <img src={image.src} alt="Profile photo crop preview" draggable={false} style={{ maxWidth: 'none', width: `${100 / crop.width}%`, height: `${100 / crop.height}%`, left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%` }} /> : <span role="status">{error ? 'Preview unavailable' : 'Loading image…'}</span>}
      </div>
      <p id={instructionsId}>Drag to move the photo. Pinch or use the slider to zoom. Arrow keys make small adjustments.</p>
      <div className="profile-photo-zoom">
        <label htmlFor={zoomId}>Zoom</label>
        <input id={zoomId} type="range" min={MIN_IMAGE_ZOOM} max={MAX_IMAGE_ZOOM} step="0.01" value={position.zoom} disabled={!canEdit} aria-valuetext={`${Math.round(position.zoom * 100)} percent`} onChange={(event) => {
          if (image && !busyRef.current) update(zoomImage(positionRef.current, { width: image.naturalWidth, height: image.naturalHeight }, 1, Number(event.currentTarget.value)));
        }} />
        <output htmlFor={zoomId}>{Math.round(position.zoom * 100)}%</output>
      </div>
      <button type="button" className="profile-photo-reset" onClick={() => { if (!busyRef.current) update(CENTER_IMAGE_POSITION); }} disabled={!canEdit}><RotateCcwIcon size={18} aria-hidden="true" />Reset</button>
      {typeof source !== 'string' && source.type === 'image/gif' ? <p>Saving this crop creates a still image.</p> : null}
      {error ? <p role="alert" className="profile-photo-error">{error} {!image ? <button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button> : null}</p> : null}
    </div>
  </section></ModalPortal>;
}

function midpoint(first: Point, second: Point): Point { return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }; }
