import { requireSupabase } from './client';
import type { ProfileService } from '../interfaces';
export const supabaseTimelinePairService: Pick<ProfileService, 'listTimelinePairs' | 'listTimelinePairOrder' | 'reorderTimelinePairs' | 'addTimelinePair' | 'updateTimelinePair' | 'removeTimelinePair'> = {
  async listTimelinePairs(profileId) {
    const { data, error } = await requireSupabase().from('profile_timeline_pairs').select('id,then_project_id,now_project_id').eq('profile_id', profileId).order('created_at').order('id');
    if (error) throw new Error('Additional Then/Now pairs could not be loaded.');
    return (data ?? []).map(row => ({ id: row.id, then: row.then_project_id, now: row.now_project_id }));
  },
  async listTimelinePairOrder(profileId) {
    const { data, error } = await requireSupabase().from('profile_timeline_pair_order')
      .select('pair_id').eq('profile_id', profileId).order('position');
    if (error && ['42P01', 'PGRST205'].includes(error.code)) return [];
    if (error) throw new Error('The Then/Now pair order could not be loaded.');
    return (data ?? []).map(row => row.pair_id ?? 'legacy');
  },
  async reorderTimelinePairs(profileId, pairIds) {
    const { error } = await requireSupabase().rpc('save_timeline_pair_order', {
      p_profile_id: profileId, p_pair_ids: pairIds,
    });
    if (error && ['42883', 'PGRST202'].includes(error.code)) throw new Error('Reordering Then/Now pairs is not available yet.');
    if (error && ['23503', '42501'].includes(error.code)) throw new Error('The available pairs may have changed. Reopen the editor and try again.');
    if (error) throw new Error('The Then/Now pair order could not be saved. Please try again.');
  },
  async addTimelinePair(profileId, thenId, nowId) {
    const { error } = await requireSupabase().from('profile_timeline_pairs').insert({ profile_id: profileId, then_project_id: thenId, now_project_id: nowId });
    if (error) throw new Error(error.code === '23505' ? 'This pair already exists.' : 'The pair could not be saved. Please try again.');
  },
  async updateTimelinePair(profileId, pairId, thenId, nowId, expected) {
    const update = requireSupabase().from('profile_timeline_pairs')
      .update({ then_project_id: thenId, now_project_id: nowId })
      .eq('profile_id', profileId)
      .eq('id', pairId);
    const matching = expected ? update.eq('then_project_id', expected.then).eq('now_project_id', expected.now) : update;
    const { data, error } = await matching.select('id');
    if (error) throw new Error(error.code === '23505' ? 'This pair already exists.' : 'The pair could not be updated. Please try again.');
    if (data?.length !== 1) throw new Error('This pair has changed. Reopen the editor and try again.');
  },
  async removeTimelinePair(profileId, pairId) {
    const { data, error } = await requireSupabase().from('profile_timeline_pairs').delete().eq('profile_id', profileId).eq('id', pairId).select('id');
    if (error || data?.length !== 1) throw new Error('The pair could not be removed. Please refresh and try again.');
  },
};
