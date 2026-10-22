import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import type { AsyncStatus, Notification } from '../../types/domain';

export type NotificationsState = {
  status: AsyncStatus;
  notifications: Notification[];
  unreadCount: number;
  error: string | null;
  mutationError: string | null;
  pendingIds: Set<string>;
  isMarkingAll: boolean;
  isRefreshing: boolean;
  /** Local completion time of a successful service fetch. */
  updatedAt: number | null;
  markRead: (id: string) => Promise<boolean>;
  markAllRead: () => Promise<void>;
  retry: () => void;
  refresh: () => Promise<boolean>;
};

type NotificationsOptions = { mobileContinuity?: boolean };

// The existing notification service forwards PostgREST's browser-fetch message.
// Unknown failures (including permission/auth errors) must not retain private rows.
function isTransportFailure(caught: unknown): boolean {
  return caught instanceof Error && /^(?:TypeError: )?(?:Failed to fetch|fetch failed|Load failed|NetworkError when attempting to fetch resource\.?)$/.test(caught.message);
}

/** One synchronized Activity source with realtime refresh and per-row mutations. */
export function useNotifications({ mobileContinuity = false }: NotificationsOptions = {}): NotificationsState {
  const { notifications: service } = useServices();
  const { user } = useAuth();
  const account = user?.id ?? null;
  const scope = useMemo(() => ({ account, service, mobileContinuity }), [account, service, mobileContinuity]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const statusRef = useRef(status);
  statusRef.current = status;
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const markingAllRef = useRef(false);
  const [loadedScope, setLoadedScope] = useState<typeof scope | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const pendingRef = useRef(new Set<string>());
  const request = useRef(0);
  const accountRef = useRef(account);
  accountRef.current = account;
  const mountedRef = useRef(false);
  const snapshotScopeRef = useRef<typeof scope | null>(null);
  const mobileFlightRef = useRef<{ scope: typeof scope; version: number; promise: Promise<boolean> } | null>(null);

  const load = useCallback((background = false): Promise<boolean> => {
    if (!mountedRef.current || scopeRef.current !== scope) return Promise.resolve(false);
    if (mobileContinuity) {
      const existing = mobileFlightRef.current;
      if (existing?.scope === scope) return existing.promise;
      if (pendingRef.current.size > 0 || markingAllRef.current) return Promise.resolve(false);
      if (!account) {
        setItems([]); statusRef.current = 'success'; setStatus('success');
        return Promise.resolve(true);
      }
      const version = ++request.current;
      const hasSnapshot = snapshotScopeRef.current === scope;
      if (!hasSnapshot) { statusRef.current = 'loading'; setStatus('loading'); }
      setIsRefreshing(true);
      const current = () => mountedRef.current && version === request.current && scopeRef.current === scope && accountRef.current === account;
      const flight = { scope, version, promise: Promise.resolve(false) };
      mobileFlightRef.current = flight;
      const promise = (async () => {
        try {
          const next = await service.listNotifications();
          if (!current()) return false;
          setItems(next);
          snapshotScopeRef.current = scope;
          setLoadedScope(scope);
          setUpdatedAt(Date.now());
          setError(null);
          statusRef.current = 'success';
          setStatus('success');
          return true;
        } catch (caught) {
          if (current()) {
            if (!isTransportFailure(caught)) {
              setItems([]);
              snapshotScopeRef.current = null;
              setUpdatedAt(null);
            }
            setLoadedScope(scope);
            setError('Activity could not be loaded. Check the connection and try again.');
            statusRef.current = 'error';
            setStatus('error');
          }
          return false;
        } finally {
          if (mobileFlightRef.current?.version === version && mobileFlightRef.current.scope === scope) {
            mobileFlightRef.current = null;
            if (mountedRef.current && scopeRef.current === scope) setIsRefreshing(false);
          }
        }
      })();
      flight.promise = promise;
      return promise;
    }
    return (async () => {
      // The inverse order matters too: a foreground refresh cannot start in the
      // middle of an acknowledgement that will invalidate older read requests.
      if (!background && (pendingRef.current.size > 0 || markingAllRef.current)) return false;
      const version = ++request.current;
      if (!account) { setItems([]); statusRef.current = 'success'; setStatus('success'); return true; }
      if (!background) { statusRef.current = 'loading'; setStatus('loading'); }
      try {
        const next = await service.listNotifications();
        if (!mountedRef.current || version !== request.current || scopeRef.current !== scope || accountRef.current !== account) return false;
        setItems(next);
        setLoadedScope(scope);
        setUpdatedAt(Date.now());
        setError(null);
        statusRef.current = 'success';
        setStatus('success');
        return true;
      } catch {
        if (mountedRef.current && version === request.current && scopeRef.current === scope && !background) {
          setLoadedScope(scope);
          setError('Activity could not be loaded. Check the connection and try again.');
          statusRef.current = 'error';
          setStatus('error');
        }
        return false;
      }
    })();
  }, [account, service, scope, mobileContinuity]);

  useEffect(() => {
    mountedRef.current = true;
    mobileFlightRef.current = null;
    snapshotScopeRef.current = null;
    setIsRefreshing(false);
    setItems([]);
    setLoadedScope(null);
    setUpdatedAt(null);
    pendingRef.current = new Set();
    setPendingIds(new Set());
    setMutationError(null);
    setIsMarkingAll(false);
    markingAllRef.current = false;
    void load();
    return () => { mountedRef.current = false; mobileFlightRef.current = null; request.current += 1; };
  }, [account, load]);

  useEffect(() => {
    if (!account) return undefined;
    let connected = false;
    let refreshTimer: number | undefined;
    const refresh = () => { if (document.visibilityState === 'visible') void load(true).then((success) => { if (success === false) connected = false; }); };
    const schedule = () => { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(refresh, 150); };
    const unsubscribe = service.subscribeToNotifications(schedule, (ready) => {
      connected = ready;
      if (ready) schedule();
    });
    const timer = window.setInterval(() => { if (!connected) refresh(); }, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { unsubscribe(); window.clearTimeout(refreshTimer); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [account, load, service]);

  async function markRead(id: string) {
    // Acknowledging rows from an older snapshot must not cancel a foreground
    // refresh and strand it in loading. A ref also protects retained callbacks.
    if (!mountedRef.current || !account || statusRef.current === 'loading' || scopeRef.current !== scope || loadedScope !== scope || (mobileContinuity && snapshotScopeRef.current !== scope) || pendingRef.current.has(id)) return false;
    const entry = items.find(item => item.id === id);
    if (!entry) return false;
    if (!entry.isUnread) return true;
    pendingRef.current.add(id);
    setPendingIds((current) => new Set(current).add(id));
    setMutationError(null);
    try {
      await service.markRead(id);
      if (!mountedRef.current || scopeRef.current !== scope || accountRef.current !== account) return false;
      request.current += 1;
      if (mobileContinuity) { mobileFlightRef.current = null; setIsRefreshing(false); }
      const originalTimestamp = items.find((item) => item.id === id)?.timestamp;
      setItems((current) => current.map((item) => item.id === id && item.timestamp === originalTimestamp ? { ...item, isUnread: false } : item));
      return true;
    } catch {
      if (mountedRef.current && scopeRef.current === scope && accountRef.current === account) setMutationError('That notification could not be marked as read. Please try again.');
      return false;
    } finally {
      if (mountedRef.current && scopeRef.current === scope && accountRef.current === account) {
        pendingRef.current.delete(id);
        setPendingIds((current) => { const next = new Set(current); next.delete(id); return next; });
      }
    }
  }

  async function markAllRead() {
    if (!mountedRef.current || !account || statusRef.current === 'loading' || scopeRef.current !== scope || loadedScope !== scope || (mobileContinuity && snapshotScopeRef.current !== scope) || markingAllRef.current || !items.some((item) => item.isUnread)) return;
    markingAllRef.current = true;
    setIsMarkingAll(true);
    setMutationError(null);
    let refreshAfterMutation = false;
    try {
      await service.markAllRead();
      if (!mountedRef.current || scopeRef.current !== scope || accountRef.current !== account) return;
      request.current += 1;
      if (mobileContinuity) { mobileFlightRef.current = null; setIsRefreshing(false); }
      const acknowledged = new Map(items.map((item) => [item.id, item.timestamp]));
      setItems((current) => current.map((item) => acknowledged.get(item.id) === item.timestamp ? { ...item, isUnread: false } : item));
      if (mobileContinuity) refreshAfterMutation = true;
      else void load(true);
    } catch {
      if (mountedRef.current && scopeRef.current === scope && accountRef.current === account) setMutationError('Notifications could not be marked as read. Please try again.');
    } finally {
      if (mountedRef.current && scopeRef.current === scope && accountRef.current === account) {
        markingAllRef.current = false;
        setIsMarkingAll(false);
        if (refreshAfterMutation) void load(true);
      }
    }
  }

  const isCurrent = loadedScope === scope;
  const visibleItems = isCurrent ? items : [];
  const unreadCount = visibleItems.filter(entry => entry.isUnread).length;
  return {
    status: isCurrent ? status : account ? 'loading' : 'success',
    notifications: visibleItems,
    unreadCount,
    error: isCurrent ? error : null,
    mutationError: isCurrent ? mutationError : null,
    pendingIds: isCurrent ? new Set([...pendingIds, ...(status === 'loading' ? items.map(item => item.id) : [])]) : new Set<string>(),
    isMarkingAll: isCurrent && (isMarkingAll || status === 'loading'),
    isRefreshing: mobileContinuity && isRefreshing && mobileFlightRef.current?.scope === scope,
    updatedAt: isCurrent && (status === 'success' || (mobileContinuity && snapshotScopeRef.current === scope)) ? updatedAt : null,
    markRead,
    markAllRead,
    retry: () => void load(),
    refresh: () => load(),
  };
}
