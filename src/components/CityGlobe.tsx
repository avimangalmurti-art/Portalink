import React, { useId, useMemo } from 'react';
import { worldOutline } from '../data/worldOutline';
type CityGlobeProps = {
  latitude: number;
  longitude: number;
  /**
   * Colour of the active marker. Callers pass a semantic value (e.g.
   * `var(--city-accent)`); the globe never decides which colour a place gets.
   */
  activeAccent?: string;
  className?: string;
};
type Point = {
  x: number;
  y: number;
};
const RADIUS = 50;
const CENTER = 52;
export const GLOBE_RADIUS = RADIUS;
export const GLOBE_CENTER = CENTER;
// Portalink's cartography reads as a small planet seen from orbit: deep
// blue-green water, muted varied land, one directional sun, a thin atmosphere.
// Ocean, from deepest shadow through to the illuminated crest.
const OCEAN_SHADOW = '#03202F';
const OCEAN_DARK = '#063C56';
const OCEAN_MID = '#0A6885';
const OCEAN_LIT = '#0E93B0';
const OCEAN_SPECULAR = '#46BCD6';
// Night water and land settle to a near-black blue-green rather than navy.
const NIGHT_SHADOW = '#02090F';
const NIGHT_OCEAN_DARK = '#04182B';
const NIGHT_LAND_BASE = '#0F2A1E';
// Terrain families. Generalised, never a satellite texture: at 28px these must
// still resolve as one continent rather than noise.
const DAY_LAND_TONES = ['#3E8F45', '#1C7231', '#7C963A', '#B08E3C', '#3E8F45', '#C29140', '#1C7231'];
const NIGHT_LAND_TONES = ['#0F2A1E', '#123421', '#173622', '#1B3421', '#0F2A1E', '#1D3721', '#112E20'];
// Continental shelves: the pale band of shallow water that hugs a coastline.
const SHELF_DAY = '#12A6C4';
const SHELF_NIGHT = '#073448';
// Polar ice, and the broad biome washes that break up large landmasses.
const ICE_DAY = '#E2F5F8';
const ICE_NIGHT = '#2E515D';
const BIOME_ARID = '#CE9736';
const BIOME_DENSE = '#127028';
// Atmosphere is a rim, not a halo.
const ATMOSPHERE_RIM = '#4CD3F2';
const ATMOSPHERE_BRIGHT = '#8CE9FB';
const CLOUD = '#F2FAFB';
// Kept for the legacy colour contract consumed elsewhere.
const DAY_OCEAN = OCEAN_MID;
const NIGHT_OCEAN = NIGHT_OCEAN_DARK;
const DEEP_OCEAN = OCEAN_SHADOW;
const DAY_LAND = DAY_LAND_TONES[0];
const NIGHT_LAND = NIGHT_LAND_BASE;
const DAY_COAST = '#A9E2B8';
const NIGHT_COAST = '#26583F';
const GRID_LINE = 'rgba(196, 216, 226, 0.16)';
const ATMOSPHERE = 'rgba(114, 199, 221, 0.3)';
const MARKER = '#FFFFFF';
export const MARKER_HALO = 'rgba(255, 255, 255, 0.28)';
// Blood orange marks the active location — the one indicator allowed to read
// hot against the cool cartography.
export const FRIENDLY_ACCENT = '#FF4A08';
export const LAND_TONES_DAY = DAY_LAND_TONES;
export const LAND_TONES_NIGHT = NIGHT_LAND_TONES;
export const GLOBE_ATMOSPHERE = {
  rim: ATMOSPHERE_RIM,
  bright: ATMOSPHERE_BRIGHT,
  cloud: CLOUD,
  oceanShadow: OCEAN_SHADOW,
  oceanDark: OCEAN_DARK,
  oceanMid: OCEAN_MID,
  oceanLit: OCEAN_LIT,
  oceanSpecular: OCEAN_SPECULAR,
  nightShadow: NIGHT_SHADOW,
  nightOceanDark: NIGHT_OCEAN_DARK,
  shelfDay: SHELF_DAY,
  shelfNight: SHELF_NIGHT,
  iceDay: ICE_DAY,
  iceNight: ICE_NIGHT,
  biomeArid: BIOME_ARID,
  biomeDense: BIOME_DENSE
};
export const GLOBE_COLORS = {
  dayOcean: DAY_OCEAN,
  nightOcean: NIGHT_OCEAN,
  deepOcean: DEEP_OCEAN,
  dayLand: DAY_LAND,
  nightLand: NIGHT_LAND,
  coast: DAY_COAST,
  nightCoast: NIGHT_COAST,
  grid: GRID_LINE,
  atmosphere: ATMOSPHERE,
  marker: MARKER,
  markerHalo: MARKER_HALO,
  accent: FRIENDLY_ACCENT
};
const toRadians = (degrees: number) => degrees * Math.PI / 180;

