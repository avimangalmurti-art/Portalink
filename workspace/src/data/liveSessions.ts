import type { LiveSession } from '../types/domain';
import { toLocationId } from '../utils/location';
import { cities } from './cities';
import { getCountryCode } from './countryCodes';

/**
 * The prototype's live-session seeds.
 *
 * These used to live inside `BroadcastTicker` as presentation data, which is why
 * joining one produced a display string rather than a session with an id. They are
 * now typed `LiveSession` records keyed to real location ids, read by the mock
 * `LiveService`, so the crawl and the join both refer to the same thing.
 *
 * Nothing here is broadcast: there is no audio, no stream, and no realtime
 * connection anywhere in the prototype. These describe sessions that would exist.
 */
export const liveSessionSeeds: readonly LiveSession[] = [{
  id: 'session-lagos-late-night',
  locationId: toLocationId('Lagos'),
  title: 'Lagos Late Night',
  hostName: 'DJ Nsuku',
  isLive: true
}, {
  id: 'session-dakar-sessions',
  locationId: toLocationId('Dakar'),
  title: 'Dakar Sessions',
  hostName: 'DJ Amara',
  isLive: false
}, {
  id: 'session-medina-frequencies',
  locationId: toLocationId('Marrakesh'),
  title: 'Medina Frequencies',
  hostName: 'Selecta Rami',
  isLive: true
}, {
  id: 'session-atlantic-drift',
  locationId: toLocationId('Casablanca'),
  title: 'Atlantic Drift',
  hostName: 'Yasmine K.',
  isLive: false
}, {
  id: 'session-treichville-tape',
  locationId: toLocationId('Abidjan'),
  title: 'Treichville Tape',
  hostName: 'Kouadio',
  isLive: true
}, {
  id: 'session-casbah-after-hours',
  locationId: toLocationId('Algiers'),
  title: 'Casbah After Hours',
  hostName: 'DJ Meriem',
  isLive: false
}];

/**
 * The place a session belongs to, resolved from its canonical location id rather
 * than from this file's seeds — so a session that arrives from a real backend, and
 * is not listed here at all, still names its city correctly.
 */
export function placeLabelFor(locationId: string): string {
  const city = cities.find((entry) => toLocationId(entry.name) === locationId);
  if (!city) {
    return '';
  }
  const countryCode = getCountryCode(city.name);
  return countryCode ? `${city.name}, ${countryCode}` : city.name;
}