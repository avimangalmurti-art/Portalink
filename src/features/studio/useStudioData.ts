import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { useEngagementStore } from '../../contexts/EngagementContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useActivityCollection } from '../engagement/useActivityCollection';
import { useAccountQuery } from '../library/useAccountQuery';
import { loadSavedCreators, loadSavedPageBatch, type ResolvedSavedPageBatch } from '../library/collectionQueries';
import { removeSavedPage, savedPageKey } from '../library/savedPages';
import { useNotifications } from '../messages/useNotifications';
import {
  activityStudioRows, publishedStudioRows, savedCreatorStudioRows, savedPageStudioRows,
  savedProjectStudioRows, studioSections, type StudioBookmarkTab, type StudioCategory, type StudioRow,
} from './studioModel';

type PageProgress = {
  base: ResolvedSavedPageBatch;
  account: string | null;
  batch: ResolvedSavedPageBatch;
  loading: boolean;
  error: string | null;
};

/** Private Studio presentation over the same account collections as Saved/Inbox. */
export function useStudioData(category: StudioCategory = 'bookmarks', tab: StudioBookmarkTab = 'projects', { mobileActivity = false, prioritizeActiveCollection = false }: { mobileActivity?: boolean; prioritizeActiveCollection?: boolean } = {}) {
  const auth = useAuth();
  const account = auth.user?.id ?? null;
  const services = useServices();
  const engagementStore = useEngagementStore();
  const { revision } = useProfileData();
  const activeCollection = category === 'bookmarks' ? tab : category;
  const visited = useMemo(() => ({ account, prioritizeActiveCollection, collections: new Set<StudioCategory | StudioBookmarkTab>() }), [account, prioritizeActiveCollection]);
  useEffect(() => {
    if (visited.account && visited.prioritizeActiveCollection) visited.collections.add(activeCollection);
  }, [activeCollection, visited]);
  // Open the current view first on desktop. Keep collections that have already
  // been opened live so switching back retains their results and pagination.
  const wants = (collection: StudioCategory | StudioBookmarkTab) => !prioritizeActiveCollection || activeCollection === collection || visited.collections.has(collection);
  const wantsPublished = wants('published');
  const wantsCreators = wants('creators');
  const wantsPages = wants('pages');
  const publishedScope = useMemo(() => ({ profileId: auth.viewerProfileId, revision }), [auth.viewerProfileId, revision]);
  const publishedQuery = useCallback(() => wantsPublished && publishedScope.profileId ? services.profiles.getProfile(publishedScope.profileId) : Promise.resolve(null), [publishedScope, services.profiles, wantsPublished]);
  const creatorsQuery = useCallback(() => wantsCreators ? loadSavedCreators(services.creatorSaves, services.profiles) : Promise.resolve([]), [services.creatorSaves, services.profiles, wantsCreators]);
  const pagesQuery = useCallback(() => wantsPages ? loadSavedPageBatch(services.projects, null) : Promise.resolve(null), [services.projects, wantsPages]);
  const published = useAccountQuery(publishedQuery);
  const creators = useAccountQuery(creatorsQuery);
  const pages = useAccountQuery(pagesQuery);
  const savedProjects = useActivityCollection('save', auth.isAuthenticated && wants('projects'));
  const activity = useNotifications({ mobileContinuity: mobileActivity });

  const scope = useMemo(() => ({ account, services, removed: new Set<string>(), pending: new Set<string>(), error: null as string | null }), [account, services]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const mounted = useRef(true);
  const [, renderMutation] = useState(0);
  const [pageProgress, setPageProgress] = useState<PageProgress | null>(null);
  const pageSource = useRef({ account, base: pages.data });
  pageSource.current = { account, base: pages.data };
  const pageFlight = useRef<object | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pageFlight.current = null; };
  }, []);
  const isCurrent = () => mounted.current && scopeRef.current === scope && Boolean(account);
  const currentPages = pageProgress?.base === pages.data && pageProgress?.account === account ? pageProgress : null;
  const pageBatch = currentPages?.batch ?? pages.data;
  const allRows = [
    ...publishedStudioRows(published.data),
    ...savedProjectStudioRows(savedProjects.items),
    ...savedPageStudioRows(pageBatch?.items ?? []),
    ...savedCreatorStudioRows(creators.data ?? []),
    ...activityStudioRows(activity.notifications),
  ].filter(row => !scope.removed.has(row.id));
  const currentRows = useRef(allRows);
  currentRows.current = allRows;
  const sections = studioSections(allRows, category, tab);
  const rows = sections.flatMap(section => section.rows);

  const checks: Array<{ loading: boolean; error?: string | null; at: number | null }> = [];
  if (category === 'published') checks.push({ loading: published.loading, error: published.error, at: published.fetchedAt });
  if (category === 'bookmarks' && tab === 'projects') checks.push({ loading: savedProjects.phase === 'loading', error: savedProjects.error, at: savedProjects.updatedAt });
  if (category === 'bookmarks' && tab === 'pages') checks.push({ loading: pages.loading, error: pages.error, at: pages.fetchedAt });
  if (category === 'bookmarks' && tab === 'creators') checks.push({ loading: creators.loading, error: creators.error, at: creators.fetchedAt });
  if (category === 'activity') checks.push({ loading: activity.status === 'loading' || activity.status === 'idle', error: activity.error, at: activity.updatedAt });
  const error = checks.map(check => check.error).filter(Boolean).join(' ') || null;
  const status = error ? 'error' as const : checks.some(check => check.loading) ? 'loading' as const : 'ready' as const;
  const times = checks.flatMap(check => check.at === null ? [] : [check.at]);
  // Never imply that a failed or not-yet-completed request refreshed this screen.
  const activityRefreshing = mobileActivity && category === 'activity' && activity.isRefreshing;
  const updatedAt = status === 'ready' && !activityRefreshing && times.length ? Math.min(...times) : null;

  async function loadMore() {
    const base = pages.data;
    const cursor = pageBatch?.nextCursor;
    if (!isCurrent() || !base || !cursor || currentPages?.loading || pageFlight.current) return;
    const flight = {};
    pageFlight.current = flight;
    const batch = pageBatch ?? base;
    setPageProgress({ base, account, batch, loading: true, error: null });
    try {
      const next = await loadSavedPageBatch(services.projects, cursor);
      if (!isCurrent() || pageSource.current.base !== base || pageSource.current.account !== account || pageFlight.current !== flight) return;
      const entries = new Map(batch.items.map(entry => [savedPageKey(entry.target), entry]));
      next.items.forEach(entry => entries.set(savedPageKey(entry.target), entry));
      setPageProgress({ base, account, batch: { items: [...entries.values()], nextCursor: next.nextCursor }, loading: false, error: null });
    } catch (caught) {
      if (isCurrent() && pageSource.current.base === base && pageFlight.current === flight) {
        setPageProgress({ base, account, batch, loading: false, error: caught instanceof Error ? caught.message : 'More saved pages could not be loaded.' });
      }
    } finally {
      if (pageFlight.current === flight) pageFlight.current = null;
    }
  }

  async function unsave(row: StudioRow): Promise<boolean> {
    if (!isCurrent() || !row.kind.startsWith('saved-') || scope.pending.has(row.id) || !allRows.some(item => item.id === row.id)) return false;
    scope.pending.add(row.id); scope.error = null; renderMutation(value => value + 1);
    try {
      if (row.kind === 'saved-project') {
        await services.engagement.setEngagement({ projectId: row.project.id, kind: 'save', engaged: false });
        if (!isCurrent()) return false;
        engagementStore.refresh(row.project.id);
      } else if (row.kind === 'saved-page') await removeSavedPage(row.target);
      else if (row.kind === 'saved-creator') await services.creatorSaves.setCreatorSave(row.creatorId, false);
      if (!isCurrent()) return false;
      scope.removed.add(row.id);
      return true;
    } catch (caught) {
      if (isCurrent()) scope.error = caught instanceof Error ? caught.message : 'This bookmark could not be removed. Please try again.';
      return false;
    } finally {
      if (isCurrent()) { scope.pending.delete(row.id); renderMutation(value => value + 1); }
    }
  }

  async function markRead(row: StudioRow): Promise<boolean> {
    if (!isCurrent() || row.kind !== 'activity' || !allRows.some(item => item.id === row.id)) return false;
    return activity.markRead(row.notification.id);
  }

  async function deleteActivity(requested: StudioRow[]): Promise<string[]> {
    if (!isCurrent()) return [];
    const selected = new Set(requested.flatMap(row => row.kind === 'activity' ? [JSON.stringify([row.id, row.notification.id, row.notification.timestamp])] : []));
    const eligible = currentRows.current.filter((row): row is Extract<StudioRow, { kind: 'activity' }> => row.kind === 'activity' && selected.has(JSON.stringify([row.id, row.notification.id, row.notification.timestamp])));
    if (!eligible.length) return [];
    const deleted = new Set(await activity.deleteNotifications(eligible.map(row => row.notification.id)));
    if (!isCurrent()) return [];
    return eligible.filter(row => deleted.has(row.notification.id)).map(row => row.id);
  }

  function refresh() {
    if (!isCurrent() || scope.pending.size) return;
    if (mobileActivity && category === 'activity') return activity.refresh();
    scope.removed.clear(); scope.error = null; pageFlight.current = null; setPageProgress(null);
    published.retry(); creators.retry(); pages.retry(); savedProjects.retry(); activity.retry();
  }

  const showsPages = category === 'bookmarks' && tab === 'pages';
  return {
    rows, sections, status, error, refresh, updatedAt, activityRefreshing,
    hasMore: showsPages && Boolean(pageBatch?.nextCursor), loadMore,
    loadingMore: showsPages && Boolean(currentPages?.loading), loadMoreError: showsPages ? currentPages?.error ?? null : null,
    pendingIds: new Set([...scope.pending, ...[...activity.pendingIds].map(id => `activity:${id}`)]),
    mutationError: scope.error ?? activity.mutationError,
    unsave, markRead, deleteActivity,
  };
}
