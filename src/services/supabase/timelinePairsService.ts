import { requireSupabase } from './client';
import type { ProfileService } from '../interfaces';
export const supabaseTimelinePairService: Pick<ProfileService, 'listTimelinePairs' | 'addTimelinePair' | 'removeTimelinePair'> = {
  async listTimelinePairs(profileId) {
    const { data, error } = await requireSupabase().from('profile_timeline_pairs').select('id,then_project_id,now_project_id').eq('profile_id', profileId).order('created_at').order('id');
    if (error) throw new Error('Additional Then/Now pairs could not be loaded.');
    return (data ?? []).map(row => ({ id: row.id, then: row.then_project_id, now: row.now_project_id }));
  },
  async addTimelinePair(profileId, thenId, nowId) {
    const { error } = await requireSupabase().from('profile_timeline_pairs').insert({ profile_id: profileId, then_project_id: thenId, now_project_id: nowId });
    if (error) throw new Error(error.code === '23505' ? 'This pair already exists.' : 'The pair could not be saved. Please try again.');
  },
  async removeTimelinePair(profileId, pairId) {
    const { data, error } = await requireSupabase().from('profile_timeline_pairs').delete().eq('profile_id', profileId).eq('id', pairId).select('id');
    if (error || data?.length !== 1) throw new Error('The pair could not be removed. Please refresh and try again.');
  },
};
