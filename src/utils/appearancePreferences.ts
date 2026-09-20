// Appearance preferences persist, so whatever the viewer has set in Control
// Center is what the product opens with next time — their current settings
// become the default rather than resetting to a built-in theme.
import type { Presentation } from '../presentation/usePresentation';
/**
 * The resolved appearance the interface is actually rendering in. Distinct from
 * `StoredAppearanceMode`, which may be 'auto' and has to be resolved against the
 * platform first. Lives here — with the other appearance types and no React or
 * UI dependency — so every surface reads it from one neutral module.
 */
export type AppearanceTheme = 'light' | 'dark';
export type StoredAppearanceMode = 'light' | 'dark' | 'auto';
export type StoredContrastMode = 'default' | 'increased';
export type StoredIconColor = 'default' | 'black' | 'white' | 'gray';
export type StoredLanguage = 'auto' | 'en' | 'es' | 'fr' | 'de';

const MODE_KEY = 'portalinknetworks.appearanceMode';
// The old key was also populated from account branding. Start device appearance
// in System mode rather than migrating an indistinguishable account override.
export const DEVICE_APPEARANCE_MODE_KEY = 'portalinknetworks.deviceAppearanceMode';
const ACCENT_KEY = 'portalinknetworks.accentColor';
const CONTRAST_KEY = 'portalinknetworks.contrastMode';
const ICON_COLOR_KEY = 'portalinknetworks.iconColor';
const LANGUAGE_KEY = 'portalinknetworks.language';
const HIGH_CONTRAST_KEY = 'portalinknetworks.highContrast'; // Legacy
const REDUCE_TRANSLUCENCY_KEY = 'portalinknetworks.reduceTranslucency'; // Legacy

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {

    // Storage unavailable (private mode): fall back to session-only settings.
  }}

export function readAppearanceMode(fallback: StoredAppearanceMode): StoredAppearanceMode {
  const stored = read(MODE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : fallback;
}

export function writeAppearanceMode(mode: StoredAppearanceMode): void {
  write(MODE_KEY, mode);
}

export function readDeviceAppearanceMode(): StoredAppearanceMode {
  const stored = read(DEVICE_APPEARANCE_MODE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
}

export function writeDeviceAppearanceMode(mode: StoredAppearanceMode): void {
  write(DEVICE_APPEARANCE_MODE_KEY, mode);
}

// 'auto' resolves against the platform at read time.
export function resolveAppearance(mode: StoredAppearanceMode): 'light' | 'dark' {
  if (mode !== 'auto') {
    return mode;
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function readAccentColor(fallback: string): string {
  const stored = read(ACCENT_KEY);
  return stored || fallback;
}

export function writeAccentColor(color: string): void {
  write(ACCENT_KEY, color);
}

export function readContrastMode(fallback: StoredContrastMode): StoredContrastMode {
  const stored = read(CONTRAST_KEY);
  return stored === 'default' || stored === 'increased' ? stored : fallback;
}

export function writeContrastMode(mode: StoredContrastMode): void {
  write(CONTRAST_KEY, mode);
}

export function readIconColor(fallback: StoredIconColor): StoredIconColor {
  const stored = read(ICON_COLOR_KEY);
  return stored === 'default' || stored === 'black' || stored === 'white' || stored === 'gray' ? stored : fallback;
}

export function writeIconColor(color: StoredIconColor): void {
  write(ICON_COLOR_KEY, color);
}

export function readLanguage(fallback: StoredLanguage): StoredLanguage {
  const stored = read(LANGUAGE_KEY);
  return stored === 'auto' || stored === 'en' || stored === 'es' || stored === 'fr' || stored === 'de' ? stored : fallback;
}

export function writeLanguage(lang: StoredLanguage): void {
  write(LANGUAGE_KEY, lang);
}

// The navigation-button system gray. Stored by id rather than by hex, because
// one gray resolves to two different values depending on the appearance.
const NAV_GRAY_KEY = 'portalinknetworks.navSystemGray';

export function readNavSystemGray(fallback: string): string {
  return read(NAV_GRAY_KEY) || fallback;
}

export function writeNavSystemGray(id: string): void {
  write(NAV_GRAY_KEY, id);
}

export function readHighContrast(fallback: boolean): boolean {
  const stored = read(HIGH_CONTRAST_KEY);
  return stored === null ? fallback : stored === 'true';
}

export function writeHighContrast(enabled: boolean): void {
  write(HIGH_CONTRAST_KEY, String(enabled));
}

export function readReduceTranslucency(fallback: boolean): boolean {
  const stored = read(REDUCE_TRANSLUCENCY_KEY);
  return stored === null ? fallback : stored === 'true';
}

export function writeReduceTranslucency(enabled: boolean): void {
  write(REDUCE_TRANSLUCENCY_KEY, String(enabled));
}

export type InterfaceAppearance = {
  mode: StoredAppearanceMode;
  accentColor: string;
  systemGray: string;
  highContrast: boolean;
  reduceTranslucency: boolean;
};

export function interfaceAppearanceKey(presentation: Presentation): string {
  return `portalinknetworks.interfaceAppearance.${presentation}`;
}

/** Legacy values are a starting snapshot only; new choices never write them. */
export function readInterfaceAppearance(presentation: Presentation): InterfaceAppearance {
  const fallback: InterfaceAppearance = {
    mode: readDeviceAppearanceMode(),
    accentColor: readAccentColor('#0A84FF'),
    systemGray: readNavSystemGray('gray6'),
    highContrast: readHighContrast(false),
    reduceTranslucency: readReduceTranslucency(false),
  };
  try {
    const value = JSON.parse(read(interfaceAppearanceKey(presentation)) ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
    return {
      mode: ['light', 'dark', 'auto'].includes(value.mode) ? value.mode : fallback.mode,
      accentColor: typeof value.accentColor === 'string' && /^#[\da-f]{6}$/i.test(value.accentColor) ? value.accentColor : fallback.accentColor,
      systemGray: typeof value.systemGray === 'string' && /^gray(?:[2-6])?$/.test(value.systemGray) ? value.systemGray : fallback.systemGray,
      highContrast: typeof value.highContrast === 'boolean' ? value.highContrast : fallback.highContrast,
      reduceTranslucency: typeof value.reduceTranslucency === 'boolean' ? value.reduceTranslucency : fallback.reduceTranslucency,
    };
  } catch { return fallback; }
}

export function writeInterfaceAppearance(presentation: Presentation, value: InterfaceAppearance): void {
  write(interfaceAppearanceKey(presentation), JSON.stringify(value));
}
