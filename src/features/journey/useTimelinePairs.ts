import { useEffect, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { TimelinePair } from '../../services/interfaces';
import type { Profile } from '../../types/domain';
import { journeyAllowed, journeyProjects, readThenNow } from './journey';

export function useTimelinePairs(profile: Profile, owner: boolean) {
  const { profiles } = useServices();
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{ profile: Profile; owner: boolean; pairs: TimelinePair[]; order: string[]; error: string; orderError: string; loading: boolean }>({ profile, owner, pairs: [], order: [], error: '', orderError: '', loading: true });
  useEffect(() => {
    let current = true;
    if (!journeyAllowed(profile, owner) || !profiles.listTimelinePairs) {
      setState({ profile, owner, pairs: [], order: [], error: '', orderError: '', loading: false });
      return;
    }
    setState(previous => {
      // Keep the cards mounted during an owner refresh so edit focus and scroll survive.
      const retain = owner && previous.owner && previous.profile.id === profile.id;
      return { profile, owner, pairs: retain ? previous.pairs : [], order: retain ? previous.order : [], error: '', orderError: '', loading: true };
    });
    void Promise.allSettled([
      profiles.listTimelinePairs(profile.id),
      profiles.listTimelinePairOrder?.(profile.id) ?? Promise.resolve([]),
    ]).then(([rows, order]) => {
      if (!current) return;
      setState(previous => ({
        profile, owner, pairs: rows.status === 'fulfilled' ? rows.value : [],
        order: order.status === 'fulfilled' ? order.value : previous.order,
        error: rows.status === 'rejected' ? 'Additional Then/Now pairs could not be loaded.' : '',
        orderError: order.status === 'rejected' ? 'The Then/Now pair order could not be loaded.' : '',
        loading: false,
      }));
    });
    return () => { current = false; };
  }, [profile, owner, profiles, refresh]);
  const legacy = readThenNow(profile.thenNow);
  const available = new Set(journeyProjects(profile.projects, false).map(project => project.id));
  const currentResult = state.profile === profile && state.owner === owner;
  const retainedOwnerResult = owner && state.owner && state.profile.id === profile.id;
  const canUseResult = currentResult || retainedOwnerResult;
  const candidates = [...(legacy ? [{ id: 'legacy', ...legacy }] : []), ...(canUseResult ? state.pairs : [])];
  const seen = new Set<string>();
  const pairs = journeyAllowed(profile, owner) ? candidates.filter(pair => {
    const key = pair.then + ':' + pair.now;
    if (seen.has(key) || !available.has(pair.then) || !available.has(pair.now)) return false;
    seen.add(key); return true;
  }) : [];
  const positions = new Map((canUseResult ? state.order : []).map((id, index) => [id, index]));
  if (positions.size) pairs.sort((a, b) => (positions.get(a.id) ?? positions.size) - (positions.get(b.id) ?? positions.size));
  const reorder = profiles.reorderTimelinePairs;
  const saveOrder = owner && reorder ? async (pairIds: string[]) => {
    await reorder(profile.id, pairIds);
    setState(previous => previous.owner && previous.profile.id === profile.id ? { ...previous, order: pairIds } : previous);
    setRefresh(previous => previous + 1);
  } : undefined;
  return {
    pairs, error: currentResult ? state.error : '', orderError: currentResult ? state.orderError : '',
    loading: !currentResult || state.loading, saveOrder,
  };
}
