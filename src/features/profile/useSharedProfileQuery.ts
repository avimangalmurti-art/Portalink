import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData, type ProfileQuery } from '../../contexts/ProfileDataContext';
import type { Profile } from '../../types/domain';

/** Public bundles never enter the owner's full-profile cache. Only the opened
 * document resolves its originals; the grid retains its small cover records. */
export function useSharedProfileQuery(profileId: string | null, projectId: string | null, categoryId: string | null): ProfileQuery {
  const { profiles, projects } = useServices();
  const accountId = useAuth().user?.id ?? null;
  const { revision } = useProfileData();
  const [attempt, setAttempt] = useState(0);
  const scope = useMemo(() => ({ profileId, profiles, projects, accountId, revision, attempt, bundle: null as Promise<Profile> | null, profile: null as Profile | null, views: new Map<string, Profile>() }),
    [profileId, profiles, projects, accountId, revision, attempt]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const key = `${profileId ?? ''}/${categoryId ?? ''}/${projectId ?? ''}`;
  const [state, setState] = useState<{ scope: typeof scope; key: string; profile: Profile | null; status: ProfileQuery['status']; error: string | null }>({
    scope, key, profile: null, status: 'idle', error: null,
  });
  useEffect(() => {
    let cancelled = false;
    if (!profileId) return;
    const cached = projectId ? scope.views.get(key) : scope.profile;
    if (cached) { setState({ scope, key, profile: cached, status: 'ready', error: null }); return; }
    setState({ scope, key, profile: null, status: 'loading', error: null });
    if (!scope.bundle) scope.bundle = profiles.getSharedProfile
      ? profiles.getSharedProfile(profileId) : profiles.getProfile(profileId);
    const confirmedSelection = scope.profile?.projects.find(project => project.id === projectId && project.categoryId === categoryId);
    // A first direct link starts both RLS-backed reads together. A confirmed
    // public bundle can refuse an absent project before preparing any media.
    // Capture rejection immediately even if the bundle is slower or navigation leaves.
    const selectedRequest = projectId && categoryId && (!scope.profile || (confirmedSelection && confirmedSelection.isPubliclyVisible !== false))
      ? Promise.resolve().then(() => projects.getProjectView(projectId)).then(view => ({ view }), (error: unknown) => ({ error })) : null;
    void scope.bundle.then(async bundle => {
      if (cancelled || currentScope.current !== scope) return bundle;
      if (bundle.id !== profileId || bundle.isPrivate) throw new Error('That creator profile could not be found.');
      scope.profile = bundle;
      if (!projectId) return bundle;
      const selected = bundle.projects.find(project => project.id === projectId && project.categoryId === categoryId);
      if (!selected) return bundle; // Existing route handles truthful project-not-found.
      if (selected.isPubliclyVisible === false || !selectedRequest) throw new Error('That project could not be found.');
      const result = await selectedRequest;
      if (cancelled || currentScope.current !== scope) return bundle;
      if ('error' in result) throw result.error;
      const { view } = result;
      if (view.creator.id !== bundle.id || view.creator.isPrivate || view.project.id !== projectId || view.project.isPubliclyVisible === false || view.project.categoryId !== categoryId) throw new Error('That project could not be found.');
      const detailed = { ...bundle, projects: bundle.projects.map(project => project.id === projectId ? view.project : project) };
      const oldest = scope.views.keys().next().value;
      if (scope.views.size >= 16 && oldest !== undefined) scope.views.delete(oldest);
      scope.views.set(key, detailed);
      return detailed;
    }).then(profile => {
      if (!cancelled && currentScope.current === scope) setState({ scope, key, profile, status: 'ready', error: null });
    }, (error: unknown) => {
      if (!cancelled && currentScope.current === scope) {
        const message = error instanceof Error ? error.message : 'The shared catalogue could not be loaded.';
        setState({ scope, key, profile: null, status: /not found|could not be found|invalid input syntax for type uuid/i.test(message) ? 'not-found' : 'error', error: message });
      }
    });
    return () => { cancelled = true; };
  }, [scope, key, profileId, projectId, categoryId, profiles, projects]);
  const current = state.scope === scope && state.key === key;
  const cached = projectId ? scope.views.get(key) : scope.profile;
  return { profile: current ? state.profile : cached ?? null, status: profileId ? current ? state.status : cached ? 'ready' : 'loading' : 'idle',
    error: current ? state.error : null, retry: () => setAttempt(value => value + 1) };
}
