import type { MobileProjectSort } from './MobilePortalProjectToolbar';

export type PortalProjectBrowsing = {
  layout: 'list' | 'grid';
  sort: MobileProjectSort;
  onLayout: (layout: 'list' | 'grid') => void;
  onSort: (sort: MobileProjectSort) => void;
};

/** Viewer-side ordering preserves the canonical records and saved arrangement. */
export function sortPortalProjects<T extends { title: string; publishedAt?: string }>(projects: readonly T[], sort: MobileProjectSort): T[] {
  const ordered = [...projects];
  if (sort === 'saved') return ordered;
  return ordered.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) :
    (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0));
}
