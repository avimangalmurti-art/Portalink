import { useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData, useProfileQuery, type ProfileQuery } from '../../contexts/ProfileDataContext';
import type { ProjectView } from '../../types/domain';
import { usePresentation } from '../../presentation/usePresentation';

/** Overview navigation never prepares media belonging to unopened projects. */
export function useProfileProjectQuery(profileId: string | null, projectId: string | null, categoryId: string | null): ProfileQuery {
  const overview = useProfileQuery(profileId, 'overview');
  const { scope, revision, peekProfile } = useProfileData();
  const { projects } = useServices();
  const cache = useMemo(() => ({ scope, revision, projects, views: new Map<string, ProjectView>(), pending: new Map<string, Promise<ProjectView>>() }), [scope, revision, projects]);
  const key = `${profileId ?? ''}/${categoryId ?? ''}/${projectId ?? ''}`;
  const isMobile = usePresentation() === 'mobile';
  const selected = overview.profile?.id === profileId ? overview.profile.projects.find(project => project.id === projectId && project.categoryId === categoryId) : undefined;
  const fullProfile = profileId ? peekProfile(profileId, 'full') : null;
  const cachedView = cache.views.get(key);
  const prepared = useMemo(() => {
    if (cachedView) return cachedView;
    const project = selected && fullProfile?.id === profileId ? fullProfile.projects.find(candidate => candidate.id === projectId && candidate.categoryId === categoryId) : undefined;
    return project && fullProfile ? { creator: fullProfile, project } : undefined;
  }, [cachedView, selected, fullProfile, profileId, projectId, categoryId]);
  // The existing cross-project mobile video sequence fills in after the selected reader is ready.
  const videoProfile = useProfileQuery(isMobile && overview.status === 'ready' && selected && prepared?.project.attachments?.some(attachment => attachment.kind === 'video') ? profileId : null, 'full');
  const detailedProfile = useMemo(() => prepared && overview.profile ? {
    ...overview.profile,
    projects: (fullProfile?.id === profileId ? fullProfile.projects : videoProfile.status === 'ready' && videoProfile.profile?.id === profileId ? videoProfile.profile.projects : overview.profile.projects).map(project => project.id === projectId ? prepared.project : project),
  } : null, [prepared, overview.profile, fullProfile, videoProfile.status, videoProfile.profile, profileId, projectId]);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<{ cache: typeof cache; key: string; error: string } | null>(null);
  const [, refresh] = useState(0);
  const current = useRef({ cache, key });
  current.current = { cache, key };
  useEffect(() => {
    // A canonical project address can prepare its selected media alongside the
    // overview. The overview still confirms membership before anything renders.
    const canPrepare = overview.status === 'loading' || (overview.status === 'ready' && Boolean(selected));
    if (!profileId || !projectId || !categoryId || !canPrepare || prepared || (failure?.cache === cache && failure.key === key)) return;
    let active = true;
    setFailure(null);
    if (!cache.pending.has(key)) {
      const request = projects.getProjectView(projectId).then(view => {
        if (view.creator.id !== profileId || view.project.id !== projectId || view.project.categoryId !== categoryId) throw new Error('That project could not be found.');
        if (current.current.cache !== cache) return view;
        const oldest = cache.views.keys().next().value;
        if (cache.views.size >= 16 && oldest !== undefined) cache.views.delete(oldest);
        cache.views.set(key, view);
        return view;
      });
      cache.pending.set(key, request);
      const clear = () => { if (cache.pending.get(key) === request) cache.pending.delete(key); };
      void request.then(clear, clear);
    }
    const pending = cache.pending.get(key);
    if (!pending) return;
    void pending.then(() => {
      if (active && current.current.cache === cache && current.current.key === key) refresh(value => value + 1);
    }, error => {
      if (active && current.current.cache === cache && current.current.key === key) setFailure({ cache, key, error: error instanceof Error ? error.message : 'That project could not be read.' });
    });
    return () => { active = false; };
  }, [cache, key, profileId, projectId, categoryId, selected, overview.status, projects, prepared, failure, attempt]);
  if (!projectId || overview.status !== 'ready' || !selected || !overview.profile) return overview;
  const error = failure?.cache === cache && failure.key === key ? failure.error : null;
  return {
    profile: detailedProfile,
    status: prepared ? 'ready' : error ? /not found|could not be found|invalid input syntax for type uuid/i.test(error) ? 'not-found' : 'error' : 'loading',
    error,
    retry: () => { cache.views.delete(key); setFailure(null); setAttempt(value => value + 1); },
  };
}
