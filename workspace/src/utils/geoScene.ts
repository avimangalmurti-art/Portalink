/**
 * The globe's single geographic pipeline:
 *
 *   navigable cities + camera → LOD → visible city points
 *
 * The globe is a precise navigation instrument: every visible destination is its
 * own point, so nothing is aggregated away and nothing is drawn that cannot be
 * entered. Everything here is pure and derived — no component holds a second
 * copy of a geographic collection, and nothing in this module knows about
 * routing, product state, or rendering technology.
 */

import { GLOBE_CENTER, GLOBE_RADIUS, projectToGlobe } from '../components/CityGlobe';
import type { GeoCamera, GeographicBounds, GeographicLod, GeographicScene, NavigableCity, ProjectedPoint, RenderCity } from '../types/geography';

/**
 * Semantic scale bands. Thresholds come from the camera's own scale, never from
 * viewport width — viewport size is a legibility constraint, not a geography.
 */
const LOD_BANDS: {
  lod: GeographicLod;
  minScale: number;
}[] = [{
  lod: 'local',
  minScale: 5.5
}, {
  lod: 'regional',
  minScale: 3
}, {
  lod: 'continental',
  minScale: 1.7
}, {
  lod: 'global',
  minScale: 0
}];
export function resolveLod(scale: number): GeographicLod {
  return LOD_BANDS.find((band) => scale >= band.minScale)?.lod ?? 'global';
}

/**
 * Marker geometry per scale, in viewBox units. Dots stay deliberately tiny so
 * the sphere reads as a planet; they gain only a fraction of definition as the
 * camera closes in.
 */
const DOT_RADIUS: Record<GeographicLod, number> = {
  global: 0.7,
  continental: 0.78,
  regional: 0.86,
  local: 0.95
};

/** The angular window on screen — the query a spatial service would receive. */
export function resolveBounds(camera: GeoCamera): GeographicBounds {
  return {
    centerLongitude: camera.centerLongitude,
    centerLatitude: camera.centerLatitude,
    radiusDegrees: Math.min(90, 90 / Math.max(camera.scale, 1))
  };
}

/**
 * Project a record and apply the camera's zoom about the globe's centre.
 * Returns null for anything back-facing or pushed outside the visible disc, so
 * occluded geography is never rendered or focusable.
 */
function place(longitude: number, latitude: number, camera: GeoCamera): ProjectedPoint | null {
  const projected = projectToGlobe(longitude, latitude, camera.centerLongitude, camera.centerLatitude);
  if (!projected) {
    return null;
  }
  const x = GLOBE_CENTER + (projected.x - GLOBE_CENTER) * camera.scale;
  const y = GLOBE_CENTER + (projected.y - GLOBE_CENTER) * camera.scale;
  if (Math.hypot(x - GLOBE_CENTER, y - GLOBE_CENTER) > GLOBE_RADIUS - 0.6) {
    return null;
  }
  return {
    x,
    y
  };
}

/**
 * The scene depends only on dataset + camera + viewport, never on interaction —
 * so hovering or focusing a city cannot recompute geography. Hover identity is
 * layered on top by the renderer.
 */
export function resolveScene({
  cities,
  camera,
  pixelSize





}: {cities: NavigableCity[];camera: GeoCamera; /** Rendered size of the globe in CSS pixels, used to size the hit target. */pixelSize: number;}): GeographicScene {
  const lod = resolveLod(camera.scale);
  const dotRadius = DOT_RADIUS[lod];
  const visible: RenderCity[] = [];
  for (const city of cities) {
    const point = place(city.longitude, city.latitude, camera);
    if (point) {
      visible.push({
        id: city.id,
        city,
        point
      });
    }
  }
  // Centre-most first, so the nearest destination wins an overlapping hit and
  // pointer behaviour stays deterministic as the globe turns.
  visible.sort((a, b) => Math.hypot(b.point.x - GLOBE_CENTER, b.point.y - GLOBE_CENTER) - Math.hypot(a.point.x - GLOBE_CENTER, a.point.y - GLOBE_CENTER));
  // The dot stays tiny while the target stays reachable: ~22 CSS pixels,
  // converted into the 104-unit viewBox, so touch and pointer both aim easily.
  const hitRadius = Math.max(dotRadius + 0.9, 22 / Math.max(pixelSize, 1) * 104 / 2);
  return {
    lod,
    cities: visible,
    dotRadius,
    hitRadius
  };
}