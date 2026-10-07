import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useAuth } from '../../contexts/AuthContext';
import type { AsyncStatus, FeedCreator, Id, ProjectView } from '../../types/domain';
import type { ContentSphere, HomeFeedMode, ProjectFeedCursor } from '../../types/discovery';

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
  /** Revalidation keeps the last complete feed visible. */
  isRefreshing: boolean;
  refreshError: string | null;
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
  nextCursor: ProjectFeedCursor | null;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  loadMore: () => void;
};

type FeedSnapshot = Pick<FeedState, 'featured' | 'projects' | 'creators' | 'sphere' | 'homeMode' | 'nextCursor'>;
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
const MAX_FEED_SNAPSHOTS = 12;
const FEED_SNAPSHOT_RETENTION_MS = 15 * 60_000;

function getFeedCacheEntry(discovery: object, cacheKey: string): FeedCacheEntry {
  let revisions = feedCache.get(discovery);
  if (!revisions) {
    revisions = new Map<string, FeedCacheEntry>();
    feedCache.set(discovery, revisions);
  }
  // Revision keys must not retain every historical project snapshot forever.
  // This is retention only: Home still revalidates on every mount so a changed
  // follow relationship is visible immediately when the user returns.
  for (const [key, cached] of revisions) {
    if (!cached.request && cached.cachedAt !== undefined && Date.now() - cached.cachedAt >= FEED_SNAPSHOT_RETENTION_MS) revisions.delete(key);
  }
  let entry = revisions.get(cacheKey);
  if (!entry) {
    entry = {};
    revisions.set(cacheKey, entry);
  }
  revisions.delete(cacheKey);
  revisions.set(cacheKey, entry);
  while (revisions.size > MAX_FEED_SNAPSHOTS) {
    const oldest = revisions.keys().next().value;
    if (oldest === undefined) break;
    revisions.delete(oldest);
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [nextCursor, setNextCursor] = useState<ProjectFeedCursor | null>(initialSnapshot?.nextCursor ?? null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadMoreRequest = useRef(0);
  const loadMoreBusy = useRef(false);
  const currentCacheKey = useRef(cacheKey);
  currentCacheKey.current = cacheKey;
  useEffect(() => {
    let isCurrent = true;
    loadMoreRequest.current += 1;
    loadMoreBusy.current = false;
    setIsLoadingMore(false);
    setLoadMoreError(null);
    const entry = getFeedCacheEntry(discovery, cacheKey);
    const cachedSnapshot = entry.snapshot;
    if (cachedSnapshot) {
      setFeatured(cachedSnapshot.featured);
      setProjects(cachedSnapshot.projects);
      setCreators(cachedSnapshot.creators);
      setSphere(cachedSnapshot.sphere);
      setHomeModeState(cachedSnapshot.homeMode);
      setNextCursor(cachedSnapshot.nextCursor);
      setStatus('success');
    } else {
      setStatus('loading');
      setNextCursor(null);
      setFeatured(null);
      setProjects([]);
      setCreators([]);
      setSphere(null);
    }
    setError(null);
    setIsRefreshing(true);
    setRefreshError(null);
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
            nextCursor: null,
          }))
        : discovery.getHomeDiscovery().then(async (first) => {
            // Back restores all pages the user already loaded. Refresh those
            // pages too, so unfollowed/deleted content is never retained merely
            // to preserve scroll height.
            let home = first;
            let projects = first.projects;
            const targetCount = cachedSnapshot?.projects.length ?? 0;
            const seenCursors = new Set<string>();
            while (home.nextCursor && projects.length < targetCount) {
              const cursorKey = JSON.stringify(home.nextCursor);
              if (seenCursors.has(cursorKey)) break;
              seenCursors.add(cursorKey);
              home = await discovery.getHomeDiscovery(home.nextCursor);
              projects = Array.from(new Map([...projects, ...home.projects].map((view) => [view.project.id, view])).values());
            }
            return {
              featured: first.featured,
              projects,
              // Home is a work feed, without a duplicate creator card.
              creators: [],
              sphere: first.sphere,
              homeMode: first.homeMode,
              nextCursor: home.nextCursor ?? null,
            };
          });
    }
    const request = entry.request;
    request.then((snapshot) => {
      if (entry.request === request) {
        entry.snapshot = snapshot;
        entry.cachedAt = Date.now();
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
      setNextCursor(snapshot.nextCursor);
      setStatus('success');
      setIsRefreshing(false);
    }).catch((caught) => {
      if (entry.request === request) {
        delete entry.request;
      }
      if (!isCurrent) {
        return;
      }
      setIsRefreshing(false);
      // Stale-while-revalidate: a background refresh failure does not blank a
      // complete feed the user was already viewing.
      if (cachedSnapshot) {
        setRefreshError('Could not refresh Home. Please try again.');
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
      loadMoreRequest.current += 1;
      loadMoreBusy.current = false;
    };
  }, [discovery, cacheKey, attempt, locationId]);
  const loadMore = useCallback(() => {
    const entry = getFeedCacheEntry(discovery, cacheKey);
    const snapshot = entry.snapshot;
    if (locationId || isRefreshing || loadMoreBusy.current || !snapshot?.nextCursor) return;
    const requestId = ++loadMoreRequest.current;
    loadMoreBusy.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    discovery.getHomeDiscovery(snapshot.nextCursor).then((home) => {
      if (currentCacheKey.current !== cacheKey || requestId !== loadMoreRequest.current || entry.snapshot !== snapshot) return;
      const merged: FeedSnapshot = { ...snapshot,
        projects: Array.from(new Map([...snapshot.projects, ...home.projects].map((view) => [view.project.id, view])).values()),
        nextCursor: home.nextCursor ?? null,
      };
      entry.snapshot = merged;
      entry.cachedAt = Date.now();
      setProjects(merged.projects);
      setNextCursor(merged.nextCursor);
    }).catch((caught) => {
      if (currentCacheKey.current === cacheKey && requestId === loadMoreRequest.current) {
        setLoadMoreError(caught instanceof Error ? caught.message : 'More projects could not be loaded. Please try again.');
      }
    }).finally(() => {
      if (requestId === loadMoreRequest.current) {
        loadMoreBusy.current = false;
        setIsLoadingMore(false);
      }
    });
  }, [discovery, cacheKey, locationId, isRefreshing]);
  const retry = useCallback(() => {
    setIsRefreshing(true);
    setRefreshError(null);
    setAttempt((count) => count + 1);
  }, []);
  const setHomeMode = useCallback((mode: HomeFeedMode) => {
    loadMoreRequest.current += 1;
    loadMoreBusy.current = false;
    setIsLoadingMore(false);
    const previousMode = homeMode;
    setHomeModeState(mode);
    setHomeModeError(null);
    setIsSavingHomeMode(true);
    discovery.setHomeFeedMode(mode).then((home) => {
      if (currentCacheKey.current !== cacheKey) return;
      const snapshot: FeedSnapshot = {
        featured: home.featured,
        projects: home.projects,
        creators: [],
        sphere: home.sphere,
        homeMode: home.homeMode,
        nextCursor: home.nextCursor ?? null,
      };
      const entry = getFeedCacheEntry(discovery, cacheKey);
      entry.snapshot = snapshot;
      entry.cachedAt = Date.now();
      setFeatured(snapshot.featured);
      setProjects(snapshot.projects);
      setCreators(snapshot.creators);
      setSphere(snapshot.sphere);
      setHomeModeState(snapshot.homeMode);
      setNextCursor(snapshot.nextCursor);
    }).catch((caught) => {
      if (currentCacheKey.current !== cacheKey) return;
      setHomeModeState(previousMode);
      setHomeModeError(caught instanceof Error ? caught.message : 'Your Home preference could not be saved.');
    }).finally(() => { if (currentCacheKey.current === cacheKey) setIsSavingHomeMode(false); });
  }, [discovery, homeMode, cacheKey]);
  return {
    status,
    isRefreshing,
    refreshError,
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
    retry,
    nextCursor,
    isLoadingMore,
    loadMoreError,
    loadMore,
  };
}
