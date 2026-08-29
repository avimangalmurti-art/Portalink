/**
 * Deterministic location helpers.
 *
 * Every value here is derived from coordinates the product already holds
 * (`data/cities.ts`). Nothing is invented: where a value cannot be derived from
 * real data, these helpers return `null` and the UI omits the field.
 */

/** Stable id for a location, used for accents, routes, and analytics keys. */
export function toLocationId(cityName: string): string {
  return cityName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** "33.92° S, 18.42° E" — the real stored coordinates, formatted. */
export function formatCoordinates(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(2)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(2)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}

/**
 * The solar offset the product's clocks already run on: `getLocalTimeAt` shows
 * each city's time as longitude / 15 hours from UTC, so this label describes the
 * same real derivation rather than a separate, invented timezone database.
 *
 * Returns null when no longitude is available, so callers can omit the field.
 */
export function formatSolarUtcOffset(longitude: number | undefined): string | null {
  if (longitude === undefined || Number.isNaN(longitude)) {
    return null;
  }
  const hours = longitude / 15;
  const rounded = Math.round(hours * 2) / 2;
  const sign = rounded < 0 ? '−' : '+';
  const whole = Math.floor(Math.abs(rounded));
  const minutes = Math.abs(rounded) % 1 >= 0.5 ? '30' : '00';
  return `Solar UTC${sign}${String(whole).padStart(2, '0')}:${minutes}`;
}
