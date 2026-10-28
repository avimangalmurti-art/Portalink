import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  request?: Promise<FeedSnapshot>;
};

// Navigation restores the last complete feed. Only an explicit refresh or a
// confirmed data revision replaces it; elapsed time is not refresh intent.
// Scope identity prevents a signed-out account's snapshot being reused on login.
const feedCache = new WeakMap<object, WeakMap<object, Map<string, FeedCacheEntry>>>();
const MAX_FEED_SNAPSHOTS = 12;

function getFeedCacheEntry(discovery: object, scope: object, cacheKey: string): FeedCacheEntry {
  let scopes = feedCache.get(discovery);
  if (!scopes) {
    scopes = new WeakMap<object, Map<string, FeedCacheEntry>>();
    feedCache.set(discovery, scopes);
  }
  let revisions = scopes.get(scope);
  if (!revisions) {
    revisions = new Map<string, FeedCacheEntry>();
    scopes.set(scope, revisions);
  }
  // Revision keys must not retain every historical project snapshot forever.
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

export function useFeed(locationId?: Id, { preserveSnapshotAcrossRevision = false }: {
  /** MOBILE retained screens keep their complete placement while canonical reads refresh. */
  preserveSnapshotAcrossRevision?: boolean;
} = {}): FeedState {
  const {
    discovery
  } = useServices();
  const {
    revision, scope
  } = useProfileData();
  const accountId = useAuth().user?.id ?? 'guest';
  const cacheKey = `${accountId}:${revision}:${locationId ?? 'home'}`;
  const placement = useMemo(() => ({ discovery, scope, accountId, locationId }), [discovery, scope, accountId, locationId]);
  const identity = useMemo(() => ({ discovery, scope, cacheKey, preserveSnapshotAcrossRevision }), [discovery, scope, cacheKey, preserveSnapshotAcrossRevision]);
  const completedPlacement = useRef<{ placement: typeof placement; snapshot: FeedSnapshot } | null>(null);
  const cachedInitialSnapshot = getFeedCacheEntry(discovery, scope, cacheKey).snapshot;
  // A revision is refresh intent, not a different account or placement. Keep
  // only this mounted screen's last confirmed feed; never carry it into a new
  // visibility scope, service, account, city, or the default WEB behavior.
  if (!preserveSnapshotAcrossRevision || completedPlacement.current?.placement !== placement) completedPlacement.current = null;
  if (preserveSnapshotAcrossRevision && cachedInitialSnapshot) completedPlacement.current = { placement, snapshot: cachedInitialSnapshot };
  const initialSnapshot = cachedInitialSnapshot ?? completedPlacement.current?.snapshot;
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
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const stateIdentity = useRef(identity);
  const handledAttempt = useRef(0);
  useEffect(() => {
    let isCurrent = true;
    stateIdentity.current = identity;
    const requestedRefresh = attempt !== handledAttempt.current;
    handledAttempt.current = attempt;
    const cleanup = () => {
      isCurrent = false;
      loadMoreRequest.current += 1;
      loadMoreBusy.current = false;
    };
    loadMoreRequest.current += 1;
    loadMoreBusy.current = false;
    setIsLoadingMore(false);
    setLoadMoreError(null);
    const entry = getFeedCacheEntry(discovery, scope, cacheKey);
    const retainedSnapshot = preserveSnapshotAcrossRevision && completedPlacement.current?.placement === placement
      ? completedPlacement.current.snapshot : undefined;
    const cachedSnapshot = entry.snapshot ?? retainedSnapshot;
    const revisionRefresh = !entry.snapshot && Boolean(retainedSnapshot);
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
      setHomeModeState('balanced');
    }
    setError(null);
    setRefreshError(null);
    setHomeModeError(null);
    setIsSavingHomeMode(false);
    if (cachedSnapshot && !requestedRefresh && !revisionRefresh && !entry.request) {
      setIsRefreshing(false);
      return cleanup;
    }
    setIsRefreshing(true);
    // Home ranking and its sphere resolve atomically. A location feed is a
    // different placement query entirely: it never borrows Home relationships.
    if (!entry.request || requestedRefresh) {
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
            // A refresh covers every page already loaded so it does not
            // truncate the feed or retain removed work on later pages.
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
        delete entry.request;
      }
      if (!isCurrent) {
        return;
      }
      if (preserveSnapshotAcrossRevision) completedPlacement.current = { placement, snapshot };
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
    return cleanup;
  }, [discovery, scope, cacheKey, identity, attempt, locationId, placement, preserveSnapshotAcrossRevision]);
  const loadMore = useCallback(() => {
    if (currentIdentity.current !== identity) return;
    const entry = getFeedCacheEntry(discovery, scope, cacheKey);
    const snapshot = entry.snapshot;
    if (locationId || isRefreshing || loadMoreBusy.current) return;
    if (!snapshot && preserveSnapshotAcrossRevision && completedPlacement.current?.placement === placement && completedPlacement.current.snapshot.nextCursor) {
      // A failed revision refresh still presents the retained feed's control.
      // Revalidate that placement before following any cursor from its old ranking.
      loadMoreBusy.current = true;
      setIsRefreshing(true);
      setRefreshError(null);
      setAttempt(count => count + 1);
      return;
    }
    if (!snapshot?.nextCursor) return;
    const requestId = ++loadMoreRequest.current;
    loadMoreBusy.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    discovery.getHomeDiscovery(snapshot.nextCursor).then((home) => {
      if (currentIdentity.current !== identity || requestId !== loadMoreRequest.current || entry.snapshot !== snapshot) return;
      const merged: FeedSnapshot = { ...snapshot,
        projects: Array.from(new Map([...snapshot.projects, ...home.projects].map((view) => [view.project.id, view])).values()),
        nextCursor: home.nextCursor ?? null,
      };
      entry.snapshot = merged;
      if (preserveSnapshotAcrossRevision) completedPlacement.current = { placement, snapshot: merged };
      setProjects(merged.projects);
      setNextCursor(merged.nextCursor);
    }).catch((caught) => {
      if (currentIdentity.current === identity && requestId === loadMoreRequest.current) {
        setLoadMoreError(caught instanceof Error ? caught.message : 'More projects could not be loaded. Please try again.');
      }
    }).finally(() => {
      if (requestId === loadMoreRequest.current) {
        loadMoreBusy.current = false;
        setIsLoadingMore(false);
      }
    });
  }, [discovery, scope, cacheKey, identity, locationId, isRefreshing, placement, preserveSnapshotAcrossRevision]);
  const retry = useCallback(() => {
    setIsRefreshing(true);
    setRefreshError(null);
    setAttempt((count) => count + 1);
  }, []);
  const setHomeMode = useCallback((mode: HomeFeedMode) => {
    if (currentIdentity.current !== identity) return;
    loadMoreRequest.current += 1;
    loadMoreBusy.current = false;
    setIsLoadingMore(false);
    const previousMode = homeMode;
    setHomeModeState(mode);
    setHomeModeError(null);
    setIsSavingHomeMode(true);
    discovery.setHomeFeedMode(mode).then((home) => {
      if (currentIdentity.current !== identity) return;
      const snapshot: FeedSnapshot = {
        featured: home.featured,
        projects: home.projects,
        creators: [],
        sphere: home.sphere,
        homeMode: home.homeMode,
        nextCursor: home.nextCursor ?? null,
      };
      const entry = getFeedCacheEntry(discovery, scope, cacheKey);
      entry.snapshot = snapshot;
      if (preserveSnapshotAcrossRevision) completedPlacement.current = { placement, snapshot };
      setFeatured(snapshot.featured);
      setProjects(snapshot.projects);
      setCreators(snapshot.creators);
      setSphere(snapshot.sphere);
      setHomeModeState(snapshot.homeMode);
      setNextCursor(snapshot.nextCursor);
    }).catch((caught) => {
      if (currentIdentity.current !== identity) return;
      setHomeModeState(previousMode);
      setHomeModeError(caught instanceof Error ? caught.message : 'Your Home preference could not be saved.');
    }).finally(() => { if (currentIdentity.current === identity) setIsSavingHomeMode(false); });
  }, [discovery, scope, homeMode, cacheKey, identity, placement, preserveSnapshotAcrossRevision]);
  // A departing account or placement must not paint its previous cards before
  // the new identity's effect runs.
  const currentState = stateIdentity.current === identity;
  const visible = currentState ? { featured, projects, creators, sphere, homeMode, nextCursor } : initialSnapshot;
  const visibleStatus = currentState ? status : initialSnapshot ? 'success' : 'idle';
  return {
    status: visibleStatus,
    isRefreshing: currentState && isRefreshing,
    refreshError: currentState ? refreshError : null,
    featured: visible?.featured ?? null,
    projects: visible?.projects ?? [],
    creators: visible?.creators ?? [],
    sphere: visible?.sphere ?? null,
    homeMode: visible?.homeMode ?? 'balanced',
    isSavingHomeMode: currentState && isSavingHomeMode,
    homeModeError: currentState ? homeModeError : null,
    setHomeMode,
    error: currentState ? error : null,
    isEmpty: visibleStatus === 'success' && (visible?.projects.length ?? 0) === 0 && !visible?.featured,
    retry,
    nextCursor: visible?.nextCursor ?? null,
    isLoadingMore: currentState && isLoadingMore,
    loadMoreError: currentState ? loadMoreError : null,
    loadMore,
  };
}
