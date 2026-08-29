import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { AsyncStatus, Notification } from '../../types/domain';

/**
 * The inbox: everything addressed to the viewer that is not a conversation.
 *
 * Read through the existing `NotificationService` boundary, so nothing here is
 * invented locally — an empty inbox is a real answer from the service rather
 * than a placeholder.
 */
export type NotificationsState = {
  status: AsyncStatus;
  notifications: Notification[];
  unreadCount: number;
  error: string | null;
  retry: () => void;
};
export function useNotifications(): NotificationsState {
  const {
    notifications: service
  } = useServices();
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let isCurrent = true;
    setStatus('loading');
    setError(null);
    service.listNotifications().then((next) => {
      if (!isCurrent) {
        return;
      }
      setNotifications(next);
      setStatus('success');
    }).catch((caught) => {
      if (!isCurrent) {
        return;
      }
      setNotifications([]);
      setError(caught instanceof Error ? caught.message : 'Unable to load inbox.');
      setStatus('error');
    });
    return () => {
      isCurrent = false;
    };
  }, [service, attempt]);
  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);
  return {
    status,
    notifications,
    unreadCount: notifications.filter((entry) => entry.isUnread).length,
    error,
    retry
  };
}
