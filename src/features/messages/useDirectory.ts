import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { AsyncStatus } from '../../types/domain';
import type { MessageParticipant } from '../../types/messages';

export type DirectoryState = {
  status: AsyncStatus;
  people: MessageParticipant[];
  error: string | null;
  hasMore: boolean;
  retry: () => void;
  loadMore: () => Promise<void>;
};

/** Server-backed recipient search; names and usernames use the same canonical profile rows. */
export function useDirectory(query: string): DirectoryState {
  const { messaging } = useServices();
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [people, setPeople] = useState<MessageParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const normalized = query.trim();

  useEffect(() => {
    const version = ++request.current;
    const timer = window.setTimeout(() => {
      setStatus('loading');
      setError(null);
      void messaging.searchRecipients(normalized, { limit: 30 }).then((next) => {
        if (version !== request.current) return;
        setPeople(next);
        setHasMore(next.length === 30);
        setStatus('success');
      }).catch(() => {
        if (version !== request.current) return;
        setPeople([]);
        setHasMore(false);
        setError('Creators could not be searched. Check the connection and try again.');
        setStatus('error');
      });
    }, normalized ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [attempt, messaging, normalized]);

  const loadMore = useCallback(async () => {
    if (!hasMore || status === 'loading') return;
    setStatus('loading');
    try {
      const next = await messaging.searchRecipients(normalized, { offset: people.length, limit: 30 });
      setPeople((current) => [...new Map([...current, ...next].map((person) => [person.id, person])).values()]);
      setHasMore(next.length === 30);
      setStatus('success');
    } catch {
      setError('More creators could not be loaded. Please try again.');
      setStatus('error');
    }
  }, [hasMore, messaging, normalized, people.length, status]);

  return {
    status,
    people,
    error,
    hasMore,
    retry: () => setAttempt((count) => count + 1),
    loadMore,
  };
}
