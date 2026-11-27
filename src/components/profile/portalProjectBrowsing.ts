import type { MobileProjectSort } from './MobilePortalProjectToolbar';

export type PortalProjectBrowsing = {
  layout: 'list' | 'grid';
  sort: MobileProjectSort;
  onLayout: (layout: 'list' | 'grid') => void;
  onSort: (sort: MobileProjectSort) => void;
};

/** Viewer-side ordering preserves the canonical records and saved arrangement. */
export function sortPortalProjects<T extends { id: string; title: string; publishedAt?: string }>(projects: readonly T[], sort: MobileProjectSort, savedOrder?: readonly string[]): T[] {
  const ordered = [...projects];
  if (sort === 'saved') {
    if (!savedOrder?.length) return ordered;
    const ranks = new Map(savedOrder.map((id, index) => [id, index]));
    return ordered.sort((a, b) => (ranks.get(a.id) ?? savedOrder.length) - (ranks.get(b.id) ?? savedOrder.length));
  }
  return ordered.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) :
    (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0));
}