// A city is "night" when its local solar hour falls outside 6am–6pm, so the
// browse grid reads as a real planet: some places lit, some asleep.
// Local wall-clock time for a longitude, as HH:MM:SS.
export function getLocalTimeAt(longitude: number, now: Date = new Date()): string {
  const utcMilliseconds = now.getTime() + now.getTimezoneOffset() * 60000;
  const localDate = new Date(utcMilliseconds + longitude / 15 * 3600000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(localDate.getHours())}:${pad(localDate.getMinutes())}:${pad(localDate.getSeconds())}`;
}
export function isNightAt(longitude: number, now: Date = new Date()): boolean {
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const localHours = (utcHours + longitude / 15 + 24) % 24;
  return localHours < 6 || localHours >= 18;
}
function project(longitude: number, latitude: number, centerLongitude: number, centerLatitude: number): Point | null {
  const lambda = toRadians(longitude - centerLongitude);
  const phi = toRadians(latitude);
  const phi0 = toRadians(centerLatitude);
  const cosC = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);
  if (cosC <= 0) {
    return null;
  }
  return {
    x: CENTER + RADIUS * Math.cos(phi) * Math.sin(lambda),
    y: CENTER - RADIUS * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda))
  };
}

// Coastlines are smoothed through their midpoints: geographic silhouettes with
// clean, anti-aliased edges rather than plotted polygons.
function coastPath(points: Point[]): string {
  if (points.length < 3) {
    return '';
  }
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const midpoint = {
      x: (current.x + next.x) / 2,
      y: (current.y + next.y) / 2
    };
    path += ` Q${current.x.toFixed(2)} ${current.y.toFixed(2)} ${midpoint.x.toFixed(2)} ${midpoint.y.toFixed(2)}`;
  }
  return `${path} Z`;
}
export const projectToGlobe = project;
export function buildLandPaths(centerLongitude: number, centerLatitude: number): string[] {
  return worldOutline.map((ring) => {
    const points = ring.map(([longitude, latitude]) => project(longitude, latitude, centerLongitude, centerLatitude)).filter((point): point is Point => point !== null);
    return coastPath(points);
  }).filter(Boolean);
}

// Graticule arcs read as an instrument rather than decoration.
function meridianPath(offsetDegrees: number, centerLongitude: number, centerLatitude: number): string {
  const points: Point[] = [];
  for (let latitude = -80; latitude <= 80; latitude += 4) {
    const point = project(offsetDegrees, latitude, centerLongitude, centerLatitude);
    if (point) {
      points.push(point);
    }
  }
  if (points.length < 2) {
    return '';
  }
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}
function parallelPath(latitude: number, centerLongitude: number, centerLatitude: number): string {
  const points: Point[] = [];
  for (let longitude = -180; longitude <= 180; longitude += 4) {
    const point = project(longitude, latitude, centerLongitude, centerLatitude);
    if (point) {
      points.push(point);
    }
  }
  if (points.length < 2) {
    return '';
  }
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}
// Both poles as arcs that follow the sphere, shared by every globe so ice sits
// in the same place on all of them.
export function buildPolarCaps(centerLongitude: number, centerLatitude: number): string[] {
  return [parallelPath(76, centerLongitude, centerLatitude), parallelPath(-76, centerLongitude, centerLatitude)].filter(Boolean);
}
export function CityGlobe({
  latitude,
  longitude,
  activeAccent = FRIENDLY_ACCENT,
  className
}: CityGlobeProps) {
  const instanceId = useId().replace(/[:]/g, '');
  const isNight = isNightAt(longitude);
  const ocean = isNight ? NIGHT_OCEAN : DAY_OCEAN;
  const coast = isNight ? NIGHT_COAST : DAY_COAST;
  const landTones = isNight ? NIGHT_LAND_TONES : DAY_LAND_TONES;
  const centerLongitude = longitude;
  const landPaths = useMemo(() => buildLandPaths(centerLongitude, latitude), [centerLongitude, latitude]);
  // The equator and the two mid-latitudes carry the reading; the rest of the
  // graticule sits a step fainter so the grid has structure without noise.
  const graticule = useMemo(() => [meridianPath(centerLongitude, centerLongitude, latitude), parallelPath(0, centerLongitude, latitude), parallelPath(35, centerLongitude, latitude), parallelPath(-35, centerLongitude, latitude)].filter(Boolean), [centerLongitude, latitude]);
  const graticuleFine = useMemo(() => [meridianPath(centerLongitude + 60, centerLongitude, latitude), meridianPath(centerLongitude - 60, centerLongitude, latitude), parallelPath(62, centerLongitude, latitude), parallelPath(-62, centerLongitude, latitude)].filter(Boolean), [centerLongitude, latitude]);
  // Ice sits on the two poles, following the sphere's curvature.
  const polarCaps = useMemo(() => buildPolarCaps(centerLongitude, latitude), [centerLongitude, latitude]);
  const clipId = `globe-clip-${instanceId}`;
  const landMaskId = `globe-landmask-${instanceId}`;
  const softBlurId = `globe-softblur-${instanceId}`;
  const oceanId = `globe-ocean-${instanceId}`;
  const shadeId = `globe-shade-${instanceId}`;
  const bounceId = `globe-bounce-${instanceId}`;
  const specularId = `globe-specular-${instanceId}`;
  const limbId = `globe-limb-${instanceId}`;
  const sunLimbId = `globe-sunlimb-${instanceId}`;
  const cloudMaskId = `globe-cloudmask-${instanceId}`;
  const cloudBlurId = `globe-cloudblur-${instanceId}`;
  return <svg viewBox="0 0 104 104" role="presentation" aria-hidden="true" className={className}>
      <defs>
        <clipPath id={clipId}>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} />
        </clipPath>
        {/* Water is never a flat fill: it grades from the illuminated crest
           near the sun to the deep shadow at the far limb. */}
        <radialGradient id={oceanId} cx="32%" cy="26%" r="86%">
          <stop offset="0%" stopColor={isNight ? NIGHT_OCEAN_DARK : OCEAN_LIT} />
          <stop offset="38%" stopColor={isNight ? NIGHT_OCEAN_DARK : OCEAN_MID} />
          <stop offset="72%" stopColor={isNight ? NIGHT_SHADOW : OCEAN_DARK} />
          <stop offset="100%" stopColor={isNight ? NIGHT_SHADOW : OCEAN_SHADOW} />
        </radialGradient>
        {/* One directional sun. The terminator feathers across the sphere
           instead of cutting it in half. */}
        <radialGradient id={shadeId} cx="30%" cy="24%" r="92%">
          <stop offset="0%" stopColor={ATMOSPHERE_BRIGHT} stopOpacity={isNight ? 0.02 : 0.1} />
          <stop offset="34%" stopColor={ATMOSPHERE_BRIGHT} stopOpacity="0" />
          <stop offset="58%" stopColor={NIGHT_SHADOW} stopOpacity={isNight ? 0.28 : 0.1} />
          <stop offset="82%" stopColor={NIGHT_SHADOW} stopOpacity={isNight ? 0.6 : 0.34} />
          <stop offset="100%" stopColor={NIGHT_SHADOW} stopOpacity={isNight ? 0.78 : 0.58} />
        </radialGradient>
        {/* Reflected sky along part of the shadow edge, so the dark side reads
           as turned away rather than painted out. */}
        <radialGradient id={bounceId} cx="78%" cy="82%" r="46%">
          <stop offset="0%" stopColor={ATMOSPHERE_RIM} stopOpacity={isNight ? 0.07 : 0.1} />
          <stop offset="100%" stopColor={ATMOSPHERE_RIM} stopOpacity="0" />
        </radialGradient>
        {/* Broad, low-contrast ocean sheen. Never a chrome reflection. */}
        <radialGradient id={specularId} cx="36%" cy="28%" r="34%">
          <stop offset="0%" stopColor={OCEAN_SPECULAR} stopOpacity={isNight ? 0 : 0.28} />
          <stop offset="100%" stopColor={OCEAN_SPECULAR} stopOpacity="0" />
        </radialGradient>
        {/* A hairline atmosphere around the whole circumference. */}
        <radialGradient id={limbId} cx="50%" cy="50%" r="50%">
          <stop offset="93%" stopColor={ATMOSPHERE_RIM} stopOpacity="0" />
          <stop offset="99%" stopColor={ATMOSPHERE_RIM} stopOpacity={isNight ? 0.16 : 0.26} />
          <stop offset="100%" stopColor={ATMOSPHERE_RIM} stopOpacity={isNight ? 0.1 : 0.16} />
        </radialGradient>
        {/* Brightest where the sun grazes the limb. */}
        <radialGradient id={sunLimbId} cx="30%" cy="24%" r="78%">
          <stop offset="70%" stopColor={ATMOSPHERE_BRIGHT} stopOpacity="0" />
          <stop offset="100%" stopColor={ATMOSPHERE_BRIGHT} stopOpacity={isNight ? 0.1 : 0.22} />
        </radialGradient>
        <filter id={cloudBlurId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <filter id={softBlurId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        {/* Biome washes are painted through the continents themselves, so
           interior variation never spills into the water. */}
        <mask id={landMaskId}>
          {landPaths.map((path, index) => <path key={`landmask-${index}`} d={path} fill="#FFFFFF" />)}
        </mask>
        {/* Cloud cover thins out as it wraps onto the night side. */}
        <mask id={cloudMaskId}>
          <radialGradient id={`${cloudMaskId}-grad`} cx="32%" cy="26%" r="82%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.7" />
            <stop offset="85%" stopColor="#FFFFFF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${cloudMaskId}-grad)`} />
        </mask>
      </defs>
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={ocean} />
      <g clipPath={`url(#${clipId})`}>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${oceanId})`} />
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${specularId})`} />
        {/* Shallow water shelves the coastlines, so continents sit in the sea
           rather than on top of it. */}
        <g filter={`url(#${softBlurId})`} opacity={isNight ? 0.55 : 0.82}>
          {landPaths.map((path, index) => <path key={`shelf-${index}`} d={path} fill="none" stroke={isNight ? SHELF_NIGHT : SHELF_DAY} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />)}
        </g>
        {/* Matte, generalised terrain. The coast keeps a hairline of
           definition so continents still resolve at 28px. */}
        {landPaths.map((path, index) => <path key={`land-${index}`} d={path} fill={landTones[(index * 3 + 1) % landTones.length]} stroke={coast} strokeOpacity={isNight ? 0.3 : 0.32} strokeWidth="0.3" strokeLinejoin="round" strokeLinecap="round" />)}
        {/* Broad interior biome variation: dry belts and denser vegetation,
           generalised so it never becomes texture. */}
        <g mask={`url(#${landMaskId})`} opacity={isNight ? 0.28 : 0.66}>
          <g filter={`url(#${cloudBlurId})`}>
            <ellipse cx="30" cy="34" rx="16" ry="7" fill={BIOME_DENSE} />
            <ellipse cx="58" cy="30" rx="14" ry="6" fill={BIOME_ARID} />
            <ellipse cx="70" cy="52" rx="12" ry="8" fill={BIOME_DENSE} />
            <ellipse cx="38" cy="62" rx="18" ry="8" fill={BIOME_ARID} />
            <ellipse cx="62" cy="78" rx="13" ry="6" fill={BIOME_DENSE} />
            <ellipse cx="20" cy="76" rx="11" ry="6" fill={BIOME_ARID} />
          </g>
        </g>
        {/* Polar ice, curving with the sphere. */}
        <g filter={`url(#${softBlurId})`} opacity={isNight ? 0.34 : 0.6}>
          {polarCaps.map((path, index) => <path key={`cap-${index}`} d={path} fill="none" stroke={isNight ? ICE_NIGHT : ICE_DAY} strokeWidth="7" strokeLinecap="round" />)}
        </g>
        {/* Graticule reads as an instrument overlay, subordinate to the
           planet's own surface. */}
        {graticuleFine.map((path, index) => <path key={`grid-fine-${index}`} d={path} fill="none" stroke={GRID_LINE} strokeOpacity="0.55" strokeWidth="0.28" />)}
        {graticule.map((path, index) => <path key={`grid-${index}`} d={path} fill="none" stroke={GRID_LINE} strokeWidth="0.35" />)}
        {/* Sparse, broken cloud bands drifting over the surface. */}
        <g mask={`url(#${cloudMaskId})`} opacity={isNight ? 0.2 : 0.34}>
          <g>
            {/* Two passes: broad banding, then a few tighter cells sitting in
               it, which is what stops the cover reading as one smear. */}
            <g filter={`url(#${cloudBlurId})`} fill={CLOUD}>
              {[0, 104].map((offset) => <g key={offset} transform={`translate(${offset} 0)`}>
                  <ellipse cx="24" cy="30" rx="15" ry="4.4" />
                  <ellipse cx="42" cy="24" rx="9" ry="3.2" />
                  <ellipse cx="66" cy="41" rx="13" ry="3.8" />
                  <ellipse cx="34" cy="58" rx="17" ry="5" />
                  <ellipse cx="72" cy="68" rx="10" ry="3.4" />
                  <ellipse cx="50" cy="82" rx="14" ry="4" />
                  <ellipse cx="16" cy="72" rx="8" ry="3" />
                </g>)}
            </g>
            <g filter={`url(#${softBlurId})`} fill={CLOUD} opacity="0.75">
              {[0, 104].map((offset) => <g key={`detail-${offset}`} transform={`translate(${offset} 0)`}>
                  <ellipse cx="20" cy="29" rx="5.5" ry="2.2" />
                  <ellipse cx="33" cy="32" rx="4" ry="1.8" />
                  <ellipse cx="61" cy="39" rx="5" ry="2" />
                  <ellipse cx="74" cy="44" rx="3.6" ry="1.6" />
                  <ellipse cx="29" cy="57" rx="6" ry="2.4" />
                  <ellipse cx="44" cy="60" rx="4.4" ry="1.9" />
                  <ellipse cx="55" cy="81" rx="5" ry="2" />
                  <ellipse cx="68" cy="70" rx="3.4" ry="1.5" />
                </g>)}
            </g>
          </g>
        </g>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${shadeId})`} />
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${bounceId})`} />
      </g>
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${limbId})`} />
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${sunLimbId})`} />
      {/* The recurring Portalink marker carries the location's own colour, so a
          planet remains identifiable without continuous attention-seeking motion. */}
      <g>
        <circle cx={CENTER} cy={CENTER} r="4.4" fill={MARKER_HALO} />
        <circle cx={CENTER} cy={CENTER} r="3.6" fill="none" stroke={DEEP_OCEAN} strokeOpacity="0.5" strokeWidth="1.5" />
        <circle cx={CENTER} cy={CENTER} r="3.6" fill="none" stroke={activeAccent} strokeOpacity="0.95" strokeWidth="0.8" />
        <circle cx={CENTER} cy={CENTER} r="1.5" fill={activeAccent} />
      </g>
    </svg>;
}
