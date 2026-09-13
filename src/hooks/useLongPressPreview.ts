import { useEffect, useRef, type ButtonHTMLAttributes } from 'react';

/** A hold previews; a tap selects. Native scrolling always wins a pending hold. */
export function useLongPressPreview(enabled: boolean, scope: string, onPreview: () => void, onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick']) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const allowContextMenu = useRef(true);
  const preview = useRef(onPreview);
  preview.current = onPreview;
  const cancel = (blockContextMenu = false) => {
    if (blockContextMenu) {
      allowContextMenu.current = false;
      if (start.current) suppressClick.current = true;
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  const open = () => { cancel(); allowContextMenu.current = false; suppressClick.current = true; preview.current(); };
  useEffect(() => {
    if (!enabled) return;
    const otherFinger = (event: PointerEvent) => { if (!event.isPrimary) cancel(true); };
    const scrolling = () => cancel(true);
    document.addEventListener('pointerdown', otherFinger, true);
    document.addEventListener('scroll', scrolling, true);
    return () => {
      cancel(true);
      document.removeEventListener('pointerdown', otherFinger, true);
      document.removeEventListener('scroll', scrolling, true);
    };
  }, [enabled, scope]);
  const events: ButtonHTMLAttributes<HTMLButtonElement> = {
    onPointerDown(event) {
      if (!event.isPrimary) { cancel(true); return; }
      cancel();
      suppressClick.current = false;
      allowContextMenu.current = true;
      if (event.button !== 0) return;
      start.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      timer.current = setTimeout(open, 450);
    },
    onPointerMove(event) {
      if (start.current && (event.pointerId !== start.current.id || Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 8)) cancel(true);
    },
    onPointerUp(event) { cancel(); if (event.button !== 2) allowContextMenu.current = false; },
    onPointerCancel: () => cancel(true),
    onPointerLeave: () => cancel(true),
    onLostPointerCapture: () => cancel(true),
    onContextMenu(event) { event.preventDefault(); if (allowContextMenu.current) open(); },
    onKeyDown(event) {
      if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') { event.preventDefault(); open(); }
      else if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false;
    },
    onClick(event) {
      if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
      else onClick?.(event);
    },
  };
  return enabled ? events : {};
}
