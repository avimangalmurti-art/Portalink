import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncStatus } from '../types/domain';

/**
 * The state model every server-backed action shares: idle → loading → success or
 * error, with a retry that repeats the last attempt.
 *
 * Presentational components take `status` and callbacks as props; this hook is
 * what feature-level components use to produce them.
 */
export type AsyncAction<Args extends unknown[]> = {
  status: AsyncStatus;
  error: string | null;
  isLoading: boolean;
  run: (...args: Args) => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
};
export function useAsyncAction<Args extends unknown[]>(action: (...args: Args) => Promise<unknown>): AsyncAction<Args> {
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const lastArgsRef = useRef<Args | null>(null);
  const generationRef = useRef(0);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);
  const run = useCallback(async (...args: Args) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    lastArgsRef.current = args;
    setStatus('loading');
    setError(null);
    try {
      await action(...args);
      if (!isMountedRef.current || generationRef.current !== generation) {
        return;
      }
      setStatus('success');
    } catch (caught) {
      if (!isMountedRef.current || generationRef.current !== generation) {
        return;
      }
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    }
  }, [action]);
  const retry = useCallback(async () => {
    if (lastArgsRef.current) {
      await run(...lastArgsRef.current);
    }
  }, [run]);
  const reset = useCallback(() => {
    generationRef.current += 1;
    lastArgsRef.current = null;
    setStatus('idle');
    setError(null);
  }, []);
  return {
    status,
    error,
    isLoading: status === 'loading',
    run,
    retry,
    reset
  };
}
