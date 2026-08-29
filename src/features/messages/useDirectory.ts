import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import type { AsyncStatus, FeedCreator } from '../../types/domain';

/**
 * The people a new conversation could be addressed to.
 *
 * There is no contacts service, and inventing one would mean inventing people.
 * So this reads the accounts the discovery service already publishes — real
 * profiles, resolved through the existing service boundary — rather than a
 * second directory of its own. When a messaging service arrives with a genuine
 * contact list, this hook is the single place that changes.
 */
export type DirectoryState = {
  status: AsyncStatus;
  people: FeedCreator[];
  error: string | null;
  retry: () => void;
};
export function useDirectory(): DirectoryState {
  const {
    discovery
  } = useServices();
  const {
    revision
  } = useProfileData();
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [people, setPeople] = useState<FeedCreator[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let isCurrent = true;
    setStatus('loading');
    setError(null);
    discovery.listAccountsToExplore().then((next) => {
      if (!isCurrent) {
        return;
      }
      setPeople(next);
      setStatus('success');
    }).catch((caught) => {
      if (!isCurrent) {
        return;
      }
      // Nothing is substituted on failure: an address book that guesses who
      // exists is worse than one that says it could not be read.
      setPeople([]);
      setError(caught instanceof Error ? caught.message : 'People could not be loaded.');
      setStatus('error');
    });
    return () => {
      isCurrent = false;
    };
  }, [discovery, revision, attempt]);
  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);
  return {
    status,
    people,
    error,
    retry
  };
}