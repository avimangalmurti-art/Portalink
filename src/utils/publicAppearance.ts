import type { PublicAppearance } from '../types/domain';
import { resolveAppearance, type AppearanceTheme } from './appearancePreferences';

export const DEFAULT_PUBLIC_APPEARANCE: PublicAppearance = { accentColor: '#0A84FF', systemGray: 'gray6', mode: 'auto' };

/** Accept only the existing palette vocabulary, never arbitrary CSS from a profile. */
export function normalizePublicAppearance(value: unknown): PublicAppearance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { accentColor, systemGray, mode } = value as Record<string, unknown>;
  if (typeof accentColor !== 'string' || !/^#[\da-f]{6}$/i.test(accentColor)
    || typeof systemGray !== 'string' || !/^gray(?:[2-6])?$/.test(systemGray)
    || (mode !== 'auto' && mode !== 'light' && mode !== 'dark')) return null;
  return { accentColor, systemGray, mode };
}

export function readVisitorTheme(profileId: string): AppearanceTheme | null {
  try {
    const value = window.localStorage.getItem(`portalink.publicTheme.${profileId}`);
    return value === 'light' || value === 'dark' ? value : null;
  } catch { return null; }
}

export function writeVisitorTheme(profileId: string, theme: AppearanceTheme): void {
  try { window.localStorage.setItem(`portalink.publicTheme.${profileId}`, theme); } catch { /* Session-only when storage is unavailable. */ }
}

export function resolvePublicTheme(appearance: PublicAppearance, visitorTheme: AppearanceTheme | null): AppearanceTheme {
  return visitorTheme ?? resolveAppearance(appearance.mode);
}

/** Serialize saves so a slow older request cannot overwrite a newer choice. */
export function createAppearanceWriter(save: (profileId: string, appearance: PublicAppearance) => Promise<void>) {
  let tail = Promise.resolve();
  let latestKey: string | null = null;
  return (profileId: string, appearance: PublicAppearance): Promise<void> => {
    const key = JSON.stringify([profileId, appearance]);
    if (latestKey === key) return tail;
    latestKey = key;
    const next = tail.catch(() => undefined).then(() => save(profileId, appearance));
    tail = next;
    void next.catch(() => { if (latestKey === key) latestKey = null; });
    return next;
  };
}
