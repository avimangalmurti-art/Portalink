import { cities } from './cities';
import { getCountryCode } from './countryCodes';
import { toLocationId } from '../utils/location';
import { LOCATION_DIRECTORY_MANIFEST } from './locationDirectoryVersion';

export type DirectoryPlace = {
  id: string;
  kind: 'city' | 'region' | 'country';
  name: string;
  asciiName?: string;
  countryCode: string;
  countryName: string;
  countryIso3: string;
  regionCode?: string;
  regionName?: string;
  regionAsciiName?: string;
  latitude?: number;
  longitude?: number;
  population?: number;
  timezone?: string;
  uniqueInCountry?: boolean;
  uniqueInRegion?: boolean;
  legacy?: boolean;
};
type CityRow = [number, string, string, string, string, number, number, number, string, number, number];
type Manifest = {
  schema: number;
  countries: [string, string, number, string][];
  regions: [string, string, string, number][];
  search: string[];
  ids: string[];
  shortNames: CityRow[];
};
export const normalizeLocation = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
export function locationSearchShard(value: string) {
  return [...normalizeLocation(value)].slice(0, 3).reduce((hash, char) => (hash * 31 + (char.codePointAt(0) ?? 0)) % 128, 0);
}
export function placeLabel(place: DirectoryPlace) {
  return [place.name, place.kind === 'city' ? place.regionName : '', place.kind !== 'country' ? place.countryCode : ''].filter(Boolean).join(', ');
}
/** Preserve the existing database's 48-character contract; never truncate a name. */
export function profilePlaceLabel(place: DirectoryPlace): string | null {
  const full = placeLabel(place);
  if (full.length <= 48) return full;
  const compact = `${place.name}, ${place.countryCode}`;
  return place.kind === 'city' && place.uniqueInCountry && compact.length <= 48 ? compact : null;
}

const matchesName = (name: string | undefined, query: string) => Boolean(name && normalizeLocation(name).startsWith(query));
const exactAdministrativeRank = (place: DirectoryPlace, query: string) => normalizeLocation(place.name) !== query ? 0 : place.kind === 'country' ? 2 : place.kind === 'region' ? 1 : 0;

