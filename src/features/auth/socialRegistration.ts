import { readRegistrationProfile, readSharedReturnPath } from './registration';
import { createProfileHandle } from '../../utils/profileHandle';
import { DEFAULT_PUBLIC_APPEARANCE } from '../../utils/publicAppearance';

/** Provider data supplies display defaults only; profile ownership still comes from RLS. */
export function socialRegistration(user: { id: string; email?: string; email_confirmed_at?: string; app_metadata?: { provider?: string }; user_metadata?: Record<string, unknown> }, returnPath?: string) {
  if (!user.email_confirmed_at || !['google', 'apple'].includes(user.app_metadata?.provider ?? '')) return;
  const metadata = user.user_metadata ?? {};
  const raw = [metadata.full_name, metadata.name, user.email?.split('@')[0]].find(value => typeof value === 'string' && value.trim());
  const name = typeof raw === 'string' ? raw.trim().slice(0, 48) : 'Creator';
  // Stable account-derived suffix makes a retried callback use the same handle.
  const prefix = createProfileHandle(name).slice(0, 13).replace(/^\.+|\.+$/g, '') || 'creator';
  const handle = `${prefix}.${user.id.replace(/-/g, '').slice(0, 16)}`;
  return readRegistrationProfile({ version: 1, id: user.id, name, handle, location: '', hasAvatar: false,
    accentColor: DEFAULT_PUBLIC_APPEARANCE.accentColor, systemGray: DEFAULT_PUBLIC_APPEARANCE.systemGray,
    returnPath: readSharedReturnPath(returnPath) });
}
