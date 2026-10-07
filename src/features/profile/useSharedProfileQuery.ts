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
  const scope = useMemo(() => ({ profileId, profiles, projects, accountId, revision, attempt, bundle: null as Promise<Profile> | null }),
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
    setState({ scope, key, profile: null, status: 'loading', error: null });
    if (!scope.bundle) scope.bundle = profiles.getSharedProfile
      ? profiles.getSharedProfile(profileId) : profiles.getProfile(profileId);
    void scope.bundle.then(async bundle => {
      if (cancelled || currentScope.current !== scope) return bundle;
      if (bundle.isPrivate) throw new Error('That creator profile could not be found.');
      if (!projectId) return bundle;
      const selected = bundle.projects.find(project => project.id === projectId && project.categoryId === categoryId);
      if (!selected) return bundle; // Existing route handles truthful project-not-found.
      const view = await projects.getProjectView(projectId);
      if (view.creator.id !== bundle.id || view.creator.isPrivate || view.project.isPubliclyVisible === false || view.project.categoryId !== categoryId) throw new Error('That project could not be found.');
      return { ...bundle, projects: bundle.projects.map(project => project.id === projectId ? view.project : project) };
    }).then(profile => {
      if (!cancelled && currentScope.current === scope) setState({ scope, key, profile, status: 'ready', error: null });
    }, (error: unknown) => {
      if (!cancelled && currentScope.current === scope) {
        const message = error instanceof Error ? error.message : 'The shared portfolio could not be loaded.';
        setState({ scope, key, profile: null, status: /not found|could not be found|invalid input syntax for type uuid/i.test(message) ? 'not-found' : 'error', error: message });
      }
    });
    return () => { cancelled = true; };
  }, [scope, key, profileId, projectId, categoryId, profiles, projects]);
  const current = state.scope === scope && state.key === key;
  return { profile: current ? state.profile : null, status: profileId ? current ? state.status : 'loading' : 'idle',
    error: current ? state.error : null, retry: () => setAttempt(value => value + 1) };
}