/** Own-origin, immutable assets only. Rejected fetches can be retried. */
export function createLocationDirectory(fetcher: typeof fetch = (...args) => fetch(...args)) {
  const pending = new Map<string, Promise<unknown>>();
  const indexes = new WeakMap<Manifest, { countries: Map<string, Manifest['countries'][number]>; regions: Map<string, Manifest['regions'][number]> }>();
  const index = (data: Manifest) => {
    let value = indexes.get(data);
    if (!value) { value = { countries: new Map(data.countries.map(row => [row[0], row])), regions: new Map(data.regions.map(row => [row[0], row])) }; indexes.set(data, value); }
    return value;
  };
  const json = <T,>(url: string): Promise<T> => {
    const existing = pending.get(url);
    if (existing) return existing as Promise<T>;
    const request = fetcher(url, { credentials: 'omit', cache: 'force-cache' }).then(async response => {
      if (!response.ok) throw new Error('The location directory could not be loaded.');
      return response.json();
    }).catch(error => { pending.delete(url); throw error; });
    pending.set(url, request);
    // A long browsing session need not retain all 235k parsed city records.
    if (pending.size > 33) {
      const oldest = [...pending.keys()].find(key => key !== LOCATION_DIRECTORY_MANIFEST);
      if (oldest) pending.delete(oldest);
    }
    return request;
  };
  const manifest = async () => {
    const value = await json<Manifest>(LOCATION_DIRECTORY_MANIFEST);
    if (value.schema !== 1 || value.search.length !== 128 || value.ids.length !== 128) throw new Error('The location directory is unavailable.');
    return value;
  };
  const shard = (filename: string) => {
    if (!/^(search|ids)-\d+-[a-f0-9]{16}\.json$/.test(filename)) throw new Error('Invalid location directory asset.');
    return json<CityRow[]>(`/assets/locations/${filename}`);
  };
  const countryFields = (data: Manifest, code: string) => {
    const country = index(data).countries.get(code);
    return { countryCode: code, countryName: country?.[1] ?? code, countryIso3: country?.[3] ?? code };
  };
  const regionPlace = (data: Manifest, row: Manifest['regions'][number]): DirectoryPlace => ({
    id: `gn-${row[3]}`, kind: 'region', name: row[1], asciiName: row[2], regionCode: row[0],
    ...countryFields(data, row[0].split('.')[0]),
  });
  const cityPlace = (data: Manifest, row: CityRow): DirectoryPlace => {
    const region = index(data).regions.get(`${row[3]}.${row[4]}`);
    return { id: `gn-${row[0]}`, kind: 'city', name: row[1], asciiName: row[2],
      ...countryFields(data, row[3]), regionCode: `${row[3]}.${row[4]}`, regionName: region?.[1], regionAsciiName: region?.[2],
      latitude: row[5], longitude: row[6], population: row[7], timezone: row[8], uniqueInCountry: row[9] === 1, uniqueInRegion: row[10] === 1 };
  };
  const administrativePlaces = (data: Manifest): DirectoryPlace[] => [
    ...data.countries.map(row => ({ id: `gn-${row[2]}`, kind: 'country' as const, name: row[1], ...countryFields(data, row[0]) })),
    ...data.regions.map(row => regionPlace(data, row)),
  ];
  return {
    async search(value: string, limit = 8): Promise<DirectoryPlace[]> {
      const [query, ...qualifiers] = normalizeLocation(value).split(',').map(part => part.trim()).filter(Boolean);
      if (!query) return [];
      const data = await manifest();
      const places = administrativePlaces(data).filter(place => matchesName(place.name, query) || matchesName(place.asciiName, query)
        || (place.kind === 'country' && [place.countryCode, place.countryIso3].some(code => normalizeLocation(code) === query)));
      if ([...query].length >= 3) {
        const rows = await shard(data.search[locationSearchShard(query)]);
        places.push(...rows.filter(row => matchesName(row[1], query) || matchesName(row[2], query)).map(row => cityPlace(data, row)));
      } else {
        places.push(...data.shortNames.filter(row => [row[1], row[2]].some(name => normalizeLocation(name) === query)).map(row => cityPlace(data, row)));
      }
      return places.filter(place => qualifiers.every(part => normalizeLocation([place.regionName, place.regionAsciiName, place.countryName, place.countryCode, place.countryIso3].filter(Boolean).join(' ')).includes(part)))
        .sort((a, b) => Number(normalizeLocation(b.name) === query) - Number(normalizeLocation(a.name) === query)
          || exactAdministrativeRank(b, query) - exactAdministrativeRank(a, query)
          || (b.population ?? 0) - (a.population ?? 0) || placeLabel(a).localeCompare(placeLabel(b)))
        .slice(0, Math.max(1, Math.min(limit, 50)));
    },
    async resolve(id: string): Promise<DirectoryPlace | null> {
      const legacy = cities.find(city => toLocationId(city.name) === id);
      if (legacy) return { ...legacy, id, kind: 'city', countryCode: getCountryCode(legacy.name), countryName: '', countryIso3: '', legacy: true };
      if (!/^gn-[1-9]\d{0,9}$/.test(id)) return null;
      const data = await manifest();
      const administrative = administrativePlaces(data).find(place => place.id === id);
      if (administrative) return administrative;
      const numericId = Number(id.slice(3));
      const row = (await shard(data.ids[numericId % 128])).find(row => row[0] === numericId);
      return row ? cityPlace(data, row) : null;
    },
  };
}
export const locationDirectory = createLocationDirectory();

/** New directory destinations require explicit country/region qualifiers.
 * Legacy name-only values continue through legacy routes, never guessed across countries.
 */
export function profileMatchesPlace(value: string | undefined, place: DirectoryPlace): boolean {
  if (!value?.trim()) return false;
  const parts = value.split(',').map(normalizeLocation).filter(Boolean);
  const countries = [place.countryCode, place.countryIso3, place.countryName,
    ...(place.countryCode === 'US' ? ['USA', 'United States of America'] : []),
    ...(place.countryCode === 'GB' ? ['UK', 'United Kingdom'] : [])].filter(Boolean).map(normalizeLocation);
  const hasCountry = countries.includes(parts.at(-1) ?? '');
  if (!hasCountry) return false;
  if (place.kind === 'country') return true;
  const regions = [place.kind === 'region' ? place.name : place.regionName,
    place.kind === 'region' ? place.asciiName : place.regionAsciiName,
    place.countryCode === 'US' ? place.regionCode?.split('.')[1] : undefined].filter((item): item is string => Boolean(item)).map(normalizeLocation);
  if (place.kind === 'region') return parts.slice(0, -1).some(part => regions.includes(part));
  const sameCity = [place.name, place.asciiName].some(name => name !== undefined && normalizeLocation(name) === parts[0]);
  return sameCity && ((place.uniqueInRegion === true && parts.slice(1, -1).some(part => regions.includes(part))) || (parts.length === 2 && place.uniqueInCountry === true));
}
