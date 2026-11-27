import type { PortfolioCategory } from '../../types/domain';

export function portalChildren(categories: PortfolioCategory[], parentId?: string): PortfolioCategory[] {
  if (parentId) return categories.filter(category => category.parentId === parentId);
  const visibleIds = new Set(categories.map(category => category.id));
  return categories.filter(category => !category.parentId || !visibleIds.has(category.parentId));
}

export function portalRootId(categories: PortfolioCategory[], categoryId: string | null): string | null {
  if (!categoryId) return null;
  const byId = new Map(categories.map(category => [category.id, category]));
  const visited = new Set<string>();
  let current = categoryId;
  let parent = byId.get(current)?.parentId;
  while (parent && byId.has(parent) && !visited.has(current)) {
    visited.add(current);
    current = parent;
    parent = byId.get(current)?.parentId;
  }
  return current;
}

/** Reorder the shown siblings without moving another family's slots. */
export function applyPortalOrder(order: string[], reorderedIds: string[]): string[] {
  const reordered = new Set(reorderedIds);
  let next = 0;
  return order.map(id => reordered.has(id) ? reorderedIds[next++] : id);
}
