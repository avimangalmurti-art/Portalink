import { cities, type City } from './cities';
import type { GeographicResult, NavigableCity } from '../types/geography';
import { toLocationId } from '../utils/location';

/**
 * Where geographic records enter the frontend.
 *
 * Navigable cities are the product's authoritative destinations: they come from
 * `data/cities.ts` and nowhere else, because only this module mints
 * `kind: 'city'`. The globe draws nothing that is not a destination, so no
 * non-navigable geography enters the frontend today.
 */
export const navigableCities: NavigableCity[] = cities.map((city) => {
  const destinationId = toLocationId(city.name);
  return {
    kind: 'city',
    // Geographic identity and product destination are separate ids on purpose,
    // even though they currently derive from the same source.
    id: `city:${destinationId}`,
    destinationId,
    name: city.name,
    latitude: city.latitude,
    longitude: city.longitude
  };
});
const destinations = new Map<string, City>(cities.map((city) => [toLocationId(city.name), city]));

/** A navigable city's destination → the existing product city record. */
export function toCityDestination(destinationId: string): City | undefined {
  return destinations.get(destinationId);
}
export const localGeography: GeographicResult = {
  cities: navigableCities
};