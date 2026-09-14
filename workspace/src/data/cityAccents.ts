/**
 * Stable city → location-accent mapping.
 *
 * The accent is identity only: it says "this is that place", never "this is
 * good/bad/selected". The tokens themselves live in index.css as
 * --location-accent-1..8; the planet component consumes --city-accent and never
 * learns why a city received a particular hue.
 *
 * The mapping is derived from the city id so it is stable across sessions,
 * reorderings, and filtered views — no per-city conditional styling anywhere.
 */

import type { CSSProperties } from 'react';
const LOCATION_ACCENT_COUNT = 8;

/** A city id ('cape-town') → its location accent CSS variable. */
export function getCityAccentToken(cityId: string): string {
  let hash = 0;
  for (let index = 0; index < cityId.length; index += 1) {
    hash = (hash * 31 + cityId.charCodeAt(index)) % 100003;
  }
  return `--location-accent-${hash % LOCATION_ACCENT_COUNT + 1}`;
}

/**
 * The three semantic values a planet needs, resolved from one accent token.
 * Returned as a style object so the component sets them once on its root.
 */
export function getCityAccentStyle(cityId: string): CSSProperties {
  const token = getCityAccentToken(cityId);
  return {
    ['--city-accent' as string]: `var(${token})`,
    ['--city-accent-soft' as string]: `color-mix(in srgb, var(${token}) 28%, transparent)`,
    ['--city-accent-strong' as string]: `color-mix(in srgb, var(${token}) 82%, #ffffff)`
  };
}