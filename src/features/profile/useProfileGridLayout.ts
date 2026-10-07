import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import type { Profile } from '../../types/domain';

type Layout = Pick<Profile, 'id' | 'projectGridColumns'>;
type State = { layout: Layout | null; status: 'idle' | 'loading' | 'ready' | 'error'; error: string | null };

/** Home needs only the saved density. Never insert this small record into the
 * full-profile cache used by headers, editing, visitors and arrangement. */
export function useProfileGridLayout(profileId: string | null) {
  const { profiles } = useServices();
  const { revision } = useProfileData();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ layout: null, status: 'idle', error: null });
  useEffect(() => {
    if (!profileId) { setState({ layout: null, status: 'idle', error: null }); return; }
    let current = true;
    setState(previous => ({ layout: previous.layout?.id === profileId ? previous.layout : null, status: 'loading', error: null }));
    const read = profiles.getProjectGridLayout
      ? profiles.getProjectGridLayout(profileId)
      : profiles.getProfile(profileId).then(profile => ({ id: profile.id, projectGridColumns: profile.projectGridColumns }));
    read.then(layout => {
      if (current) setState({ layout, status: 'ready', error: null });
    }).catch(error => {
      if (current) setState(previous => ({ ...previous, status: 'error', error: error instanceof Error ? error.message : 'Your project layout could not be loaded.' }));
    });
    return () => { current = false; };
  }, [profiles, profileId, revision, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { ...state, layout: state.layout?.id === profileId ? state.layout : null, retry };
}
