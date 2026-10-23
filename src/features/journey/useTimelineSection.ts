import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';

type TimelineSectionOptions = {
  enabled: boolean;
  paused?: boolean;
  rootRef: RefObject<HTMLElement>;
  toolbarRef: RefObject<HTMLElement>;
  pairRef: RefObject<HTMLElement>;
  toolbarHost?: HTMLElement | null;
  contentKey: string;
};

/** Scroll selection describes the continuous list; it never changes its filter. */
export function useTimelineSection({ enabled, paused = false, rootRef, toolbarRef, pairRef, toolbarHost, contentKey }: TimelineSectionOptions) {
  const screenActive = useMobileScreenActive();
  const [atPairs, setAtPairs] = useState(false);
  const held = useRef(false);
  useLayoutEffect(() => {
    const root = rootRef.current, toolbar = toolbarRef.current, pair = pairRef.current;
    if (!enabled || paused || !screenActive || !root || !toolbar || !pair) return;
    let owner: HTMLElement | null = null;
    const clips: HTMLElement[] = [];
    for (let parent = root.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowY;
      if (!owner && /^(auto|scroll|overlay)$/.test(overflow)) owner = parent;
      if (/^(auto|scroll|overlay|hidden|clip)$/.test(overflow)) clips.push(parent);
    }
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      if (held.current || document.visibilityState === 'hidden' || root.isConnected === false || toolbar.isConnected === false || pair.isConnected === false
        || rootRef.current !== root || toolbarRef.current !== toolbar || pairRef.current !== pair || !root.getClientRects().length
        || root.closest('[hidden], [inert], [aria-hidden="true"], .screen-exit')
        || (viewport && Math.abs(viewport.scale - 1) > 0.01)) return;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      let top = Math.max(viewportTop, toolbar.getBoundingClientRect().bottom), bottom = viewportBottom;
      for (const clip of clips) {
        const bounds = clip.getBoundingClientRect();
        top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
      }
      if (bottom <= top) return;
      const start = pair.getBoundingClientRect();
      if (start.width <= 0 || start.height <= 0) return;
      const scroller = owner ?? document.scrollingElement ?? document.documentElement;
      const range = scroller.scrollHeight - scroller.clientHeight;
      // A short final pair may never reach the reading midpoint. Once the
      // viewer reaches the end, a visible pair still belongs to Then/Now.
      const visibleAtEnd = range > 1 && scroller.scrollTop >= range - 1 && start.top < bottom && start.bottom > top;
      setAtPairs(start.top <= top + (bottom - top) / 2 || visibleAtEnd);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; measure(); });
    };
    const release = (event: Event) => {
      // Keyboard focus can scroll the toolbar before its click. An explicit
      // sort wins until the viewer resumes scrolling.
      if (event.type === 'pointerdown' && event.target && toolbar.contains(event.target as Node)) return;
      if (event.type === 'keydown' && (event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (event.type === 'keydown' && (event as KeyboardEvent).key === ' ' && (event.target as Element | null)?.closest?.('button')) return;
      if (event.type === 'keydown' && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes((event as KeyboardEvent).key)) return;
      held.current = false;
      schedule();
    };
    const visible = () => { if (document.visibilityState === 'visible') schedule(); };
    const intents = ['wheel', 'touchmove', 'pointerdown', 'keydown'];
    measure();
    schedule();
    for (const name of intents) document.addEventListener(name, release, { capture: true, passive: true });
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    for (const element of [root, toolbar, pair, ...clips]) observer?.observe(element);
    return () => {
      for (const name of intents) document.removeEventListener(name, release, true);
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pageshow', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [enabled, paused, screenActive, contentKey, toolbarHost, rootRef, toolbarRef, pairRef]);
  return { atPairs: enabled && screenActive && atPairs, reset: () => { held.current = true; setAtPairs(false); } };
}
