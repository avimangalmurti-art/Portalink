import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { isRetryableSocialCode, SocialServiceError, type ProfileConnection, type ProfileConnectionKind } from '../../types/social';

type Collection = { key: string; items: ProfileConnection[]; total: number | null; nextOffset: number | null; loading: boolean; error: string | null; canRetry: boolean };
const empty = (key: string): Collection => ({ key, items: [], total: null, nextOffset: null, loading: true, error: null, canRetry: true });

export function useProfileConnections(profileId: string, kind: ProfileConnectionKind | null, refreshVersion = 0) {
  const { social } = useServices();
  const auth = useAuth();
  const ownerKey = `${auth.user?.id ?? 'guest'}:${profileId}`;
  const key = `${ownerKey}:${kind ?? 'none'}:${refreshVersion}`;
  const [state, setState] = useState<Collection>(() => empty(key));
  const [counts, setCounts] = useState<{ key: string; followers?: number; following?: number }>({ key: ownerKey });
  const request = useRef(0);
  const busy = useRef(false);
  const currentKey = useRef(key);
  currentKey.current = key;

  const load = useCallback((offset = 0) => {
    if (!kind) return;
    const version = ++request.current;
    busy.current = true;
    setState((previous) => offset === 0 ? empty(key) : { ...previous, loading: true, error: null });
    social.listProfileConnections(profileId, kind, offset).then((page) => {
      if (currentKey.current !== key || request.current !== version) return;
      setState((previous) => ({
        key, items: offset === 0 ? page.items : [...new Map([...previous.items, ...page.items].map((person) => [person.profileId, person])).values()],
        total: page.total, nextOffset: page.nextOffset, loading: false, error: null, canRetry: true,
      }));
      setCounts((previous) => ({ ...(previous.key === ownerKey ? previous : { key: ownerKey }), [kind]: page.total }));
    }).catch((error) => {
      if (currentKey.current !== key || request.current !== version) return;
      setState((previous) => ({ ...previous, loading: false, error: error instanceof SocialServiceError ? error.message : 'Couldn’t load this list. Please try again.', canRetry: !(error instanceof SocialServiceError) || isRetryableSocialCode(error.code) }));
    }).finally(() => {
      if (request.current === version) busy.current = false;
    });
  }, [social, profileId, kind, key, ownerKey]);

  useEffect(() => {
    load();
    return () => { request.current += 1; busy.current = false; };
  }, [load]);

  const current = state.key === key ? state : empty(key);
  return {
    ...current,
    counts: counts.key === ownerKey ? counts : { key: ownerKey },
    retry: () => load(current.items.length > 0 ? current.nextOffset ?? 0 : 0),
    loadMore: () => { if (!busy.current && current.nextOffset !== null) load(current.nextOffset); },
  };
}
