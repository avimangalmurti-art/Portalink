import { useEffect, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { TimelinePair } from '../../services/interfaces';
import type { Profile } from '../../types/domain';
import { journeyAllowed, journeyProjects, readThenNow } from './journey';

export function useTimelinePairs(profile: Profile, owner: boolean) {
  const { profiles } = useServices();
  const [state, setState] = useState<{ profile: Profile; pairs: TimelinePair[]; error: string; loading: boolean }>({ profile, pairs: [], error: '', loading: true });
  useEffect(() => {
    let current = true;
    setState({ profile, pairs: [], error: '', loading: true });
    if (!journeyAllowed(profile, owner) || !profiles.listTimelinePairs) {
      setState({ profile, pairs: [], error: '', loading: false });
      return;
    }
    profiles.listTimelinePairs(profile.id).then(pairs => {
      if (current) setState({ profile, pairs, error: '', loading: false });
    }, () => { if (current) setState({ profile, pairs: [], error: 'Additional Then/Now pairs could not be loaded.', loading: false }); });
    return () => { current = false; };
  }, [profile, owner, profiles]);
  const legacy = readThenNow(profile.thenNow);
  const available = new Set(journeyProjects(profile.projects, false).map(project => project.id));
  const candidates = [...(legacy ? [{ id: 'legacy', ...legacy }] : []), ...(state.profile === profile ? state.pairs : [])];
  const seen = new Set<string>();
  const pairs = journeyAllowed(profile, owner) ? candidates.filter(pair => {
    const key = pair.then + ':' + pair.now;
    if (seen.has(key) || !available.has(pair.then) || !available.has(pair.now)) return false;
    seen.add(key); return true;
  }) : [];
  return { pairs, error: state.profile === profile ? state.error : '', loading: state.profile !== profile || state.loading };
}
