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
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  retry: () => void;
};

/** One synchronized Activity source with realtime refresh and per-row mutations. */
export function useNotifications(): NotificationsState {
  const { notifications: service } = useServices();
  const { user } = useAuth();
  const account = user?.id ?? null;
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const request = useRef(0);
  const accountRef = useRef(account);
  accountRef.current = account;

  const load = useCallback(async (background = false) => {
    const version = ++request.current;
    if (!account) { setItems([]); setStatus('success'); return; }
    if (!background) setStatus('loading');
    try {
      const next = await service.listNotifications();
      if (version !== request.current || accountRef.current !== account) return;
      setItems(next);
      setError(null);
      setStatus('success');
    } catch {
      if (version !== request.current || background) return;
      setError('Activity could not be loaded. Check the connection and try again.');
      setStatus('error');
    }
  }, [account, service]);

  useEffect(() => {
    setItems([]);
    setPendingIds(new Set());
    setMutationError(null);
    setIsMarkingAll(false);
    void load();
    return () => { request.current += 1; };
  }, [account, load]);

  useEffect(() => {
    if (!account) return undefined;
    const refresh = () => { if (document.visibilityState === 'visible') void load(true); };
    const unsubscribe = service.subscribeToNotifications(refresh);
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { unsubscribe(); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [account, load, service]);

  async function markRead(id: string) {
    if (!account || pendingIds.has(id) || !items.some((item) => item.id === id && item.isUnread)) return;
    setPendingIds((current) => new Set(current).add(id));
    setMutationError(null);
    try {
      await service.markRead(id);
      if (accountRef.current !== account) return;
      request.current += 1;
      const originalTimestamp = items.find((item) => item.id === id)?.timestamp;
      setItems((current) => current.map((item) => item.id === id && item.timestamp === originalTimestamp ? { ...item, isUnread: false } : item));
    } catch {
      if (accountRef.current === account) setMutationError('That notification could not be marked as read. Please try again.');
    } finally {
      if (accountRef.current === account) setPendingIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  async function markAllRead() {
    if (!account || isMarkingAll || !items.some((item) => item.isUnread)) return;
    setIsMarkingAll(true);
    setMutationError(null);
    try {
      await service.markAllRead();
      if (accountRef.current !== account) return;
      request.current += 1;
      const acknowledged = new Map(items.map((item) => [item.id, item.timestamp]));
      setItems((current) => current.map((item) => acknowledged.get(item.id) === item.timestamp ? { ...item, isUnread: false } : item));
      void load(true);
    } catch {
      if (accountRef.current === account) setMutationError('Notifications could not be marked as read. Please try again.');
    } finally {
      if (accountRef.current === account) setIsMarkingAll(false);
    }
  }

  const unreadCount = useMemo(() => items.filter((entry) => entry.isUnread).length, [items]);
  return {
    status,
    notifications: items,
    unreadCount,
    error,
    mutationError,
    pendingIds,
    isMarkingAll,
    markRead,
    markAllRead,
    retry: () => void load(),
  };
}
