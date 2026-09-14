import React, { useEffect, useRef, useState } from 'react';
import { CityGlobe, getLocalTimeAt } from '../CityGlobe';
import { getCityAccentStyle } from '../../data/cityAccents';
import { formatCoordinates, formatSolarUtcOffset } from '../../utils/location';
import { motion as motionTokens } from '../../design-system/tokens';

/**
 * The one planet/city interaction in the product.
 *
 * States: neutral → activation (hover OR keyboard focus, identically) →
 * geographic reveal → pressed → navigate. Every city renders through this
 * component; differences come only from the typed data below, never from
 * per-city presentation branches.
 *
 * Navigation and selection are externally controlled. Only pointer/keyboard
 * activation and the running clock are local presentation state.
 */
export type CityPlanetData = {
  /** Stable location id. Drives the accent and any future route params. */
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2, when known. Omitted gracefully when it is not. */
  countryCode?: string;
  latitude: number;
  longitude: number;
};
/**
 * The fixed height of the identity block (name, clock, coordinates, offset).
 * Reserving it keeps every cell the same size whether or not a planet is
 * active, and half of it is the distance the planet rests below centre.
 */
const LABEL_SLOT_HEIGHT = 82;
export type CityPlanetProps = {
  city: CityPlanetData;
  /** True while this city's destination is the active one. */
  isSelected?: boolean;
  disabled?: boolean;
  /** Navigates through the existing application navigation. */
  onSelect: () => void;
};
export function CityPlanet({
  city,
  isSelected = false,
  disabled = false,
  onSelect
}: CityPlanetProps) {
  const [isActive, setIsActive] = useState(false);
  const [localTime, setLocalTime] = useState(() => getLocalTimeAt(city.longitude));
  const tileRef = useRef<HTMLButtonElement>(null);
  // The browse grid pages in without bound, so a per-tile timer multiplies: every
  // revealed city used to re-render itself once a second, forever, including the
  // dozens scrolled far above the viewport. The clock now runs only while its
  // tile is actually on screen, and at the cadence its own readout can change —
  // an hour-and-minute display cannot say anything new more than twice a minute.
  const [isOnScreen, setIsOnScreen] = useState(false);
  useEffect(() => {
    const tile = tileRef.current;
    if (!tile) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      setIsOnScreen(entries[0]?.isIntersecting ?? false);
    }, {
      rootMargin: '200px'
    });
    observer.observe(tile);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!isOnScreen) {
      return;
    }
    // Caught up immediately on becoming visible, so a tile scrolled back into
    // view is never showing a time from when it left.
    setLocalTime(getLocalTimeAt(city.longitude));
    const timer = window.setInterval(() => setLocalTime(getLocalTimeAt(city.longitude)), 30000);
    return () => window.clearInterval(timer);
  }, [city.longitude, isOnScreen]);

  // Real stored coordinates; the solar offset comes from the same longitude the
  // clock already runs on. Anything unavailable is simply omitted.
  const coordinates = formatCoordinates(city.latitude, city.longitude);
  const utcOffset = formatSolarUtcOffset(city.longitude);
  const geography = [coordinates, utcOffset].filter(Boolean).join(' · ');
  const isRevealed = (isActive || isSelected) && !disabled;

  // Hover and focus are the same activation, so keyboard users get the identical
  // geographic reveal without adding decorative continuous motion.
  const activate = () => {
    if (!disabled) {
      setIsActive(true);
    }
  };
  const deactivate = () => setIsActive(false);
  return <button ref={tileRef} type="button" data-portalink-tile="" disabled={disabled} onClick={onSelect} onMouseEnter={activate} onMouseLeave={deactivate} onFocus={activate} onBlur={deactivate} aria-current={isSelected ? 'true' : undefined} aria-label={`${city.name}${city.countryCode ? `, ${city.countryCode}` : ''}. Local solar time ${localTime}. ${geography}.`} style={{
    ...getCityAccentStyle(city.id),
    // The cell paints nothing of its own in any state.
    background: 'none',
    border: 0,
    boxShadow: 'none'
  }} className="group flex w-full cursor-pointer flex-col items-center justify-start border-0 bg-transparent pb-2 pt-3 focus:outline-none">
      {/* The planet is the whole cell at rest. */}
      <span className="block aspect-square w-full max-w-[160px] shrink-0 rounded-full">
        <CityGlobe latitude={city.latitude} longitude={city.longitude} activeAccent="var(--city-accent)" className="h-full w-full" />
      </span>

      {/* Identity only appears on activation — hover or keyboard focus,
         identically. The slot has no height at rest and opens as the planet is
         activated, so the row beneath eases down in step with the reveal
         rather than sitting behind a permanent empty gap. */}
      <span aria-hidden="true" className="flex w-full flex-col items-center overflow-hidden transition-[height,opacity,margin-top] ease-out motion-reduce:transition-none" style={{
      height: isRevealed ? LABEL_SLOT_HEIGHT : 0,
      marginTop: isRevealed ? 12 : 0,
      opacity: isRevealed ? 1 : 0,
      transitionDuration: `${motionTokens.duration.panel}ms`
    }}>
        <span className="flex max-w-full items-baseline justify-center gap-1.5">
          <span className="min-w-0 truncate text-center text-[15px] font-semibold leading-[1.3] tracking-[-0.01em]" style={{
          color: 'var(--city-accent-strong)'
        }}>{city.name}{city.countryCode ? ',' : ''}</span>
          {city.countryCode && <span className="shrink-0 text-[12px] font-medium uppercase leading-[1.3] tracking-[0.04em] text-[var(--portalink-text-tertiary)]">{city.countryCode}</span>}
        </span>
        <span className="mt-1.5 block text-center text-[14px] leading-[1.3] text-[var(--portalink-text-secondary)] [font-variant-numeric:tabular-nums]">{localTime}</span>
        <span className="mt-1.5 flex h-8 w-full flex-col items-center justify-start">
          <span className="max-w-full truncate text-center text-[11px] font-medium leading-[1.35] tracking-[0.02em]" style={{
          color: 'var(--city-accent)'
        }}>{coordinates}</span>
          {utcOffset && <span className="max-w-full truncate text-center text-[11px] leading-[1.35] text-[var(--portalink-text-tertiary)]">{utcOffset}</span>}
        </span>
      </span>
    </button>;
}
