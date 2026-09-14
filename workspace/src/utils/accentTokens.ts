import type React from 'react';

// One chosen accent resolves into the whole interaction family, so a component
// never has to derive a hover or a foreground colour for itself.
type Rgb = {
  r: number;
  g: number;
  b: number;
};
function parseColor(color: string): Rgb | null {
  const value = color.trim();
  const hex = value.replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16)
    };
  }
  const rgb = value.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => Number.parseFloat(part));
    if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
      return {
        r: parts[0],
        g: parts[1],
        b: parts[2]
      };
    }
  }
  return null;
}
function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

// Relative luminance, so the accent's foreground is chosen rather than assumed.
function luminance({
  r,
  g,
  b
}: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrastRatio(first: Rgb, second: Rgb): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}
function mixedRgb({
  r,
  g,
  b
}: Rgb, target: number, amount: number): Rgb {
  const blend = (value: number) => Math.round(value + (target - value) * amount);
  return {
    r: blend(r),
    g: blend(g),
    b: blend(b)
  };
}
function rgbString({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}
function mix(color: Rgb, target: number, amount: number): string {
  return rgbString(mixedRgb(color, target, amount));
}
function ensureContrast(color: Rgb, background: Rgb, targetRatio: number, mixTarget: number): string {
  if (contrastRatio(color, background) >= targetRatio) {
    return rgbString(color);
  }
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mixedRgb(color, mixTarget, step / 20);
    if (contrastRatio(candidate, background) >= targetRatio) {
      return rgbString(candidate);
    }
  }
  return mixTarget === 0 ? '#111114' : '#ffffff';
}

/**
 * Contrast-safe foreground for text and glyphs sitting on the accent. A light
 * accent (yellow, mint) gets near-black; a saturated one gets white.
 */
export function resolveAccentForeground(accent: string): string {
  const rgb = parseColor(accent);
  if (!rgb) {
    return '#ffffff';
  }
  const darkForeground = {
    r: 17,
    g: 17,
    b: 20
  };
  const lightForeground = {
    r: 255,
    g: 255,
    b: 255
  };
  return contrastRatio(rgb, darkForeground) >= contrastRatio(rgb, lightForeground) ? '#111114' : '#ffffff';
}

/**
 * The accent token family, applied once at the application root so every
 * component that already reads an accent token updates immediately.
 */
export function resolveAccentTokens(accent: string, appearance: 'light' | 'dark'): React.CSSProperties {
  const rgb = parseColor(accent);
  const foreground = resolveAccentForeground(accent);
  // Dark appearances lift the accent on interaction; light ones deepen it.
  const hoverTarget = appearance === 'dark' ? 255 : 0;
  const canvas = appearance === 'dark' ? {
    r: 30,
    g: 30,
    b: 30
  } : {
    r: 255,
    g: 255,
    b: 255
  };
  const contrastTarget = appearance === 'dark' ? 255 : 0;
  const tokens: Record<string, string> = {
    '--accent-primary': accent,
    '--accent-hover': rgb ? mix(rgb, hoverTarget, 0.14) : accent,
    '--accent-pressed': rgb ? mix(rgb, hoverTarget, 0.26) : accent,
    '--accent-soft': rgb ? `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${appearance === 'dark' ? 0.2 : 0.12})` : accent,
    '--accent-foreground': foreground,
    // Accent used as text or a focus outline must remain legible even when a
    // person selects yellow, mint, or another low-contrast custom accent.
    '--accent-text': rgb ? ensureContrast(rgb, canvas, 4.5, contrastTarget) : accent,
    '--focus-ring': rgb ? ensureContrast(rgb, canvas, 3, contrastTarget) : accent
  };
  return tokens as React.CSSProperties;
}
