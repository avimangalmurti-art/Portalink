export type NavAppearance = 'light' | 'dark';
export type NavAccent = {
  id: string;
  label: string;
  light: string;
  dark: string;
};

/*
 * The system accents, warm to cool and then neutral, so the row reads as a
 * spectrum rather than an arbitrary list.
 *
 * Each carries a light and a dark-optimised variant, because the accent has to
 * hold its contrast against both a white panel and a graphite one. The six
 * original values are unchanged: a stored preference is matched by its hex, so
 * altering one would silently reset anybody already using it.
 */
export const navAccents: NavAccent[] = [{
  id: 'red',
  label: 'Red',
  light: '#FF3B30',
  dark: '#FF453A'
}, {
  id: 'orange',
  label: 'Orange',
  light: '#FF9500',
  dark: '#FF9F0A'
}, {
  id: 'yellow',
  label: 'Yellow',
  light: '#FFCC00',
  dark: '#FFD60A'
}, {
  id: 'green',
  label: 'Green',
  light: '#28A745',
  dark: '#30D158'
}, {
  id: 'cyan',
  label: 'Light blue',
  light: '#32ADE6',
  dark: '#64D2FF'
}, {
  id: 'teal',
  label: 'Teal',
  light: '#1FA3B8',
  dark: '#40C8E0'
}, {
  id: 'blue',
  label: 'Blue',
  light: '#007AFF',
  dark: '#0A84FF'
}, {
  id: 'indigo',
  label: 'Indigo',
  light: '#5856D6',
  dark: '#5E5CE6'
}, {
  id: 'pink',
  label: 'Pink',
  light: '#FF2D55',
  dark: '#FF375F'
}, {
  id: 'purple',
  label: 'Purple',
  light: '#A550D8',
  dark: '#BF5AF2'
}, {
  id: 'graphite',
  label: 'Graphite',
  light: '#58616B',
  dark: '#7C8794'
}, {
  id: 'rose',
  label: 'Rose',
  light: '#C98A8A',
  dark: '#D9A3A3'
}];
// Existing saved appearances keep their color; Brown is no longer selectable.
const legacyBrownAccent: NavAccent = { id: 'brown', label: 'Brown', light: '#A2845E', dark: '#AC8E68' };
export function findNavAccent(color: string): NavAccent {
  const match = color.toLowerCase();
  return [...navAccents, legacyBrownAccent].find((accent) => accent.light.toLowerCase() === match || accent.dark.toLowerCase() === match) ?? navAccents[0];
}
export type SystemGray = {
  id: string;
  label: string;
  light: string;
  dark: string;
};

/*
 * The six system grays, ordered as the platform orders them: systemGray is the
 * base, and each step moves further toward the background — lighter in Light,
 * darker in Dark. One entry carries both variants because it is ONE gray with
 * two resolutions, not two separate choices; a stored id therefore stays correct
 * when the appearance changes.
 */
export const systemGrays: SystemGray[] = [{
  id: 'gray',
  label: 'System Gray',
  light: '#8E8E93',
  dark: '#8E8E93'
}, {
  id: 'gray2',
  label: 'System Gray 2',
  light: '#AEAEB2',
  dark: '#636366'
}, {
  id: 'gray3',
  label: 'System Gray 3',
  light: '#C7C7CC',
  dark: '#48484A'
}, {
  id: 'gray4',
  label: 'System Gray 4',
  light: '#D1D1D6',
  dark: '#3A3A3C'
}, {
  id: 'gray5',
  label: 'System Gray 5',
  light: '#E5E5EA',
  dark: '#2C2C2E'
}, {
  id: 'gray6',
  label: 'System Gray 6',
  light: '#F2F2F7',
  dark: '#1C1C1E'
}];
export function findSystemGray(id: string): SystemGray {
  return systemGrays.find((gray) => gray.id === id) ?? systemGrays[systemGrays.length - 1];
}
export function resolveSystemGray(id: string, appearance: NavAppearance): string {
  const gray = findSystemGray(id);
  return appearance === 'dark' ? gray.dark : gray.light;
}

/**
 * Relative luminance, so the label and icon ink is chosen from the surface it
 * actually sits on. Without this, picking a light gray in Dark (or a dark one in
 * Light) would leave the navigation labels unreadable.
 */
export function isLightSurface(hex: string): boolean {
  return luminance(hex) > 0.42;
}
function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  const channels = [value >> 16 & 255, value >> 8 & 255, value & 255].map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Hover and pressed step toward the base gray, so the interaction states are
 * derived from the same ladder rather than being hand-picked per option — the
 * relationship holds for whichever gray is chosen.
 */
function neighbourGray(id: string, steps: number, appearance: NavAppearance): string {
  const index = systemGrays.findIndex((gray) => gray.id === id);
  const from = index === -1 ? systemGrays.length - 1 : index;
  const target = from === 0 ? Math.min(steps, systemGrays.length - 1) : Math.max(from - steps, 0);
  return resolveSystemGray(systemGrays[target].id, appearance);
}

