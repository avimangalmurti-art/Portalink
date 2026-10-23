import { useCallback, useEffect, useRef } from 'react';
import type { FeedState } from './useFeed';

type RecoveryFeed = Pick<FeedState, 'status' | 'isRefreshing' | 'isLoadingMore' | 'isSavingHomeMode' |
  'refreshError' | 'loadMoreError' | 'nextCursor' | 'retry' | 'loadMore'>;
type RecoveryOptions = { enabled: boolean; identity: object; feed: RecoveryFeed };
type RecoveryController = { cancel: () => void; flush: () => void };

/** A return/reconnection grants one failed-read retry, never a healthy-feed refresh. */
export function useMobileFeedRecovery(options: RecoveryOptions): () => void {
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef<RecoveryController | null>(null);
  const previous = useRef<{ identity: object; enabled: boolean } | null>(null);
  const { enabled, identity, feed } = options;

  useEffect(() => {
    const returning = previous.current?.identity === identity && !previous.current.enabled;
    previous.current = { identity, enabled };
    if (!enabled) return;

    let disposed = false;
    let pending = false;
    let timer = 0;
    let visible = document.visibilityState !== 'hidden';
    let online = navigator.onLine !== false;
    let pageShowHandled = false;
    const cancel = () => {
      pending = false;
      window.clearTimeout(timer);
      timer = 0;
    };
    const current = () => !disposed && latest.current.enabled && latest.current.identity === identity;
    const flush = () => {
      if (!pending) return;
      if (!current() || document.visibilityState === 'hidden' || navigator.onLine === false ||
          document.querySelector('[aria-modal="true"]')) {
        cancel();
        return;
      }
      const state = latest.current.feed;
      // An event can precede the failure of the request that was already running.
      // Wait for that operation once, then consume the intent even if retry fails.
      if (state.status === 'idle' || state.status === 'loading' || state.isRefreshing ||
          state.isLoadingMore || state.isSavingHomeMode) return;
      cancel();
      if (state.status === 'error' || state.refreshError) state.retry();
      else if (state.loadMoreError && state.nextCursor) state.loadMore();
    };
    const recover = () => {
      if (!current() || document.visibilityState === 'hidden' || navigator.onLine === false) return;
      // Safari may deliver pageshow, visibilitychange and online for one return.
      visible = true;
      online = true;
      pageShowHandled = true;
      pending = true;
      if (!timer) timer = window.setTimeout(() => { timer = 0; flush(); }, 0);
    };
    const visibility = () => {
      const next = document.visibilityState !== 'hidden';
      const resumed = !visible && next;
      visible = next;
      if (!next) { pageShowHandled = false; cancel(); }
      else if (resumed) recover();
    };
    const connection = () => {
      const next = navigator.onLine !== false;
      const reconnected = !online && next;
      online = next;
      if (!next) { pageShowHandled = false; cancel(); }
      else if (reconnected) recover();
    };
    const hide = () => { visible = false; pageShowHandled = false; cancel(); };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted && !pageShowHandled) recover();
    };
    const owner = { cancel, flush };
    controller.current = owner;
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('offline', connection);
    window.addEventListener('online', connection);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    if (returning) recover();
    return () => {
      disposed = true;
      cancel();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('offline', connection);
      window.removeEventListener('online', connection);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      if (controller.current === owner) controller.current = null;
    };
  }, [enabled, identity]);

  useEffect(() => {
    controller.current?.flush();
  }, [enabled, identity, feed.status, feed.isRefreshing, feed.isLoadingMore, feed.isSavingHomeMode,
    feed.refreshError, feed.loadMoreError, feed.nextCursor]);

  // Explicit UI actions win over a queued lifecycle retry, including before paint.
  return useCallback(() => controller.current?.cancel(), []);
}
