import React from 'react';
import type { ProjectedPoint } from '../../types/geography';

/**
 * The globe's one marker: a tiny bright point inside a thin dark border.
 *
 * It carries exactly one product meaning — **this location can be entered** — so
 * nothing else on the sphere may use it, and nothing that is not a destination is
 * drawn at all. Active state is carried by radius and border weight as well as
 * tone, so it never depends on hue alone.
 */
export function GeoMarker({
  point,
  radius,
  isActive = false




}: {point: ProjectedPoint;radius: number;isActive?: boolean;}) {
  return <circle cx={point.x} cy={point.y} r={isActive ? radius * 1.5 : radius} fill="var(--geo-city-dot)" stroke="var(--geo-city-dot-border)" strokeWidth={isActive ? 0.34 : 0.26} aria-hidden="true" />;
}