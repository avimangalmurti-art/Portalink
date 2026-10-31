import { readSharedReturnPath } from '../auth/registration';
import { isPublicSharePath } from './shareModel';

const origin = 'https://portalink.invalid';
const settingsKeys = ['settings', 'section', 'panel', 'security'] as const;

function publicReturnPath(value: unknown): string | undefined {
  const path = readSharedReturnPath(value);
  if (!path) return;
  const url = new URL(path, origin);
  if (!isPublicSharePath(url.pathname)) return;
  // Preview changes presentation only; VisitorApp still verifies its owner.
  if (typeof value === 'string' && new URL(value, origin).searchParams.get('visitorPreview') === '1') url.searchParams.set('visitorPreview', '1');
  return url.pathname + url.search + url.hash;
}

/** Public Settings stays on a public address across reload and browser history. */
export function sharedSettingsPath(returnPath: string, settingsSearch = ''): string | undefined {
  const path = publicReturnPath(returnPath);
  if (!path) return;
  const url = new URL(path, origin);
  url.searchParams.set('settings', '1');
  const requested = new URLSearchParams(settingsSearch);
  for (const key of settingsKeys.slice(1)) {
    const value = requested.get(key);
    if (value && value.length <= 64) url.searchParams.set(key, value);
  }
  return url.pathname + url.search + url.hash;
}

/** Only a validated catalogue URL can restore the public Settings context. */
export function sharedSettingsReturnPath(value: string): string | undefined {
  if (!publicReturnPath(value)) return;
  const url = new URL(value, origin);
  if (url.searchParams.get('settings') !== '1') return;
  for (const key of settingsKeys) url.searchParams.delete(key);
  return publicReturnPath(url.pathname + url.search + url.hash);
}
