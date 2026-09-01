import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useAuth } from '../../contexts/AuthContext';
import type { AsyncStatus, FeedCreator, Id, ProjectView } from '../../types/domain';
import type { ContentSphere, HomeFeedMode } from '../../types/discovery';

/**
 * The Home feed's data boundary.
 *
 * Curation and ranking come from `DiscoveryService`; every project it returns is
 * a canonical record resolved through `ProjectService`. The feed therefore never
 * holds its own copy of project metadata, and newly published work appears here
 * as soon as the profile data revision advances.
 */
export type FeedState = {
  status: AsyncStatus;
  /**
   * The curated hero, resolved canonically like every other project here. Null is
   * a real answer, not a failure: it means the curation no longer names a project
   * that exists. Nothing is substituted in its place.
   */
  featured: ProjectView | null;
  projects: ProjectView[];
  creators: FeedCreator[];
  sphere: ContentSphere | null;
  homeMode: HomeFeedMode;
  isSavingHomeMode: boolean;
  homeModeError: string | null;
  setHomeMode: (mode: HomeFeedMode) => void;
  error: string | null;
  isEmpty: boolean;
  retry: () => void;
};

type FeedSnapshot = Pick<FeedState, 'featured' | 'projects' | 'creators' | 'sphere' | 'homeMode'>;
type FeedCacheEntry = {
  snapshot?: FeedSnapshot;
  cachedAt?: number;
  request?: Promise<FeedSnapshot>;
};

// Home paints immediately from the last complete snapshot, then refreshes on
// every mount. Relationship changes happen away from Home (on a creator's
// profile), so a time-only freshness window could hide a newly followed or
// unfollowed creator when the viewer returned to the feed.
const feedCache = new WeakMap<object, Map<string, FeedCacheEntry>>();

function getFeedCacheEntry(discovery: object, cacheKey: string): FeedCacheEntry {
  let revisions = feedCache.get(discovery);
  if (!revisions) {
    revisions = new Map<string, FeedCacheEntry>();
    feedCache.set(discovery, revisions);
  }
  let entry = revisions.get(cacheKey);
  if (!entry) {
    entry = {};
    revisions.set(cacheKey, entry);
  }
  return entry;
}

export function useFeed(locationId?: Id): FeedState {
  const {
    discovery
  } = useServices();
  const {
    revision
  } = useProfileData();
  const accountId = useAuth().user?.id ?? 'guest';
  const cacheKey = `${accountId}:${revision}:${locationId ?? 'home'}`;
  const initialSnapshot = getFeedCacheEntry(discovery, cacheKey).snapshot;
  const [status, setStatus] = useState<AsyncStatus>(initialSnapshot ? 'success' : 'idle');
  const [featured, setFeatured] = useState<ProjectView | null>(initialSnapshot?.featured ?? null);
  const [projects, setProjects] = useState<ProjectView[]>(initialSnapshot?.projects ?? []);
  const [creators, setCreators] = useState<FeedCreator[]>(initialSnapshot?.creators ?? []);
  const [sphere, setSphere] = useState<ContentSphere | null>(initialSnapshot?.sphere ?? null);
  const [homeMode, setHomeModeState] = useState<HomeFeedMode>(initialSnapshot?.homeMode ?? 'balanced');
  const [isSavingHomeMode, setIsSavingHomeMode] = useState(false);
  const [homeModeError, setHomeModeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let isCurrent = true;
    const entry = getFeedCacheEntry(discovery, cacheKey);
    const cachedSnapshot = entry.snapshot;
    if (cachedSnapshot) {
      setFeatured(cachedSnapshot.featured);
      setProjects(cachedSnapshot.projects);
      setCreators(cachedSnapshot.creators);
      setSphere(cachedSnapshot.sphere);
      setHomeModeState(cachedSnapshot.homeMode);
      setStatus('success');
    } else {
      setStatus('loading');
    }
    setError(null);
    // Home ranking and its sphere resolve atomically. A location feed is a
    // different placement query entirely: it never borrows Home relationships.
    if (!entry.request || attempt > 0) {
      entry.request = locationId
        ? discovery.listLocationProjects(locationId).then((projects) => ({
            featured: null,
            projects,
            creators: [],
            sphere: null,
            homeMode: 'balanced' as HomeFeedMode,
          }))
        : discovery.getHomeDiscovery().then((home) => ({
            featured: home.featured,
            projects: home.projects,
            // Home is a work feed. A creator is not inserted as a second card beside
            // the projects already attributed to them.
            creators: [],
            sphere: home.sphere,
            homeMode: home.homeMode,
          }));
    }
    const request = entry.request;
    request.then((snapshot) => {
      entry.snapshot = snapshot;
      entry.cachedAt = Date.now();
      if (entry.request === request) {
        delete entry.request;
      }
      if (!isCurrent) {
        return;
      }
      setFeatured(snapshot.featured);
      setProjects(snapshot.projects);
      setCreators(snapshot.creators);
      setSphere(snapshot.sphere);
      setHomeModeState(snapshot.homeMode);
      setStatus('success');
    }).catch((caught) => {
      if (entry.request === request) {
        delete entry.request;
      }
      if (!isCurrent) {
        return;
      }
      // Stale-while-revalidate: a background refresh failure does not blank a
      // complete feed the user was already viewing.
      if (cachedSnapshot) {
        setStatus('success');
        return;
      }
      // Nothing is substituted on failure: the feed reports that it could not be
      // loaded rather than falling back to content nobody curated.
      setFeatured(null);
      setProjects([]);
      setCreators([]);
      setSphere(null);
      setError(caught instanceof Error ? caught.message : 'The feed could not be loaded.');
      setStatus('error');
    });
    return () => {
      isCurrent = false;
    };
  }, [discovery, cacheKey, attempt, locationId]);
  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);
  const setHomeMode = useCallback((mode: HomeFeedMode) => {
    const previousMode = homeMode;
    setHomeModeState(mode);
    setHomeModeError(null);
    setIsSavingHomeMode(true);
    discovery.setHomeFeedMode(mode).then((home) => {
      const snapshot: FeedSnapshot = {
        featured: home.featured,
        projects: home.projects,
        creators: [],
        sphere: home.sphere,
        homeMode: home.homeMode,
      };
      const entry = getFeedCacheEntry(discovery, cacheKey);
      entry.snapshot = snapshot;
      entry.cachedAt = Date.now();
      setFeatured(snapshot.featured);
      setProjects(snapshot.projects);
      setCreators(snapshot.creators);
      setSphere(snapshot.sphere);
      setHomeModeState(snapshot.homeMode);
    }).catch((caught) => {
      setHomeModeState(previousMode);
      setHomeModeError(caught instanceof Error ? caught.message : 'Your Home preference could not be saved.');
    }).finally(() => setIsSavingHomeMode(false));
  }, [discovery, homeMode, cacheKey]);
  return {
    status,
    featured,
    projects,
    creators,
    sphere,
    homeMode,
    isSavingHomeMode,
    homeModeError,
    setHomeMode,
    error,
    isEmpty: status === 'success' && projects.length === 0 && featured === null,
    retry
  };
}
