import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { motionEase, motionMs } from '../../presentation/motion/motion';

/** Only the existing Share <-> QR body changes; navigation never waits for paint. */
export function useCatalogueQrNavigation({ enabled, view, scope, dialog }: { enabled: boolean; view: string; scope: string; dialog: RefObject<HTMLElement> }) {
  const trigger = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const saved = useRef({ top: 0, left: 0 }), identity = useRef(scope);
  const pending = useRef<{ view: 'share' | 'qr'; opacity: number }>();
  const active = useRef<{ body: HTMLElement; animation: Animation }>();
  const stop = useCallback(() => {
    const previous = active.current; active.current = undefined;
    if (previous) { delete previous.body.dataset.catalogueQrMotion; previous.animation.cancel(); }
  }, []);
  const change = (next: 'share' | 'qr', update: () => void) => {
    if (!enabled) { update(); return; }
    if (pending.current?.view === next) return;
    const body = dialog.current?.querySelector<HTMLElement>('.portfolio-share-body');
    if (view === 'share' && next === 'qr' && body) saved.current = { top: body.scrollTop, left: body.scrollLeft };
    const opacity = active.current && body ? Number.parseFloat(getComputedStyle(body).opacity) : 0;
    stop();
    pending.current = { view: next, opacity: Number.isFinite(opacity) ? opacity : 0 };
    update();
  };
  useLayoutEffect(() => {
    const next = pending.current; pending.current = undefined;
    stop();
    if (identity.current !== scope) { identity.current = scope; saved.current = { top: 0, left: 0 }; return; }
    if (!enabled || next?.view !== view) return;
    const body = dialog.current?.querySelector<HTMLElement>('.portfolio-share-body');
    if (!body) return;
    body.scrollTop = view === 'qr' ? 0 : saved.current.top;
    body.scrollLeft = view === 'qr' ? 0 : saved.current.left;
    const target = view === 'qr' ? heading.current : trigger.current;
    const fallback = dialog.current?.querySelector<HTMLButtonElement>('header button[aria-label="Back"]') ?? dialog.current;
    (target?.isConnected ? target : fallback)?.focus({ preventScroll: true });
    const duration = motionMs('fast');
    if (!duration || typeof body.animate !== 'function') return;
    try {
      const animation = body.animate([{ opacity: next.opacity }, { opacity: 1 }], { duration, easing: motionEase() });
      active.current = { body, animation }; body.dataset.catalogueQrMotion = '';
      const finished = () => { if (active.current?.animation === animation) stop(); };
      void animation.finished.then(finished, finished);
    } catch { stop(); }
    return stop;
  }, [enabled, view, scope, dialog, stop]);
  useEffect(() => {
    if (!enabled) return;
    const body = dialog.current?.querySelector<HTMLElement>('.portfolio-share-body');
    const interrupt = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-catalogue-qr-trigger]')) return;
      stop();
    };
    const leave = () => { pending.current = undefined; stop(); };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => { if (media.matches) stop(); };
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) body?.addEventListener(type, interrupt, { passive: true });
    window.addEventListener('popstate', leave);
    media.addEventListener('change', reduce);
    return () => {
      for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) body?.removeEventListener(type, interrupt);
      window.removeEventListener('popstate', leave); media.removeEventListener('change', reduce); leave();
    };
  }, [enabled, scope, dialog, stop]);
  return { trigger, heading, open: (update: () => void) => change('qr', update), back: (update: () => void) => change('share', update) };
}
