import type { CategoryFormat } from '../../types/domain';
import type { ProjectService } from '../interfaces';
import { requireSupabase } from './client';

type ErrorReply = { code?: string; message: string };
type Placement = { project_id: string; category_id: string };

function missingPlacementTable(error: ErrorReply) {
  return ['42P01', 'PGRST205'].includes(error.code ?? '') && /\bproject_portal_features\b/.test(error.message);
}

/** Load placements in batches. RLS determines which of them this session can see. */
export async function readFeaturedPortals(projectIds: string[], allowMissing = true): Promise<Map<string, string[]>> {
  const ids = [...new Set(projectIds)];
  const result = new Map<string, string[]>();
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await requireSupabase().from('project_portal_features')
        .select('project_id,category_id').in('project_id', batch)
        .order('project_id').order('category_id').range(offset, offset + 499);
      if (error) {
        if (allowMissing && missingPlacementTable(error)) return new Map();
        throw new Error(allowMissing ? 'Featured Portals could not be loaded.' : 'Portal selections could not be loaded.');
      }
      const rows = (data ?? []) as Placement[];
      for (const row of rows) {
        const categories = result.get(row.project_id) ?? [];
        categories.push(row.category_id);
        result.set(row.project_id, categories);
      }
      if (rows.length < 500) break;
    }
  }
  return result;
}

export const supabaseProjectPortalService: Required<Pick<ProjectService, 'isPortalMembershipAvailable' | 'getPortalMemberships' | 'setPortalMemberships'>> = {
  async isPortalMembershipAvailable() {
    const { error } = await requireSupabase().from('project_portal_features').select('project_id').limit(1);
    if (error && missingPlacementTable(error)) return false;
    if (error) throw new Error(error.message);
    return true;
  },
  async getPortalMemberships(projectId) {
    const client = requireSupabase();
    const { data: auth } = await client.auth.getSession();
    if (!auth.session) throw new Error('Sign in to choose where to feature this project.');
    const { data: project, error } = await client.from('projects')
      .select('id,profile_id,category_id,profiles!projects_profile_id_fkey!inner(account_id)')
      .eq('id', projectId).eq('profiles.account_id', auth.session.user.id).maybeSingle();
    if (error || !project) throw new Error('You can only feature projects you own.');
    const [categories, featured] = await Promise.all([
      client.from('portfolio_categories').select('id,label,icon_name,format,blurb').eq('profile_id', project.profile_id).order('position').order('id'),
      readFeaturedPortals([projectId], false),
    ]);
    if (categories.error) throw new Error('Portals could not be loaded.');
    return {
      primaryPortalId: project.category_id,
      selectedPortalIds: featured.get(projectId) ?? [],
      portals: (categories.data ?? []).map(category => ({
        id: category.id,
        label: category.label,
        iconName: category.icon_name,
        format: category.format as CategoryFormat,
        blurb: category.blurb,
      })),
    };
  },
  async setPortalMemberships(projectId, additionalPortalIds) {
    const { data, error } = await requireSupabase().rpc('set_project_featured_portals', {
      p_project_id: projectId,
      p_category_ids: additionalPortalIds,
    });
    if (error?.code === '42501') throw new Error('You can only feature projects you own.');
    if (error?.code === '22023' || error?.code === '23503') throw new Error('One of these Portals is no longer available. Reopen the menu and try again.');
    if (error || !Array.isArray(data) || !data.every(id => typeof id === 'string')) throw new Error('Portal selections could not be saved. Try again.');
    return data;
  },
};
