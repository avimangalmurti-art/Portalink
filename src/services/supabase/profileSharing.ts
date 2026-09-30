import { requireSupabase } from './client';
import { normalizePublicHandle, validHandle, parseResolution, type ShareAddress } from '../../features/sharing/shareModel';
export function missingHandleRpc(error: {code?: string; message?: string} | null): boolean {
  return Boolean(error && ['PGRST202','42883'].includes(error.code ?? '') && /profile_handle|share_address/.test(error.message ?? ''));
}
async function call(name: string, args: Record<string, unknown>) {
  const result = await requireSupabase().rpc(name, args);
  if (result.error && !missingHandleRpc(result.error)) throw new Error(result.error.message);
  return result.error ? undefined : result.data;
}
export const profileSharing = {
  async getPortfolioCard(profileId: string) {
    const response = await fetch(`/api/portfolio-card/${encodeURIComponent(profileId)}`, { credentials: 'omit' });
    return response.ok ? response.json() : null;
  },
  async getShareAddress(profileId: string): Promise<ShareAddress> {
    const data = await call('profile_share_address', { p_profile_id: profileId });
    return { handle: typeof data?.handle === 'string' && validHandle(data.handle) ? data.handle : null, confirmed: data?.confirmed === true, available: data !== undefined };
  },
  async checkPublicHandle(handle: string): Promise<'available' | 'taken' | 'unavailable'> {
    const normalized = normalizePublicHandle(handle);
    if (!validHandle(normalized)) return 'taken';
    const data = await call('profile_handle_available', { p_handle: normalized });
    if (data?.limited) throw new Error('Too many address checks. Try again in a minute.');
    return data === undefined ? 'unavailable' : data?.available === true ? 'available' : 'taken';
  },
  async claimPublicHandle(profileId: string, handle: string): Promise<ShareAddress> {
    const normalized = normalizePublicHandle(handle);
    if (!validHandle(normalized)) throw new Error('Use 3–30 lowercase letters, numbers or dots. This address must not be reserved.');
    const data = await call('claim_profile_handle', { p_profile_id: profileId, p_handle: normalized });
    if (data === undefined) throw new Error('Short addresses are not enabled yet. Your existing portfolio link still works.');
    return { handle: normalized, confirmed: true, available: true };
  },
  async markHandleShared(profileId: string, handle: string): Promise<void> {
    const data = await call('mark_profile_handle_shared', { p_profile_id: profileId, p_handle: handle });
    if (data === undefined) throw new Error('This address could not be reserved. Reopen Share to use your existing link.');
  },
  async resolvePublicHandle(handle: string) { return parseResolution(await call('resolve_profile_handle', { p_handle: handle })); },
};
