import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEngagementStore } from '../../contexts/EngagementContext';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import type { Id } from '../../types/domain';

/** The signed-in viewer's project saves, reconciled with engagement changed this session. */
export function useSavedProjectIds(enabled: boolean) {
  const { engagement } = useServices();
  const store = useEngagementStore();
  const accountId = useAuth().user?.id ?? null;
  const active = enabled && accountId !== null;
  const [serviceIds, setServiceIds] = useState<Id[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const requestToken = useRef(0);
  useEffect(() => {
    if (!active) {
      requestToken.current += 1;
      setServiceIds(null);
      setError(null);
      return;
    }
    const token = requestToken.current + 1;
    requestToken.current = token;
    setServiceIds(null);
    setError(null);
    engagement.listEngagedProjectIds('save').then((ids) => {
      if (requestToken.current === token) setServiceIds(ids);
    }).catch((caught) => {
      if (requestToken.current !== token) return;
      setError(caught instanceof Error && caught.message ? caught.message : 'Saved projects could not be loaded.');
    });
    return () => { requestToken.current += 1; };
  }, [accountId, active, engagement, revision]);

  const known = store.knownFor('save');
  const engagedKey = known.engaged.join(',');
  const withdrawnKey = known.withdrawn.join(',');
  const ids = useMemo(() => {
    const result = new Set(serviceIds ?? []);
    for (const id of withdrawnKey ? withdrawnKey.split(',') : []) result.delete(id);
    for (const id of engagedKey ? engagedKey.split(',') : []) result.add(id);
    return [...result];
  }, [engagedKey, serviceIds, withdrawnKey]);
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { ids, loading: active && serviceIds === null && error === null, error, retry };
}