/** Choose ink against each actual surface; adjacent grays can cross light/dark. */
function controlInk(surface: string, highContrast: boolean): string {
  const dark = highContrast ? '#000000' : '#171717';
  const light = highContrast ? '#FFFFFF' : '#F5F5F3';
  const background = luminance(surface);
  const contrast = (ink: string) => {
    const foreground = luminance(ink);
    return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
  };
  return contrast(dark) > contrast(light) ? dark : light;
}

/**
 * Resolves the neutral control design tokens for the current appearance,
 * accent, and accessibility preferences. Navigation keeps its historical token
 * names, while the `--control-*` family is the platform-wide contract used by
 * toolbars, panels, dialogs, list rows, and content previews.
 */
export function resolveNavButtonTokens(appearance: NavAppearance, _accent: string, highContrast: boolean, reduceTranslucency: boolean, systemGrayId?: string): Record<string, string> {
  const isDark = appearance === 'dark';
  // A chosen system gray replaces the navigation surface outright, and the ink
  // is re-derived from it so the labels stay legible on whichever gray it is.
  const grayBackground = systemGrayId ? resolveSystemGray(systemGrayId, appearance) : null;
  // Selection is a NEUTRAL block. The accent lives in the selected icon and
  // label only, so a navigation tile never becomes an accent-filled card.
  const tokens = isDark ? {
    // Graphite navigation surfaces, matching Portalink's environment.
    background: reduceTranslucency ? '#1B1C1C' : 'rgba(27,28,28,0.85)',
    hover: '#262827',
    pressed: '#191B1A',
    selected: highContrast ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.12)',
    text: highContrast ? '#FFFFFF' : '#F2F1ED',
    icon: highContrast ? '#CFD1CE' : '#A5A7A4',
    border: highContrast ? 'rgba(242,241,237,0.26)' : '#303231'
  } : {
    // Inactive tiles sit lighter so the neutral selection carries the
    // hierarchy through surface weight rather than colour.
    background: reduceTranslucency ? '#F3F3F6' : 'rgba(24,24,27,0.035)',
    hover: reduceTranslucency ? '#E9E9EE' : 'rgba(24,24,27,0.055)',
    pressed: reduceTranslucency ? '#DEDEE4' : 'rgba(24,24,27,0.085)',
    selected: highContrast ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.075)',
    text: highContrast ? '#111113' : '#2C2C2E',
    icon: highContrast ? '#3A3A3C' : '#6E6E73',
    border: highContrast ? 'rgba(0,0,0,0.24)' : 'rgba(0,0,0,0.07)'
  };
  if (grayBackground && systemGrayId) {
    const onLight = isLightSurface(grayBackground);
    tokens.background = grayBackground;
    tokens.hover = neighbourGray(systemGrayId, 1, appearance);
    tokens.pressed = neighbourGray(systemGrayId, 2, appearance);
    tokens.selected = onLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.14)';
    tokens.text = controlInk(grayBackground, highContrast);
    tokens.icon = tokens.text;
    tokens.border = highContrast
      ? (tokens.text === '#000000' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)')
      : (onLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)');
  }
  const hoverText = grayBackground ? controlInk(tokens.hover, highContrast) : tokens.text;
  const pressedText = grayBackground ? controlInk(tokens.pressed, highContrast) : tokens.text;
  return {
    '--nav-button-background': tokens.background,
    '--nav-button-background-hover': tokens.hover,
    '--nav-button-background-pressed': tokens.pressed,
    '--nav-button-background-selected': tokens.selected,
    '--nav-button-text': tokens.text,
    // Hover is neutral; the chosen accent continues to identify selection.
    '--nav-button-text-hover': hoverText,
    '--nav-button-text-selected': 'var(--accent-text)',
    '--nav-button-icon': tokens.icon,
    '--nav-button-icon-hover': hoverText,
    '--nav-button-icon-selected': 'var(--accent-text)',
    '--nav-button-border': tokens.border,
    '--nav-button-border-selected': tokens.border,
    '--nav-button-focus-ring': 'var(--focus-ring)',
    /* Platform-wide neutral controls. Semantic actions (engagement, success,
     * warning, destructive, and primary accent actions) keep their own colour
     * families and never resolve through these variables. */
    '--control-rest-surface': tokens.background,
    '--control-hover-surface': tokens.hover,
    '--control-pressed-surface': tokens.pressed,
    '--control-selected-surface': tokens.selected,
    '--control-text': tokens.text,
    '--control-icon': tokens.icon,
    '--control-border': tokens.border,
    '--control-hover-text': hoverText,
    '--control-pressed-text': pressedText,
    '--control-selected-text': 'var(--accent-text)'
  };
}
