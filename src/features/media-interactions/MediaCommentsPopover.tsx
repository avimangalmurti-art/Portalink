import React, { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { positionMediaComments } from './mediaCommentsPosition';

function popupHost() {
  // Native fullscreen hides portals outside its element. Both hosts inherit
  // the creator's theme and the visitor's Reduce Translucency preference.
  return document.fullscreenElement ?? document.querySelector('.app-shell') ?? document.body;
}

export function MediaCommentsPopover({ id, label, anchorRef, triggerRef, onClose, children }: {
  id: string;
  label: string;
  anchorRef: RefObject<HTMLDivElement>;
  triggerRef: RefObject<HTMLButtonElement>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [host, setHost] = useState(popupHost);
  const [position, setPosition] = useState<ReturnType<typeof positionMediaComments> | null>(null);

  useEffect(() => {
    const changeHost = () => setHost(popupHost());
    document.addEventListener('fullscreenchange', changeHost);
    return () => document.removeEventListener('fullscreenchange', changeHost);
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current, anchor = anchorRef.current;
    if (!panel || !anchor) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      frame = 0;
      const bounds = {
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
        offsetLeft: viewport?.offsetLeft ?? 0,
        offsetTop: viewport?.offsetTop ?? 0,
      };
      // Resolve wrapping before measuring, including after pinch zoom.
      panel.style.width = `${Math.min(320, Math.max(0, bounds.width - 16))}px`;
      const next = positionMediaComments(anchor.getBoundingClientRect(), panel.scrollHeight + 2, bounds);
      setPosition((previous) => previous && Object.keys(next).every((key) => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    const resize = new ResizeObserver(schedule);
    resize.observe(panel);
    resize.observe(anchor);
    // Inner content may change without resizing a height-constrained popup.
    for (const child of panel.children) resize.observe(child);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    return () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
    };
  }, [anchorRef, host, children]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    const anchor = anchorRef.current;
    const visibility = new IntersectionObserver(([entry]) => { if (entry && !entry.isIntersecting) onClose(); });
    if (anchor) visibility.observe(anchor);
    return () => {
      document.removeEventListener('pointerdown', outside);
      visibility.disconnect();
    };
  }, [anchorRef, triggerRef, onClose]);

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return createPortal(<section
    ref={panelRef}
    id={id}
    data-media-interaction=""
    aria-label={label}
    className="media-comments-popover scrollbar-overlay fixed z-[75] overflow-y-auto overscroll-contain rounded-[14px] text-left"
    style={position ?? { visibility: 'hidden' }}
    onPointerDown={stop}
    onPointerUp={stop}
    onClick={stop}
    onDoubleClick={stop}
    onWheel={stop}
    onTouchMove={stop}
    onKeyDownCapture={(event) => {
      if (event.key !== 'Escape') return;
      // Consume Escape before the focused-page viewer's document listener.
      event.preventDefault();
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus({ preventScroll: true });
    }}
    onKeyDown={stop}
  >{children}</section>, host);
}
