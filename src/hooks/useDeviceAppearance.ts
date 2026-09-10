import { useCallback, useEffect, useState } from 'react';
import { DEVICE_APPEARANCE_MODE_KEY, readDeviceAppearanceMode, resolveAppearance, writeDeviceAppearanceMode, type StoredAppearanceMode } from '../utils/appearancePreferences';

/** Device appearance is independent of a signed-in account's public branding. */
export function useDeviceAppearance() {
  const [mode, setMode] = useState(readDeviceAppearanceMode);
  const [systemTheme, setSystemTheme] = useState(() => resolveAppearance('auto'));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let query: MediaQueryList | undefined;
    try { query = window.matchMedia?.('(prefers-color-scheme: dark)'); } catch { /* Use the light fallback. */ }
    const sync = () => setSystemTheme(resolveAppearance('auto'));
    const visible = () => { if (document.visibilityState === 'visible') sync(); };
    const stored = (event: StorageEvent) => {
      if (event.key === DEVICE_APPEARANCE_MODE_KEY || event.key === null) setMode(readDeviceAppearanceMode());
    };
    if (query?.addEventListener) query.addEventListener('change', sync);
    else query?.addListener?.(sync);
    // Mobile browsers may suspend media-query events while the app is away.
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('storage', stored);
    document.addEventListener('visibilitychange', visible);
    sync();
    return () => {
      if (query?.removeEventListener) query.removeEventListener('change', sync);
      else query?.removeListener?.(sync);
      window.removeEventListener('pageshow', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', stored);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  const chooseMode = useCallback((next: StoredAppearanceMode) => {
    writeDeviceAppearanceMode(next);
    setMode(next);
    if (next === 'auto') setSystemTheme(resolveAppearance('auto'));
  }, []);
  return { mode, chooseMode, systemTheme, theme: mode === 'auto' ? systemTheme : mode };
}
