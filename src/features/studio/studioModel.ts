import { buildPath } from '../../app/routes';
import type { FeedCreator, Notification, Profile, Project, ProjectView } from '../../types/domain';
import type { SavedCreatorEntry, SavedPageEntry } from '../library/collectionQueries';
import { savedPageKey } from '../library/savedPages';

export const STUDIO_CATEGORIES = ['drafts', 'published', 'bookmarks', 'activity', 'all'] as const;
export type StudioCategory = typeof STUDIO_CATEGORIES[number];
export type StudioBookmarkTab = 'projects' | 'pages' | 'creators';
export type StudioAction = 'open' | 'share' | 'copy-link' | 'edit' | 'unsave' | 'mark-read';
export const STUDIO_DRAFTS_EXPLANATION = 'Saved draft details cannot be reopened here yet. The publishing flow keeps files only while it is open; Studio cannot restore them. Start a new project to continue creating.';

type StudioRowBase = { id: string; title: string; secondary: string; date?: string; href?: string };
export type StudioRow = StudioRowBase & (
  | { kind: 'published' | 'saved-project'; project: Project; creator: FeedCreator | Profile }
  | { kind: 'saved-page'; target: SavedPageEntry['target']; presentation: SavedPageEntry['presentation'] }
  | { kind: 'saved-creator'; creatorId: string; profile: Profile | null }
  | { kind: 'activity'; notification: Notification }
);
export type StudioSection = { id: StudioCategory; title: string; rows: StudioRow[]; description?: string };

export function studioCategory(value: string | null): StudioCategory {
  return STUDIO_CATEGORIES.includes(value as StudioCategory) ? value as StudioCategory : 'all';
}

export function studioBookmarkTab(value: string | null): StudioBookmarkTab {
  return value === 'pages' || value === 'creators' ? value : 'projects';
}

function realDate(value?: string): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function projectHref(project: Project, creator: Pick<Profile, 'id'>) {
  return buildPath('project', { projectId: project.id, profileId: creator.id, categoryId: project.categoryId });
}

export function publishedStudioRows(profile: Profile | null | undefined): StudioRow[] {
  if (!profile) return [];
  return [...profile.projects].sort((a, b) => (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0)).map(project => ({
    kind: 'published', id: `published:${project.id}`, title: project.title,
    secondary: project.summary || profile.categories.find(category => category.id === project.categoryId)?.label || 'Published project',
    date: realDate(project.publishedAt), href: projectHref(project, profile), project, creator: profile,
  }));
}

export function savedProjectStudioRows(views: ProjectView[]): StudioRow[] {
  // The service knows save order, but does not expose save dates. A publication
  // date would describe a different event, so these rows intentionally omit it.
  return views.map(({ project, creator }) => ({ kind: 'saved-project', id: `saved-project:${project.id}`, title: project.title,
    secondary: creator.name, href: projectHref(project, creator), project, creator }));
}

export function savedPageStudioRows(entries: SavedPageEntry[]): StudioRow[] {
  return entries.map(({ target, presentation }) => ({ kind: 'saved-page', id: `saved-page:${savedPageKey(target)}`,
    title: presentation?.view.project.title ?? 'Unavailable page',
    secondary: presentation ? `${presentation.label} · ${presentation.view.creator.name}` : 'This page is no longer shared with you.',
    date: realDate(target.savedAt), href: presentation?.href, target, presentation }));
}

export function savedCreatorStudioRows(entries: SavedCreatorEntry[]): StudioRow[] {
  return entries.map(({ id, profile }) => ({ kind: 'saved-creator', id: `saved-creator:${id}`, title: profile?.name ?? 'Unavailable creator',
    secondary: profile?.headline || (profile ? profile.handle : 'This profile is no longer available.'),
    href: profile ? buildPath('profile', { profileId: id }) : undefined, creatorId: id, profile }));
}

export function activityStudioRows(notifications: Notification[]): StudioRow[] {
  return notifications.map(notification => ({ kind: 'activity', id: `activity:${notification.id}`,
    title: notification.kind === 'message' ? 'Message' : notification.kind === 'reply' ? 'Reply' : notification.kind === 'follow' ? 'Follow' : 'Update',
    secondary: notification.body, date: realDate(notification.timestamp), href: notification.targetPath || undefined, notification }));
}

export function filterStudioRows(rows: StudioRow[], query: string): StudioRow[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter(row => {
    const text = `${row.title} ${row.secondary}`.toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}

export function studioSections(rows: StudioRow[], category: StudioCategory, tab: StudioBookmarkTab): StudioSection[] {
  const sections: StudioSection[] = [
    { id: 'drafts', title: 'Drafts', rows: [], description: STUDIO_DRAFTS_EXPLANATION },
    { id: 'published', title: 'Published', rows: rows.filter(row => row.kind === 'published') },
    { id: 'bookmarks', title: 'Bookmarks', rows: rows.filter(row => row.kind.startsWith('saved-') &&
      (category === 'all' || row.kind === (tab === 'projects' ? 'saved-project' : tab === 'pages' ? 'saved-page' : 'saved-creator'))) },
    { id: 'activity', title: 'Activity', rows: rows.filter(row => row.kind === 'activity') },
  ];
  return category === 'all' ? sections : sections.filter(section => section.id === category);
}

/** Capabilities are real: no resumable draft or Mark unread service exists. */
export function studioRowActions(row: StudioRow): StudioAction[] {
  const actions: StudioAction[] = row.href ? ['open'] : [];
  if (row.kind === 'published') return [...actions, 'share', 'copy-link', 'edit'];
  if (row.kind === 'activity') return row.notification.isUnread ? [...actions, 'mark-read'] : actions;
  return [...actions, ...(row.href ? ['share', 'copy-link'] as StudioAction[] : []), 'unsave'];
}
