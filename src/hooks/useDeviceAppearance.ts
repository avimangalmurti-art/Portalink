import { useCallback, useEffect, useState } from 'react';
import { interfaceAppearanceKey, readInterfaceAppearance, resolveAppearance, writeInterfaceAppearance, type AppearanceScope, type InterfaceAppearance, type StoredAppearanceMode } from '../utils/appearancePreferences';
import type { Presentation } from '../presentation/usePresentation';

/** Device appearance is independent of a signed-in account's public branding. */
export function useDeviceAppearance(presentation: Presentation, scope: AppearanceScope = 'platform') {
  const [settings, setSettings] = useState(() => ({ web: readInterfaceAppearance('web', scope), mobile: readInterfaceAppearance('mobile', scope) }));
  const appearance = settings[presentation];
  const [systemTheme, setSystemTheme] = useState(() => resolveAppearance('auto'));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let query: MediaQueryList | undefined;
    try { query = window.matchMedia?.('(prefers-color-scheme: dark)'); } catch { /* Use the light fallback. */ }
    const sync = () => setSystemTheme(resolveAppearance('auto'));
    const visible = () => { if (document.visibilityState === 'visible') sync(); };
    const stored = (event: StorageEvent) => {
      for (const target of ['web', 'mobile'] as const) {
        if (event.key === interfaceAppearanceKey(target, scope) || event.key === null) {
          setSettings(previous => ({ ...previous, [target]: readInterfaceAppearance(target, scope) }));
        }
      }
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
  }, [scope]);
  const chooseAppearance = useCallback((patch: Partial<InterfaceAppearance>) => {
    setSettings(previous => ({ ...previous, [presentation]: { ...previous[presentation], ...patch } }));
    if (patch.mode === 'auto') setSystemTheme(resolveAppearance('auto'));
  }, [presentation]);
  // Persist explicit slots, never whichever presentation happens to be active
  // when an effect runs. Both initial snapshots preserve existing preferences.
  useEffect(() => { writeInterfaceAppearance('web', settings.web, scope); }, [settings.web, scope]);
  useEffect(() => { writeInterfaceAppearance('mobile', settings.mobile, scope); }, [settings.mobile, scope]);
  const chooseMode = useCallback((mode: StoredAppearanceMode) => chooseAppearance({ mode }), [chooseAppearance]);
  return { ...appearance, chooseAppearance, chooseMode, systemTheme, theme: appearance.mode === 'auto' ? systemTheme : appearance.mode };
}
