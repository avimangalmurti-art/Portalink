import { useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { weeklyGate } from './readSignal';

/** A visit, not a scheduler. D1's owner/project/week key makes retries harmless. */
export function useWeeklyReadSignal() {
  const { reads } = useServices();
  const { user } = useAuth();
  const account = user?.id;
  useEffect(() => {
    if (!account || !reads) return;
    let completed = '', pending = false, current = true;
    const visit = () => {
      const week = weeklyGate(new Date());
      if (!current || !week || pending || week === completed || document.visibilityState !== 'visible') return;
      pending = true;
      void reads.weekly(week).then(() => { completed = week; }).catch(() => undefined).finally(() => { pending = false; });
    };
    visit();
    window.addEventListener('focus', visit);
    document.addEventListener('visibilitychange', visit);
    return () => { current = false; window.removeEventListener('focus', visit); document.removeEventListener('visibilitychange', visit); };
  }, [account, reads]);
}
