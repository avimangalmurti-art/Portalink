import { useEffect, useRef, useState } from 'react';

export function useCatalogueCopyFeedback() {
  const [state, setState] = useState<'idle' | 'pending' | 'copied'>('idle');
  const [error, setError] = useState('');
  const attempt = useRef(0);
  const pending = useRef(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    attempt.current++;
    pending.current = false;
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = null;
  }, []);

  async function run(copy: () => unknown) {
    if (pending.current) return;
    pending.current = true;
    const current = ++attempt.current;
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = null;
    setError('');
    setState('pending');
    try {
      const copied = await copy();
      if (attempt.current !== current) return;
      if (copied !== true) {
        setState('idle');
        return;
      }
      setState('copied');
      resetTimer.current = window.setTimeout(() => {
        resetTimer.current = null;
        if (attempt.current === current) setState('idle');
      }, 2000);
    } catch (caught) {
      if (attempt.current === current) {
        setState('idle');
        setError(caught instanceof Error ? caught.message : 'Could not copy the link. Please try again.');
      }
    } finally {
      if (attempt.current === current) pending.current = false;
    }
  }

  return { state, error, run };
}
