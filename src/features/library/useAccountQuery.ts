import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { readAccountQuerySnapshot, removeAccountQuerySnapshot, writeAccountQuerySnapshot, type AccountQueryCacheOptions } from './accountQueryCache';

/** Never display a previous account's response, including during sign-out. */
export function useAccountQuery<T>(query: () => Promise<T>, cache?: AccountQueryCacheOptions) {
  const auth = useAuth();
  const account = auth.isAuthenticated === false ? null : auth.user?.id ?? null;
  const session = cache && auth.session?.user.id === account ? auth.session : null;
  const key = cache?.key ?? null;
  const service = cache?.scope ?? null;
  const identity = useMemo(() => ({ account, session, key, service }), [account, session, key, service]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ account: string; identity: typeof identity; query: typeof query; data?: T; error?: string; fetchedAt?: number } | null>(null);
  const [refresh, setRefresh] = useState<typeof identity | null>(null);
  useEffect(() => {
    let current = true;
    setResult(null);
    setRefresh(account ? identity : null);
    if (account) void query().then((data) => {
      if (!current || currentIdentity.current !== identity) return;
      const fetchedAt = Date.now();
      if (session && service && key !== null) writeAccountQuerySnapshot(session, service, key, { data, fetchedAt });
      setResult({ account, identity, query, data, fetchedAt });
      setRefresh(null);
    }).catch((error: unknown) => {
      if (!current || currentIdentity.current !== identity) return;
      // A failed permission check must not leave a private snapshot visible.
      if (session && service && key !== null) removeAccountQuerySnapshot(session, service, key);
      setResult({ account, identity, query, error: error instanceof Error ? error.message : 'Unable to load. Please try again.' });
      setRefresh(null);
    });
    return () => { current = false; };
  }, [account, identity, query, attempt, session, service, key]);
  const response = result?.account === account && result?.query === query && result?.identity === identity ? result : null;
  const snapshot = account && session && service && key !== null ? readAccountQuerySnapshot<T>(session, service, key) : undefined;
  const visible = response ?? snapshot;
  return {
    data: visible?.data,
    error: response?.error,
    fetchedAt: visible?.fetchedAt ?? null,
    loading: !!account && !visible,
    refreshing: !!account && refresh === identity,
    retry: () => setAttempt((n) => n + 1),
  };
}
