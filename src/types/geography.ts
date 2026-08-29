/**
 * Geographic domain models for the Portalink globe.
 *
 * The central distinction: **geographic existence is not a product
 * destination.** A `PopulatedPlace` exists on the map. A `NavigableCity` also
 * has a Portalink destination and is the only record that may be entered.
 * Nothing infers destination availability from population, prominence, record
 * count, proximity, cluster membership, or name.
 */

/** Stable geographic identity. Never a visible label. */
export type GeoId = string;

/** Background geography: real, on the map, and not a destination. */
export type PopulatedPlace = {
  kind: 'place';
  id: GeoId;
  name: string;
  latitude: number;
  longitude: number;
};

/**
 * Geography that is also a product destination. `destinationId` is deliberately
 * separate from `id` so the geographic record and the Portalink destination can
 * diverge (duplicate names, localized names, relabelled cities).
 */
export type NavigableCity = {
  kind: 'city';
  id: GeoId;
  destinationId: string;
  name: string;
  latitude: number;
  longitude: number;
};
export type GeographicRecord = PopulatedPlace | NavigableCity;

/** The globe's camera. `scale` is 1 at the whole-planet view. */
export type GeoCamera = {
  centerLongitude: number;
  centerLatitude: number;
  scale: number;
};

/**
 * Semantic geographic scale. Never shown in the UI — it exists so rendering
 * rules live in one resolver instead of scattered zoom comparisons.
 */
export type GeographicLod = 'global' | 'continental' | 'regional' | 'local';

/** Projected position in the globe's 104-unit viewBox. */
export type ProjectedPoint = {
  x: number;
  y: number;
};

/** A navigable city that resolved to its own marker at this scale. */
export type RenderCity = {
  id: GeoId;
  city: NavigableCity;
  point: ProjectedPoint;
};

/** One frame of geography, derived from dataset + camera + LOD. */
export type GeographicScene = {
  lod: GeographicLod;
  cities: RenderCity[];
  /** Marker radius at this LOD, in viewBox units. Deliberately tiny. */
  dotRadius: number;
  /** Invisible target radius, sized in real pixels for pointer and touch. */
  hitRadius: number;
};

/** The angular window currently visible, for a future server-side query. */
export type GeographicBounds = {
  centerLongitude: number;
  centerLatitude: number;
  radiusDegrees: number;
};
export type GeographicResult = {
  cities: NavigableCity[];
};