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

/** Followed recipients by default, with server-backed search across visible profiles. */
export function useDirectory(query: string): DirectoryState {
  const { messaging } = useServices();
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [people, setPeople] = useState<MessageParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resultQuery, setResultQuery] = useState<string | null>(null);
  const request = useRef(0);
  const normalized = query.trim();
  const isCurrentQuery = resultQuery === normalized;

  useEffect(() => {
    const version = ++request.current;
    setStatus('loading');
    setPeople([]);
    setHasMore(false);
    setError(null);
    const timer = window.setTimeout(() => {
      void messaging.searchRecipients(normalized, { limit: 30 }).then((next) => {
        if (version !== request.current) return;
        setResultQuery(normalized);
        setPeople(next);
        setHasMore(next.length === 30);
        setStatus('success');
      }).catch(() => {
        if (version !== request.current) return;
        setResultQuery(normalized);
        setPeople([]);
        setHasMore(false);
        setError('Creators could not be searched. Check the connection and try again.');
        setStatus('error');
      });
    }, normalized ? 220 : 0);
    return () => {
      window.clearTimeout(timer);
      request.current += 1;
    };
  }, [attempt, messaging, normalized]);

  const loadMore = useCallback(async () => {
    if (!isCurrentQuery || !hasMore || status === 'loading') return;
    const version = request.current;
    setStatus('loading');
    try {
      const next = await messaging.searchRecipients(normalized, { offset: people.length, limit: 30 });
      if (version !== request.current) return;
      setPeople((current) => [...new Map([...current, ...next].map((person) => [person.id, person])).values()]);
      setHasMore(next.length === 30);
      setStatus('success');
    } catch {
      if (version !== request.current) return;
      setError('More creators could not be loaded. Please try again.');
      setStatus('error');
    }
  }, [hasMore, isCurrentQuery, messaging, normalized, people.length, status]);

  return {
    status: isCurrentQuery ? status : 'loading',
    people: isCurrentQuery ? people : [],
    error: isCurrentQuery ? error : null,
    hasMore: isCurrentQuery && hasMore,
    retry: () => setAttempt((count) => count + 1),
    loadMore,
  };
}
