import React, { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { PanelLeftOpenIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useModalFocus } from '../../hooks/useModalFocus';

type Sample = { x: number; time: number };
type Drag = { id: number; x: number; y: number; start: number; width: number; axis: 'pending' | 'x'; samples: Sample[] };

function sharedDrawerProgress(start: number, distance: number, width: number) {
  return Math.max(0, Math.min(1, start + distance / Math.max(1, width)));
}
function sharedDrawerRelease(progress: number, distance: number, velocity: number) {
  return Math.abs(distance) >= 24 && Math.abs(velocity) >= 0.45 ? velocity > 0 : progress >= 0.5;
}

/** An independent foreground layer. No drag or open state changes page layout. */
export function PublicProfileDrawer({ name, children }: {
  name: string;
  children: (close: () => void) => React.ReactNode;

}) {
  const { pathname, search } = useLocation();
  const reducedMotion = useReducedMotion();
  const progress = useMotionValue(0);
  const x = useTransform(progress, value => `${(value - 1) * 100}%`);
  const opacity = useTransform(progress, value => value * 0.32);
  const [visible, setVisible] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const committed = useRef(false);
  const animation = useRef<{ stop: () => void } | null>(null);

  const settle = useCallback((next: boolean, immediate = false) => {
    animation.current?.stop();
    committed.current = next;

    if (next) setVisible(true);

    const finish = () => { if (!next) setVisible(false); };
    if (immediate || reducedMotion) { progress.set(next ? 1 : 0); finish(); }
    else animation.current = animate(progress, next ? 1 : 0, {
      type: 'spring', stiffness: 440, damping: 42, mass: 0.8, onComplete: finish,
    });
  }, [progress, reducedMotion]);
  const close = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) openerRef.current?.focus({ preventScroll: true });
    settle(false);
  }, [settle]);
  useModalFocus(visible, panelRef, close, true);

  useEffect(() => {
    drag.current = null;
    settle(false, true);
  }, [pathname, search, settle]);
  useEffect(() => () => animation.current?.stop(), []);

  function cancel() {
    if (!drag.current) return;
    drag.current = null;
    settle(committed.current);
  }
  const gestures = {
    onPointerDownCapture(event: React.PointerEvent<HTMLElement>) {
      if (!event.isPrimary) { cancel(); return; }
      cancel();
      suppressClick.current = false;
      if (event.button !== 0) return;
      const target = event.target as Element;
      if (!event.currentTarget.contains(target) || target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [data-shared-drawer-opener]')) return;
      animation.current?.stop();
      // The narrow edge can be crossed between pointer samples (especially a
      // mouse/pen). Own this non-action target from the first contact.
      if (target.closest('.mobile-shared-drawer-edge')) event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: progress.get(),
        width: panelRef.current?.getBoundingClientRect().width ?? 1, axis: 'pending', samples: [{ x: event.clientX, time: event.timeStamp }] };
    },
    onPointerMoveCapture(event: React.PointerEvent<HTMLElement>) {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
      if (current.axis === 'pending') {
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= 8) return;
        if (Math.abs(dx) <= Math.abs(dy) * 1.5) { cancel(); return; }
        current.axis = 'x';
        event.currentTarget.setPointerCapture(event.pointerId);
        setVisible(true);
        suppressClick.current = true;
      }
      event.preventDefault();
      current.samples = [...current.samples.filter(sample => event.timeStamp - sample.time < 100), { x: event.clientX, time: event.timeStamp }];
      progress.set(sharedDrawerProgress(current.start, dx, current.width));
    },
    onPointerUpCapture(event: React.PointerEvent<HTMLElement>) {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      drag.current = null;
      if (current.axis === 'pending') { settle(committed.current); return; }
      const first = current.samples.find(sample => event.timeStamp - sample.time < 100);
      const velocity = first ? (event.clientX - first.x) / Math.max(1, event.timeStamp - first.time) : 0;
      settle(sharedDrawerRelease(progress.get(), event.clientX - current.x, velocity));
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onClickCapture(event: React.MouseEvent<HTMLElement>) {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault(); event.stopPropagation();
    },
  };

  return <div ref={layerRef} className="mobile-shared-drawer-layer" data-visible={visible} {...gestures}>
    <div className="mobile-shared-drawer-edge" aria-hidden="true" />
    <button ref={openerRef} type="button" data-shared-drawer-opener="" className="mobile-shared-drawer-opener shape-compact"
      tabIndex={visible ? -1 : 0} aria-label="Open profile navigation" aria-expanded={visible} aria-controls="mobile-shared-profile-navigation"
      onClick={() => settle(true)}><PanelLeftOpenIcon size={22} aria-hidden="true" /></button>
    <motion.div aria-hidden="true" className="mobile-shared-drawer-scrim" style={{ opacity }} onClick={close} />
    <motion.div ref={panelRef} id="mobile-shared-profile-navigation" role="dialog" aria-modal={visible || undefined} aria-label={`${name} navigation`}
      aria-hidden={!visible} tabIndex={-1}
      className="mobile-shared-drawer-panel" style={{ x }}>
      {visible ? children(close) : null}
    </motion.div>
  </div>;
}

