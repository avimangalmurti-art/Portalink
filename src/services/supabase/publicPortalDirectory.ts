import type { PublicPortalPage } from '../../types/portals';
import { requireSupabase } from './client';
import { requireDirectoryAccount } from './requireDirectoryAccount';
import { normalizePublicAppearance } from '../../utils/publicAppearance';

const PAGE_SIZE = 48;

type PublicPortalRow = {
  id: string;
  profile_id: string;
  label: string;
  icon_name: string | null;
  profiles: { id: string; name: string; handle: string; avatar_url: string; public_appearance?: unknown };
};

/** Discover public portals without loading projects, drafts, attachments or private arrangements. */
export async function listPublicPortals(query = '', offset = 0): Promise<PublicPortalPage> {
  await requireDirectoryAccount();
  const start = Number.isFinite(offset)
    ? Math.min(Number.MAX_SAFE_INTEGER - PAGE_SIZE, Math.max(0, Math.floor(offset))) : 0;
  const term = query.trim().slice(0, 80);
  let request = requireSupabase().from('portfolio_categories')
    .select('id,profile_id,label,icon_name,profiles!inner(id,name,handle,avatar_url,public_appearance)')
    .eq('is_hidden', false)
    // RLS also permits owners/followers to see private work. Discovery is stricter.
    .eq('profiles.is_private', false);
  if (term) request = request.ilike('label', `%${term.replace(/[\\%_]/g, char => `\\${char}`)}%`);
  const { data, error } = await request.order('label').order('id').range(start, start + PAGE_SIZE);
  if (error) throw new Error('Portals could not be loaded. Please try again.');
  const rows = (data ?? []) as unknown as PublicPortalRow[];
  return {
    items: rows.slice(0, PAGE_SIZE).map(row => ({
      id: row.id, profileId: row.profile_id, label: row.label, iconName: row.icon_name || undefined,
      creator: { id: row.profiles.id, name: row.profiles.name, handle: row.profiles.handle, avatar: row.profiles.avatar_url,
        accentColor: normalizePublicAppearance(row.profiles.public_appearance)?.accentColor },
    })),
    nextOffset: rows.length > PAGE_SIZE ? start + PAGE_SIZE : null,
  };
}
