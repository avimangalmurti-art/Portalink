import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import type { Profile } from '../../types/domain';

type Layout = Pick<Profile, 'id' | 'projectGridColumns'>;
type State = { layout: Layout | null; status: 'idle' | 'loading' | 'ready' | 'error'; error: string | null };
type Identity = { scope: object; profiles: object; profileId: string | null; revision: number };
type ScopedState = State & { identity: Identity };
type LayoutCacheEntry = { layout?: Layout; request?: Promise<Layout> };

const layoutCache = new WeakMap<object, WeakMap<object, Map<string, LayoutCacheEntry>>>();
const MAX_LAYOUT_SNAPSHOTS = 12;

function getLayoutCacheEntry(scope: object, profiles: object, profileId: string, revision: number): LayoutCacheEntry {
  let services = layoutCache.get(scope);
  if (!services) { services = new WeakMap(); layoutCache.set(scope, services); }
  let entries = services.get(profiles);
  if (!entries) { entries = new Map(); services.set(profiles, entries); }
  const key = JSON.stringify([profileId, revision]);
  const entry = entries.get(key) ?? {};
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > MAX_LAYOUT_SNAPSHOTS) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
  return entry;
}

/** Home needs only the saved density. Never insert this small record into the
 * full-profile cache used by headers, editing, visitors and arrangement. */
export function useProfileGridLayout(profileId: string | null) {
  const { profiles } = useServices();
  const { revision, scope } = useProfileData();
  const identity = useMemo(() => ({ scope, profiles, profileId, revision }), [scope, profiles, profileId, revision]);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const entry = profileId ? getLayoutCacheEntry(scope, profiles, profileId, revision) : null;
  const [attempt, setAttempt] = useState(0);
  const handledAttempt = useRef(0);
  const [state, setState] = useState<ScopedState>(() => ({ identity, layout: entry?.layout ?? null, status: entry?.layout ? 'ready' : 'idle', error: null }));
  // Mask a departing account/service/profile synchronously. A new revision may
  // retain this same profile's density while its confirmed write is reconciled.
  const retainedLayout = state.identity.scope === scope && state.identity.profiles === profiles && state.identity.profileId === profileId
    ? state.layout : null;
  const visible: State = !profileId ? { layout: null, status: 'idle', error: null }
    : state.identity === identity ? state
    : entry?.layout ? { layout: entry.layout, status: 'ready', error: null }
    : { layout: retainedLayout, status: 'loading', error: null };
  const visibleLayout = useRef(visible.layout);
  visibleLayout.current = visible.layout;
  useEffect(() => {
    const force = attempt !== handledAttempt.current;
    handledAttempt.current = attempt;
    if (!profileId || !entry) { setState({ identity, layout: null, status: 'idle', error: null }); return; }
    if (entry.layout && !entry.request && !force) {
      setState({ identity, layout: entry.layout, status: 'ready', error: null });
      return;
    }
    let current = true;
    const retained = visibleLayout.current;
    setState({ identity, layout: retained, status: 'loading', error: null });
    if (!entry.request || force) {
      const request = Promise.resolve().then(() => profiles.getProjectGridLayout
        ? profiles.getProjectGridLayout(profileId)
        : profiles.getProfile(profileId).then(profile => ({ id: profile.id, projectGridColumns: profile.projectGridColumns }))
      ).then(layout => {
        if (layout.id !== profileId) throw new Error('Your project layout could not be loaded.');
        if (entry.request === request) { entry.layout = layout; delete entry.request; }
        return layout;
      }, error => { if (entry.request === request) delete entry.request; throw error; });
      entry.request = request;
    }
    const read = entry.request;
    read.then(layout => {
      if (current && currentIdentity.current === identity) setState({ identity, layout, status: 'ready', error: null });
    }).catch(error => {
      if (entry.request === read) delete entry.request;
      if (current && currentIdentity.current === identity) setState({ identity, layout: retained, status: 'error', error: error instanceof Error ? error.message : 'Your project layout could not be loaded.' });
    });
    return () => { current = false; };
  }, [identity, profiles, profileId, entry, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { status: visible.status, error: visible.error, layout: visible.layout?.id === profileId ? visible.layout : null, retry };
}
