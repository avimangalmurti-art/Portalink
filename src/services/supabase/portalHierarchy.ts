import type { PortfolioCategory } from '../../types/domain';
import { requireSupabase } from './client';

type PortalParent = { profile_id: string; child_category_id: string; parent_category_id: string };
type BackendError = { code?: string; message: string };

function missingHierarchy(error: BackendError) {
  return ['42P01', 'PGRST205'].includes(error.code ?? '') && /\bportal_hierarchy\b/.test(error.message);
}

/** RLS limits each relationship to the current viewer's visible endpoints. */
export async function readPortalParents(profileIds: string[]): Promise<Map<string, PortalParent>> {
  const client = requireSupabase();
  const parents = new Map<string, PortalParent>();
  for (let start = 0; start < profileIds.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('portal_hierarchy')
        .select('profile_id,child_category_id,parent_category_id')
        .in('profile_id', profileIds.slice(start, start + 100))
        .order('child_category_id').range(offset, offset + 499);
      if (error) {
        if (missingHierarchy(error)) return new Map();
        throw new Error('Portal relationships could not be loaded.');
      }
      const rows = (data ?? []) as PortalParent[];
      for (const row of rows) parents.set(row.child_category_id, row);
      if (rows.length < 500) break;
    }
  }
  return parents;
}

/** Also filter against this particular surface's visible category list. */
export function attachPortalParents(
  profileId: string, categories: PortfolioCategory[], parents: ReadonlyMap<string, PortalParent>,
): PortfolioCategory[] {
  const visible = new Set(categories.map(category => category.id));
  return categories.map(category => {
    const link = parents.get(category.id);
    return link?.profile_id === profileId && visible.has(link.parent_category_id)
      ? { ...category, parentId: link.parent_category_id } : category;
  });
}

export async function hasSubPortals(profileId: string, parentId: string): Promise<boolean> {
  const { data, error } = await requireSupabase().from('portal_hierarchy')
    .select('child_category_id').eq('profile_id', profileId).eq('parent_category_id', parentId).limit(1);
  if (error) {
    if (missingHierarchy(error)) return false;
    throw new Error('Subportals could not be checked.');
  }
  return Boolean(data?.length);
}

export function isPortalParentDeleteError(error: BackendError) {
  return error.code === '23503' && /\bportal_hierarchy_parent_fk\b/.test(error.message);
}

export function isMissingCreateSubPortal(error: BackendError) {
  return ['42883', 'PGRST202'].includes(error.code ?? '') && /\bcreate_sub_portal\b/.test(error.message);
}
