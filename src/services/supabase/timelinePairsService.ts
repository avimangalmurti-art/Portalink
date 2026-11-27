import { requireSupabase } from './client';
import { readTimelineCoverPosition } from '../../features/journey/journey';
import type { ImagePosition } from '../../types/imageCrop';
import type { ProfileService } from '../interfaces';

type PairRow = {
  id: string;
  then_project_id: string;
  now_project_id: string;
  then_cover?: unknown;
  now_cover?: unknown;
};

const isMissingFramingColumn = (error: { code: string; message: string }) => (
  ['42703', 'PGRST204'].includes(error.code) && /then_cover|now_cover/.test(error.message)
);

function readFraming(value: unknown, projectId: string) {
  if (!value || typeof value !== 'object' || !('projectId' in value) || value.projectId !== projectId) return null;
  return readTimelineCoverPosition(value);
}

function writeFraming(value: ImagePosition | null, projectId: string) {
  return value ? { projectId, x: value.x, y: value.y, zoom: value.zoom } : null;
}

export const supabaseTimelinePairService: Pick<ProfileService, 'listTimelinePairs' | 'listTimelinePairOrder' | 'reorderTimelinePairs' | 'addTimelinePair' | 'updateTimelinePair' | 'removeTimelinePair'> = {
  async listTimelinePairs(profileId) {
    const query = (columns: string) => requireSupabase().from('profile_timeline_pairs').select(columns)
      .eq('profile_id', profileId).order('created_at').order('id').returns<PairRow[]>();
    let { data, error } = await query('id,then_project_id,now_project_id,then_cover,now_cover');
    if (error && isMissingFramingColumn(error)) {
      ({ data, error } = await query('id,then_project_id,now_project_id'));
    }
    if (error) throw new Error('Additional Then/Now pairs could not be loaded.');
    return (data ?? []).map(row => {
      const thenCover = readFraming(row.then_cover, row.then_project_id);
      const nowCover = readFraming(row.now_cover, row.now_project_id);
      return { id: row.id, then: row.then_project_id, now: row.now_project_id,
        ...(thenCover ? { thenCover } : {}), ...(nowCover ? { nowCover } : {}) };
    });
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
  async updateTimelinePair(profileId, pairId, thenId, nowId, expected, framing) {
    const write = {
      then_project_id: thenId,
      now_project_id: nowId,
      ...(framing?.thenCover !== undefined ? { then_cover: writeFraming(framing.thenCover, thenId) } : {}),
      ...(framing?.nowCover !== undefined ? { now_cover: writeFraming(framing.nowCover, nowId) } : {}),
    };
    const update = requireSupabase().from('profile_timeline_pairs')
      .update(write)
      .eq('profile_id', profileId)
      .eq('id', pairId);
    let matching = expected ? update.eq('then_project_id', expected.then).eq('now_project_id', expected.now) : update;
    if (expected && ('then_cover' in write || 'now_cover' in write)) {
      for (const [column, value, projectId] of [
        ['then_cover', expected.thenCover, expected.then],
        ['now_cover', expected.nowCover, expected.now],
      ] as const) {
        matching = value ? matching.filter(column, 'eq', JSON.stringify(writeFraming(value, projectId))) : matching.is(column, null);
      }
    }
    const { data, error } = await matching.select('id');
    if (error && isMissingFramingColumn(error)) throw new Error('Then/Now cover framing is not available yet. Your changes were not saved.');
    if (error) throw new Error(error.code === '23505' ? 'This pair already exists.' : 'The pair could not be updated. Please try again.');
    if (data?.length !== 1) throw new Error('This pair has changed. Reopen the editor and try again.');
  },
  async removeTimelinePair(profileId, pairId) {
    const { data, error } = await requireSupabase().from('profile_timeline_pairs').delete().eq('profile_id', profileId).eq('id', pairId).select('id');
    if (error || data?.length !== 1) throw new Error('The pair could not be removed. Please refresh and try again.');
  },
};
