import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

/** Never display a previous account's response, including during sign-out. */
export function useAccountQuery<T>(query: () => Promise<T>) {
  const { user } = useAuth();
  const account = user?.id ?? null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ account: string; query: typeof query; data?: T; error?: string; fetchedAt?: number } | null>(null);
  useEffect(() => {
    let current = true;
    setResult(null);
    if (account) void query().then((data) => {
      if (current) setResult({ account, query, data, fetchedAt: Date.now() });
    }).catch((error: unknown) => {
      if (current) setResult({ account, query, error: error instanceof Error ? error.message : 'Unable to load. Please try again.' });
    });
    return () => { current = false; };
  }, [account, query, attempt]);
  const visible = result?.account === account && result?.query === query ? result : null;
  return {
    data: visible?.data,
    error: visible?.error,
    fetchedAt: visible?.fetchedAt ?? null,
    loading: !!account && !visible,
    retry: () => setAttempt((n) => n + 1),
  };
}
