import React, { useMemo, useState } from 'react';
import type { GeoCamera, GeoId, NavigableCity } from '../../types/geography';
import { resolveScene } from '../../utils/geoScene';
import { GeoMarker } from './GeoMarker';

/**
 * Renders every navigable destination the current camera can see as one tiny
 * point, and nothing else. Identity is on demand: the city's name appears only
 * while its point is hovered or keyboard-focused, so the sphere stays a planet
 * rather than a labelled map.
 *
 * It owns transient exploration state only. Navigation stays outside: the layer
 * calls `onActivate` with the record, and the page decides the destination — so
 * the dataset or renderer can change without touching product routing.
 */
export function GeographicLayer({
  cities,
  camera,
  pixelSize,
  onActivate





}: {cities: NavigableCity[];camera: GeoCamera;pixelSize: number;onActivate: (city: NavigableCity) => void;}) {
  // Exploration state, local by design. It is not product selection.
  const [hoveredId, setHoveredId] = useState<GeoId | null>(null);
  const [focusedId, setFocusedId] = useState<GeoId | null>(null);
  const activeId = focusedId ?? hoveredId;

  // The scene derives from dataset + camera + LOD in one pipeline, so moving the
  // pointer never recomputes geography.
  const scene = useMemo(() => resolveScene({
    cities,
    camera,
    pixelSize
  }), [cities, camera, pixelSize]);
  const activeCity = activeId ? scene.cities.find((entry) => entry.id === activeId) ?? null : null;
  return <g>
      {scene.cities.map((entry) => <g key={entry.id}>
          <GeoMarker point={entry.point} radius={scene.dotRadius} isActive={entry.id === activeId} />
          {/* A real button, so keyboard and touch reach the destination without
           hover. Only visible destinations enter the tab order. */}
          <circle cx={entry.point.x} cy={entry.point.y} r={scene.hitRadius} fill="transparent" className="cursor-pointer focus:outline-none" tabIndex={0} role="button" aria-label={`${entry.city.name}. Open this location.`} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => {
        event.stopPropagation();
        onActivate(entry.city);
      }} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate(entry.city);
        }
      }} onPointerEnter={() => setHoveredId(entry.id)} onPointerLeave={() => setHoveredId((current) => current === entry.id ? null : current)} onFocus={() => setFocusedId(entry.id)} onBlur={() => setFocusedId((current) => current === entry.id ? null : current)} />
          {/* Keyboard focus gets a non-colour cue of its own. */}
          {focusedId === entry.id && <circle cx={entry.point.x} cy={entry.point.y} r={scene.dotRadius * 3} fill="none" stroke="var(--portalink-focus-ring)" strokeWidth="0.4" />}
        </g>)}

      {/* Exactly one label can exist at a time: the point being explored. There
         is no label budget or collision pass, because nothing else is drawn. */}
      {activeCity && <text x={activeCity.point.x + 2.4} y={activeCity.point.y - 1.8} fontSize="2.7" fontWeight="600" fill="var(--geo-label-primary)" stroke="var(--geo-label-halo)" strokeOpacity="0.75" strokeWidth="0.8" paintOrder="stroke" aria-hidden="true">
          {activeCity.city.name}
        </text>}
    </g>;
}