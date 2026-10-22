import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { usePresentation } from '../../presentation/usePresentation';
import { useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';

type RecoveryOptions = {
  hostRef: RefObject<HTMLElement>;
  identity: unknown;
  failed: boolean;
  loading?: boolean;
  enabled?: boolean;
  onRetry: () => void;
};
type RecoveryController = { cancel: () => void; flush: () => void };
const NEAR_MARGIN = 120;

/** Geometry also respects nested scrolling/clipping containers, not just the window. */
function nearViewport(host: HTMLElement): boolean {
  const viewport = window.visualViewport;
  let left = viewport?.offsetLeft ?? 0;
  let top = viewport?.offsetTop ?? 0;
  let right = left + (viewport?.width ?? window.innerWidth);
  let bottom = top + (viewport?.height ?? window.innerHeight);
  const bounds = host.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  for (let node: HTMLElement | null = host; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (node === host) continue;
    const clipsX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
    const clipsY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if (!clipsX && !clipsY) continue;
    const clip = node.getBoundingClientRect();
    const x = clip.left + node.clientLeft, y = clip.top + node.clientTop;
    if (clipsX) { left = Math.max(left, x); right = Math.min(right, x + node.clientWidth); }
    if (clipsY) { top = Math.max(top, y); bottom = Math.min(bottom, y + node.clientHeight); }
  }
  return right > left && bottom > top && bounds.right > left - NEAR_MARGIN &&
    bounds.left < right + NEAR_MARGIN && bounds.bottom > top - NEAR_MARGIN && bounds.top < bottom + NEAR_MARGIN;
}

/** A genuine mobile return grants one failed visible-media read, never a reload of healthy work. */
export function useMobileMediaRecovery(options: RecoveryOptions): () => void {
  const mobile = usePresentation() === 'mobile';
  const active = useMobileScreenActive();
  const enabled = mobile && active && options.enabled !== false;
  const latest = useRef({ ...options, enabled });
  latest.current = { ...options, enabled };
  const controller = useRef<RecoveryController | null>(null);
  const previous = useRef<{ identity: unknown; mobile: boolean; active: boolean } | null>(null);
  const { identity, hostRef, failed, loading } = options;

  useEffect(() => {
    // Near-page eligibility changes are not navigation. A page's own loader may
    // already restart when it approaches; only a retained screen return grants
    // an additional recovery attempt here.
    const returning = mobile && active && previous.current?.mobile && !previous.current.active &&
      Object.is(previous.current.identity, identity);
    previous.current = { identity, mobile, active };
    if (!enabled) return;

    let disposed = false, pending = false, timer = 0, watching = false;
    let observer: IntersectionObserver | null = null;
    let visible = document.visibilityState !== 'hidden';
    let online = navigator.onLine !== false;
    let pageShowHandled = false;
    const viewport = window.visualViewport;
    const current = () => !disposed && latest.current.enabled && Object.is(latest.current.identity, identity);
    const schedule = () => {
      if (current() && pending && !timer) timer = window.setTimeout(() => { timer = 0; flush(); }, 0);
    };
    const stopWatching = () => {
      observer?.disconnect(); observer = null;
      if (!watching) return;
      watching = false;
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      viewport?.removeEventListener('resize', schedule);
    };
    const cancel = () => {
      pending = false;
      window.clearTimeout(timer); timer = 0;
      stopWatching();
    };
    const watch = (host: HTMLElement) => {
      if (watching) return;
      watching = true;
      // Capture also sees scrolls in nested reader surfaces. The observer covers
      // layout changes that bring the page near without a new scroll event.
      window.addEventListener('scroll', schedule, true);
      window.addEventListener('resize', schedule);
      viewport?.addEventListener('scroll', schedule);
      viewport?.addEventListener('resize', schedule);
      if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(schedule, { rootMargin: `${NEAR_MARGIN}px` });
        observer.observe(host);
      }
    };
    const flush = () => {
      if (!pending) return;
      const state = latest.current, host = state.hostRef.current;
      if (!current() || document.visibilityState === 'hidden' || navigator.onLine === false ||
          !host?.isConnected || host.closest('[inert], [aria-hidden="true"]') || document.querySelector('[aria-modal="true"]')) {
        cancel(); return;
      }
      // A return may precede the failure of a read already in flight.
      if (state.loading) return;
      if (!state.failed) { cancel(); return; }
      if (!nearViewport(host)) { watch(host); return; }
      cancel();
      state.onRetry();
    };
    const recover = () => {
      if (!current() || document.visibilityState === 'hidden' || navigator.onLine === false) return;
      visible = true; online = true; pageShowHandled = true;
      pending = true;
      schedule();
    };
    const visibility = () => {
      const next = document.visibilityState !== 'hidden', resumed = !visible && next;
      visible = next;
      if (!next) { pageShowHandled = false; cancel(); }
      else if (resumed) recover();
    };
    const connection = () => {
      const next = navigator.onLine !== false, reconnected = !online && next;
      online = next;
      if (!next) { pageShowHandled = false; cancel(); }
      else if (reconnected) recover();
    };
    const hide = () => { visible = false; pageShowHandled = false; cancel(); };
    const show = (event: PageTransitionEvent) => { if (event.persisted && !pageShowHandled) recover(); };
    const owner = { cancel, flush };
    controller.current = owner;
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('offline', connection);
    window.addEventListener('online', connection);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    if (returning) recover();
    return () => {
      disposed = true; cancel();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('offline', connection);
      window.removeEventListener('online', connection);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      if (controller.current === owner) controller.current = null;
    };
  }, [enabled, identity, hostRef, mobile, active]);

  useEffect(() => { controller.current?.flush(); }, [enabled, identity, failed, loading]);
  return useCallback(() => controller.current?.cancel(), []);
}
