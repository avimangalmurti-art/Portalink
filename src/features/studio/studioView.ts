import { buildPath } from '../../app/routes';
import type { StudioBookmarkTab, StudioCategory, StudioRow } from './studioModel';

export const STUDIO_CATEGORIES: readonly StudioCategory[] = ['drafts', 'published', 'bookmarks', 'activity', 'all'];
export const STUDIO_BOOKMARK_TABS: readonly StudioBookmarkTab[] = ['projects', 'pages', 'creators'];

export function readStudioLocation(params: URLSearchParams, savedRoute = false) {
  const value = params.get('category');
  const category: StudioCategory = savedRoute ? 'bookmarks' : STUDIO_CATEGORIES.includes(value as StudioCategory) ? value as StudioCategory : 'bookmarks';
  const selectedTab = params.get('tab');
  const tab: StudioBookmarkTab = selectedTab === 'pages' || selectedTab === 'creators' ? selectedTab : 'projects';
  return { category, tab };
}

/** Category/tab changes replace one workspace entry rather than adding Back steps. */
export function studioSearchParams(category: StudioCategory, tab: StudioBookmarkTab) {
  return { category, ...(category === 'bookmarks' && tab !== 'projects' ? { tab } : {}) };
}

export function studioSharePath(row: StudioRow): string | null {
  if (row.kind === 'published' || row.kind === 'saved-project') {
    return buildPath('sharedProject', { profileId: row.creator.id, categoryId: row.project.categoryId, projectId: row.project.id });
  }
  if (row.kind === 'saved-creator' && row.profile) return buildPath('sharedProfile', { profileId: row.creatorId });
  if (row.kind === 'saved-page' && row.presentation) {
    const { view, pageNumber } = row.presentation;
    const path = buildPath('sharedProject', { profileId: view.creator.id, categoryId: view.project.categoryId, projectId: view.project.id });
    return `${path}?${new URLSearchParams({ media: row.target.attachmentId, page: String(pageNumber) })}`;
  }
  return null;
}

export function studioBulkTargets(rows: StudioRow[]) {
  return {
    unsave: rows.filter(row => row.kind.startsWith('saved-')),
    markRead: rows.filter(row => row.kind === 'activity' && row.notification.isUnread),
    share: rows.filter(row => studioSharePath(row) !== null),
  };
}

export function studioDate(value?: string): string | undefined {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
