import { useEffect, useRef } from 'react';
import type { PointerEvent, KeyboardEvent } from 'react';
import type { ProjectCoverFrame } from '../../types/domain';
import type { ImagePosition, ImageSize } from '../../types/imageCrop';
import { cropFromPosition, panImage, zoomImage } from '../../utils/imageCrop';

/** Shared crop geometry, committed directly to the project draft. */
export function useInlineCoverCrop({ active, frame, size, onChange }: {
  active: boolean; frame: ProjectCoverFrame; size: ImageSize | null; onChange: (frame: ProjectCoverFrame) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const latest = useRef({ active, frame, size, onChange });
  latest.current = { active, frame, size, onChange };
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const commit = (position: ImagePosition) => {
    const current = latest.current;
    if (!current.active || !current.size) return;
    const aspectRatio = current.frame.aspectRatio ?? 4 / 3;
    const next = { ...position, aspectRatio, crop: cropFromPosition(current.size, aspectRatio, position) };
    latest.current.frame = next;
    current.onChange(next);
  };
  useEffect(() => {
    const element = ref.current;
    if (!element || !active || !size) return;
    const wheel = (event: WheelEvent) => {
      const current = latest.current;
      if (!current.active || !current.size) return;
      if (event.shiftKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      commit(zoomImage(current.frame, current.size, current.frame.aspectRatio ?? 4 / 3, current.frame.zoom * Math.exp(-Math.max(-200, Math.min(200, delta)) * .002), { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { element.removeEventListener('wheel', wheel); drag.current = null; };
    // The listener reads the current frame and callback without interrupting a drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, size]);
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return { ref, onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!active || !size || event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = latest.current, previous = drag.current;
    if (!current.active || !current.size || previous?.id !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    commit(panImage(current.frame, current.size, bounds, event.clientX - previous.x, event.clientY - previous.y));
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: () => { drag.current = null; },
  onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const current = latest.current;
    if (!current.active || !current.size) return;
    const step = event.shiftKey ? 10 : 2;
    const directions: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const direction = directions[event.key];
    if (direction) { event.preventDefault(); commit(panImage(current.frame, current.size, event.currentTarget.getBoundingClientRect(), ...direction)); }
  } };
}
