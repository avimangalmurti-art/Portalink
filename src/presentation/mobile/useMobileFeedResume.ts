import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react';
import { MOBILE_RESUME_MAX_FEED_ITEMS, saveMobileResumeFeed, type MobileResumeFeedState } from './mobileResumeState';
import { useMobileResumeLaunch } from './mobileResumeLaunch';
import type { ProjectFeedCursor } from '../../types/discovery';

type Input = { enabled: boolean; accountId: string | null; path: string; host: RefObject<HTMLElement | null>; projectIds: string[]; ready: boolean; saveReady: boolean; failed: boolean; busy: boolean; nextCursor: ProjectFeedCursor | null; loadMore: () => void };

/** Restore only the eligible cold launch; ordinary retained Back keeps its existing ownership. */
export function useMobileFeedResume(input: Input): { restoring: boolean; handled: boolean } {
  const launch = useMobileResumeLaunch();
  const { host, loadMore } = input;
  const identity = useMemo(() => ({ accountId: input.accountId, path: input.path }), [input.accountId, input.path]);
  const [, render] = useReducer(value => value + 1, 0);
  const state = useRef<{ identity: typeof identity; point: MobileResumeFeedState | null; done: boolean; cursors: Set<ProjectFeedCursor> } | null>(null);
  if (!state.current || state.current.identity !== identity) state.current = { identity, point: null, done: false, cursors: new Set() };
  if (input.enabled && !state.current.done && !state.current.point && launch?.accountId === input.accountId && launch.record.feed?.path === input.path && !launch.feeds.has(input.path)) state.current.point = launch.record.feed;
  const current = state.current;
  const restoring = Boolean(current.point && !current.done);
  const latest = useRef(input); latest.current = input;

  useLayoutEffect(() => {
    if (!input.enabled || !launch || launch.accountId !== input.accountId) {
      if (current.point && !current.done) { current.done = true; render(); }
      return;
    }
    if (!restoring || !current.point) return;
    launch?.feeds.add(input.path);
    const stop = () => { if (!current.done) { current.done = true; render(); } };
    const types = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
    for (const type of types) window.addEventListener(type, stop, { capture: true, passive: true });
    return () => { for (const type of types) window.removeEventListener(type, stop, true); };
  }, [input.enabled, input.accountId, input.path, current, launch, restoring]);

  useEffect(() => {
    if (!input.enabled || !current.point || current.done || !input.ready || input.busy) return;
    const point = current.point;
    const anchorLoaded = point.anchorId && input.projectIds.includes(point.anchorId);
    if (!input.failed && !anchorLoaded && input.projectIds.length < point.loadedCount && input.projectIds.length < MOBILE_RESUME_MAX_FEED_ITEMS && input.nextCursor && current.cursors.size < 10 && !current.cursors.has(input.nextCursor)) {
      current.cursors.add(input.nextCursor); loadMore(); return;
    }
    let frame = 0, tries = 0, stable = 0;
    const restore = () => {
      if (current.done || !latest.current.enabled) return;
      const element = document.scrollingElement;
      if (!element) { current.done = true; render(); return; }
      const anchor = point.anchorId ? host.current?.querySelector<HTMLElement>(`[data-project-continuity-id="${point.anchorId}"]`) : null;
      const target = anchor && tries > 0 && point.anchorOffset !== undefined ? Math.max(0, element.scrollTop + anchor.getBoundingClientRect().top - point.anchorOffset) : point.scrollTop;
      element.scrollTop = target;
      const complete = anchor && point.anchorOffset !== undefined ? Math.abs(anchor.getBoundingClientRect().top - point.anchorOffset) < 2 : Math.abs(element.scrollTop - target) < 2;
      stable = complete ? stable + 1 : 0;
      if (++tries < 45 && stable < 2) frame = requestAnimationFrame(restore);
      else { current.done = true; render(); }
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [input.enabled, input.ready, input.failed, input.busy, input.projectIds, input.nextCursor, loadMore, host, current]);

  useEffect(() => {
    if (!input.enabled || !input.accountId || !input.ready || !input.saveReady || input.failed || restoring) return;
    const accountId = input.accountId;
    let timer = 0, pending: MobileResumeFeedState | null = null;
    const flush = () => { window.clearTimeout(timer); timer = 0; if (pending && latest.current.accountId === accountId) { saveMobileResumeFeed(accountId, input.path, pending); pending = null; } };
    const capture = () => {
      if (!latest.current.enabled || host.current?.closest('.screen-exit')) return;
      const cards = host.current?.querySelectorAll<HTMLElement>('[data-project-continuity-id]');
      const anchor = cards && Array.from(cards).find(card => { const rect = card.getBoundingClientRect(); return rect.bottom > 0 && rect.top < window.innerHeight; });
      pending = { scrollTop: Math.max(0, Math.round(window.scrollY)), loadedCount: Math.min(MOBILE_RESUME_MAX_FEED_ITEMS, latest.current.projectIds.length), ...(anchor ? { anchorId: anchor.dataset.projectContinuityId, anchorOffset: anchor.getBoundingClientRect().top } : {}) };
      window.clearTimeout(timer); timer = window.setTimeout(flush, 750);
    };
    const hidden = () => { if (document.visibilityState === 'hidden') { capture(); flush(); } };
    const hide = () => { capture(); flush(); };
    const frame = requestAnimationFrame(capture);
    window.addEventListener('scroll', capture, { passive: true }); window.addEventListener('pagehide', hide); document.addEventListener('visibilitychange', hidden);
    return () => { cancelAnimationFrame(frame); flush(); window.removeEventListener('scroll', capture); window.removeEventListener('pagehide', hide); document.removeEventListener('visibilitychange', hidden); window.clearTimeout(timer); };
  }, [input.enabled, input.accountId, input.path, input.ready, input.saveReady, input.failed, host, restoring]);
  return { restoring, handled: Boolean(current.point) };
}
