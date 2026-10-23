import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useServices } from '../contexts/ServicesContext';
import { handleFromPath, parseResolution, portfolioPath, type HandleResolution } from '../features/sharing/shareModel';
import type { AppRoute } from '../app/useAppRoute';
declare global { interface Window { __PORTALINK_HANDLE__?: HandleResolution } }
export function useHandleRoute(original: AppRoute): { route: AppRoute; pending: boolean; error: string; retry: () => void } {
  const location = useLocation(), navigate = useNavigate(), { profiles } = useServices(), handle = handleFromPath(location.pathname);
  const [error,setError] = useState<{ handle: string; message: string } | null>(null);
  const [attempt,setAttempt] = useState(0);
  const [state, setState] = useState<{ handle: string | null; value: HandleResolution | null; done: boolean }>(() => {
    const value = parseResolution(window.__PORTALINK_HANDLE__);
    return { handle, value: value && portfolioPath(value.profileId,value.handle) === `/${handle}` ? value : null, done: Boolean(value && portfolioPath(value.profileId,value.handle) === `/${handle}`) };
  });
  useEffect(() => {
    if (!handle) {
      setError(null);
      if (state.handle !== null) setState({ handle: null, value: null, done: false });
      return;
    }
    if (state.handle === handle && state.done) return;
    let active = true; setError(null);
    void profiles.resolvePublicHandle?.(handle).then(value => {
      if (!active) return;
      setState({ handle, value, done: true });
      if (value && portfolioPath(value.profileId,value.handle) !== `/${handle}`) navigate(portfolioPath(value.profileId, value.handle) + location.pathname.slice(handle.length + 1).replace(/\/$/, '') + location.search, { replace: true });
    }).catch(() => { if (active) { setState({ handle, value: null, done: true }); setError({ handle, message: 'This catalogue could not load. Please try again.' }); } });
    if (!profiles.resolvePublicHandle) setState({ handle, value: null, done: true });
    return () => { active = false; };
  }, [handle, state.handle, state.done, profiles, navigate, location.pathname, location.search, attempt]);
  const uuidProfileId = original.kind === 'sharedProfile' || original.kind === 'sharedCategory' || original.kind === 'sharedProject' || original.kind === 'sharedCollaboration' ? original.profileId : null;
  // SPA visits to old UUID roots use the same canonical address as HTTP redirects.
  useEffect(() => {
    if (handle || !uuidProfileId) return;
    let active = true;
    const suffix = location.pathname.slice(`/share/${uuidProfileId}`.length).replace(/\/$/, '');
    void profiles.getShareAddress?.(uuidProfileId).then(address => { if (active && address.handle) navigate(portfolioPath(uuidProfileId, address.handle) + suffix + location.search, { replace: true }); }).catch(() => undefined);
    return () => { active = false; };
  }, [handle, uuidProfileId, profiles, navigate, location.pathname, location.search]);
  const suffix = /^\/[^/]+\/c\/([a-z0-9_-]+)(?:\/([a-z0-9_-]+))?\/?$/i.exec(location.pathname);
  const resolved: AppRoute = handle && state.handle === handle && state.value ? suffix?.[2]
    ? { kind: 'sharedProject', profileId: state.value.profileId, categoryId: suffix[1], projectId: suffix[2] }
    : suffix?.[1] ? { kind: 'sharedCategory', profileId: state.value.profileId, categoryId: suffix[1] }
    : location.pathname.endsWith('/collaboration') ? { kind: 'sharedCollaboration', profileId: state.value.profileId }
    : { kind: 'sharedProfile', profileId: state.value.profileId } : original;
  return { error: handle && error?.handle === handle ? error.message : '', retry: () => { setState(current => ({...current,done:false})); setAttempt(n=>n+1); }, route: resolved, pending: Boolean(handle && (state.handle !== handle || !state.done)) };
}
