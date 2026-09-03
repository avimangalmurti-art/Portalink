import type { CreatorSaveService } from '../interfaces';
import type { SaveInsights } from '../../types/creatorSaves';
import { requireSupabase } from './client';

async function accountId() {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error || !data.user) throw new Error('Sign in to use your saved library.');
  return data.user.id;
}

export const supabaseCreatorSaveService: CreatorSaveService = {
  async getCreatorSave(profileId) {
    const id = await accountId();
    const { data, error } = await requireSupabase().from('creator_saves')
      .select('profile_id').eq('account_id', id).eq('profile_id', profileId).maybeSingle();
    if (error) throw new Error('Unable to load this bookmark. Please try again.');
    return data !== null;
  },
  async setCreatorSave(profileId, saved) {
    await accountId();
    const { data, error } = await requireSupabase().rpc('set_creator_save', { p_profile_id: profileId, p_saved: saved });
    if (error) throw new Error('Unable to update this bookmark. Please try again.');
    if (typeof data !== 'boolean') throw new Error('The bookmark could not be confirmed.');
    return data;
  },
  async listSavedCreatorIds() {
    const id = await accountId();
    const { data, error } = await requireSupabase().from('creator_saves')
      .select('profile_id').eq('account_id', id).order('created_at', { ascending: false });
    if (error) throw new Error('Unable to load saved creators. Please try again.');
    return (data ?? []).map((row: { profile_id: string }) => row.profile_id);
  },
  async getSaveInsights() {
    await accountId();
    const { data, error } = await requireSupabase().rpc('creator_save_insights');
    if (error) throw new Error('Unable to load your insights. Please try again.');
    const counts = data as SaveInsights | null;
    if (!counts || ![counts.creatorSaves, counts.projectSaves, counts.followers].every((n) => Number.isSafeInteger(n) && n >= 0)) {
      throw new Error('Your insights could not be confirmed.');
    }
    return counts;
  },
};

const unavailable = async (): Promise<never> => { throw new Error('Creator saves require a connected account.'); };
export const unavailableCreatorSaveService: CreatorSaveService = {
  getCreatorSave: unavailable, setCreatorSave: unavailable,
  listSavedCreatorIds: unavailable, getSaveInsights: unavailable,
};
