import React, { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { positionMediaComments } from './mediaCommentsPosition';
import { usePresentation } from '../../presentation/usePresentation';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useSheetMotion } from '../../presentation/motion/useSheetMotion';
import { reducedMotion } from '../../presentation/motion/motion';
import './media-comments-motion.css';

function popupHost() {
  // Native fullscreen hides portals outside its element. Both hosts inherit
  // the creator's theme and the visitor's Reduce Translucency preference.
  return document.fullscreenElement ?? document.querySelector('.app-shell') ?? document.body;
}

type Props = {
  id: string;
  label: string;
  anchorRef: RefObject<HTMLDivElement>;
  triggerRef: RefObject<HTMLButtonElement>;
  onClose: () => void;
  mobileMotion?: boolean;
  children: React.ReactNode | ((dismiss: () => void) => React.ReactNode);
};

export function MediaCommentsPopover(props: Props) {
  return usePresentation() === 'mobile' ? <MobileMediaCommentsSheet {...props} /> : <AnchoredMediaComments {...props} />;
}

function MobileMediaCommentsSheet({ id, label, anchorRef, onClose, children, mobileMotion = false }: Props) {
  const motion = useSheetMotion(onClose, 'base');
  const finish = motion.finish;
  const closing = mobileMotion && motion.closing;
  // Keep a decorative exit at its painted position while focus dismisses the keyboard.
  const viewportRef = useDialogViewport(!closing);
  const panelRef = useRef<HTMLElement>(null);
  const [host] = useState(popupHost);
  const dismiss = () => {
    if (!mobileMotion) { onClose(); return; }
    if (closing) return;
    const overlay = viewportRef.current;
    if (overlay) overlay.style.setProperty('--motion-exit-opacity', getComputedStyle(overlay).opacity);
    motion.close();
  };
  useEffect(() => {
    // Leaving native fullscreen changes the portal host. Close the sheet so
    // its focus/keyboard hooks never keep references to replaced DOM nodes.
    // The parent retains the draft when the user opens comments again.
    const changeHost = () => mobileMotion ? finish() : onClose();
    document.addEventListener('fullscreenchange', changeHost);
    return () => document.removeEventListener('fullscreenchange', changeHost);
  }, [onClose, mobileMotion, finish]);
  useEffect(() => {
    if (!mobileMotion) return;
    window.addEventListener('popstate', finish, true);
    return () => window.removeEventListener('popstate', finish, true);
  }, [mobileMotion, finish]);
  useLayoutEffect(() => {
    if (closing) return;
    const frame = anchorRef.current?.closest('[data-presentation="mobile"]');
    frame?.setAttribute('data-page-comments-open', '');
    return () => { frame?.removeAttribute('data-page-comments-open'); };
  }, [anchorRef, closing]);
  useEffect(() => {
    if (closing) return;
    const viewport = window.visualViewport;
    const update = () => {
      const keyboardOpen = viewport && window.innerHeight - viewport.height - viewport.offsetTop > 120;
      viewportRef.current?.style.setProperty('--comments-bottom-inset', keyboardOpen ? '12px' : 'max(12px, env(safe-area-inset-bottom))');
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [viewportRef, closing]);
  // Release viewport listeners before focus return can collapse the keyboard.
  useModalFocus(!closing, panelRef, dismiss, mobileMotion);
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return createPortal(<div ref={element => { if (element) element.inert = closing; }} data-presentation="mobile" data-mobile-comments-motion={mobileMotion || undefined} data-closing={closing || undefined} data-reduce-motion={mobileMotion && reducedMotion() || undefined} aria-hidden={closing || undefined}><div ref={viewportRef} data-mobile-media-comments=""
    style={{ top: 'var(--dialog-viewport-top, 0px)', height: 'var(--dialog-viewport-height, 100dvh)' }}
    onPointerDown={event => { stop(event); if (event.target === event.currentTarget) dismiss(); }}
    onPointerUp={stop} onClick={stop} onDoubleClick={stop} onWheel={stop} onTouchMove={stop} onKeyDown={stop}>
    <section ref={panelRef} id={id} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}
      data-media-interaction="" className="mobile-media-comments-sheet">
      {typeof children === 'function' ? children(dismiss) : children}
    </section>
  </div></div>, host);
}

function AnchoredMediaComments({ id, label, anchorRef, triggerRef, onClose, children }: Props) {
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
  >{typeof children === 'function' ? children(onClose) : children}</section>, host);
}
