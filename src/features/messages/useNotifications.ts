import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAccountQuery } from '../library/useAccountQuery';
import type { AsyncStatus, Notification } from '../../types/domain';

export type NotificationsState = {
  status: AsyncStatus;
  notifications: Notification[];
  unreadCount: number;
  error: string | null;
  mutationError: string | null;
  pendingId: string | null;
  markRead: (id: string) => Promise<void>;
  retry: () => void;
};

/** The same private notification source for Activity and the Messages inbox. */
export function useNotifications(): NotificationsState {
  const { notifications: service } = useServices();
  const { user } = useAuth();
  const account = user?.id;
  const currentAccount = useRef(account);
  currentAccount.current = account;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const query = useCallback(() => service.listNotifications(), [service]);
  const state = useAccountQuery(query);
  const [mutation, setMutation] = useState<{ account?: string; pendingId?: string; error?: string; readIds: string[] }>({ readIds: [] });
  const visibleMutation = mutation.account === account ? mutation : { readIds: [] };
  const notifications = (state.data ?? []).map((entry) => visibleMutation.readIds.includes(entry.id) ? { ...entry, isUnread: false } : entry);
  async function markRead(id: string) {
    if (!account || visibleMutation.pendingId || !notifications.some((n) => n.id === id && n.isUnread)) return;
    setMutation({ account, pendingId: id, readIds: visibleMutation.readIds });
    try {
      await service.markRead(id);
      if (mounted.current && currentAccount.current === account) setMutation({ account, readIds: [...visibleMutation.readIds, id] });
    } catch {
      if (mounted.current && currentAccount.current === account) setMutation({ account, readIds: visibleMutation.readIds, error: 'Could not mark this notification as read. Please try again.' });
    }
  }
  return {
    status: state.loading ? 'loading' : state.error ? 'error' : 'success',
    notifications,
    unreadCount: notifications.filter((entry) => entry.isUnread).length,
    error: state.error ?? null,
    mutationError: visibleMutation.error ?? null,
    pendingId: visibleMutation.pendingId ?? null,
    markRead,
    retry: state.retry,
  };
}
