import { ScreenBack } from '../presentation/mobile/MobileBackNavigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { cities, type City } from '../data/cities';
import { BroadcastTicker } from './BroadcastTicker';
import { getCityFacts } from '../data/cityFacts';
import { getCountryCode } from '../data/countryCodes';
import { buildLandPaths, buildPolarCaps, getLocalTimeAt, GLOBE_ATMOSPHERE, GLOBE_CENTER, GLOBE_COLORS, GLOBE_RADIUS, isNightAt, LAND_TONES_DAY, LAND_TONES_NIGHT } from './CityGlobe';
import { GeographicLayer } from './portalink/GeographicLayer';
import { WorldViewToggle } from './portalink/WorldViewToggle';
import { toCityDestination } from '../data/geography';
import { useServices } from '../contexts/ServicesContext';
import type { LiveSessionsState } from '../features/live/useLiveSessions';
import { PORTALINK_SPLASH_EXIT_EVENT } from '../app/splashLifecycle';
type PortalinkPageProps = {
  onBack: () => void;
  onSelectCity: (city: City) => void;
  /** The live-session lifecycle, owned by `useLiveSessions` in the app shell. */
  live: LiveSessionsState;
};
// Camera scale bounds. 1 is the whole planet; closer scales let the LOD resolver
// hand out progressively more geographic detail.
const MIN_SCALE = 1;
const MAX_SCALE = 8;

// The interactive planet: drag to turn the world, then pick the city whose
// content you want to see.
export function PortalinkPage({
  onBack,
  onSelectCity,
  live
}: PortalinkPageProps) {
  const [centerLongitude, setCenterLongitude] = useState(-20);
  const [centerLatitude, setCenterLatitude] = useState(18);
  const [scale, setScale] = useState(MIN_SCALE);
  const [isDragging, setIsDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [isGlobeDetailReady, setIsGlobeDetailReady] = useState(() =>
    typeof document === 'undefined' || !document.querySelector('[data-portalink-splash]')
  );
  // Rendered size of the globe, so cluster separation and the label budget are
  // resolved in real screen space rather than viewBox units.
  const [pixelSize, setPixelSize] = useState(560);
  const globeRef = useRef<HTMLDivElement | null>(null);
  // Geographic records enter through the service boundary, so a spatial source
  // can replace the local dataset without touching the globe.
  const {
    geography: geographyService
  } = useServices();
  const geography = geographyService.readLocalGeography();
  const dragRef = useRef<{
    x: number;
    y: number;
    longitude: number;
    latitude: number;
  } | null>(null);
  useEffect(() => {
    const element = globeRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box?.width) {
        setPixelSize(box.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (isGlobeDetailReady) return undefined;

    let frameId: number | null = null;
    const revealGlobeDetail = () => {
      if (frameId !== null) return;
      // Give the browser one clean frame after removing the splash layer, then
      // schedule the detailed globe as non-urgent rendering work.
      frameId = window.requestAnimationFrame(() => {
        React.startTransition(() => setIsGlobeDetailReady(true));
      });
    };

    window.addEventListener(PORTALINK_SPLASH_EXIT_EVENT, revealGlobeDetail, { once: true });
    if (!document.querySelector('[data-portalink-splash]')) revealGlobeDetail();

    return () => {
      window.removeEventListener(PORTALINK_SPLASH_EXIT_EVENT, revealGlobeDetail);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [isGlobeDetailReady]);
  function zoomBy(delta: number) {
    setScale((current) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * delta)));
  }
  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      longitude: centerLongitude,
      latitude: centerLatitude
    };
    setIsDragging(true);
  }
  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    if (!start) {
      return;
    }
    // Turning slows as the camera closes in, so drag distance stays predictable.
    const sensitivity = 0.35 / Math.max(scale, 1);
    setCenterLongitude(start.longitude - (event.clientX - start.x) * sensitivity);
    setCenterLatitude(Math.max(-80, Math.min(80, start.latitude + (event.clientY - start.y) * sensitivity)));
  }
  function endDrag() {
    dragRef.current = null;
    setIsDragging(false);
  }
  function focusCity(city: City) {
    setCenterLongitude(city.longitude);
    setCenterLatitude(city.latitude);
  }
  const landPaths = useMemo(
    () => isGlobeDetailReady ? buildLandPaths(centerLongitude, centerLatitude) : [],
    [centerLatitude, centerLongitude, isGlobeDetailReady]
  );
  const polarCaps = useMemo(
    () => isGlobeDetailReady ? buildPolarCaps(centerLongitude, centerLatitude) : [],
    [centerLatitude, centerLongitude, isGlobeDetailReady]
  );
  const isNight = isNightAt(centerLongitude);
  // Memoized so the geographic pipeline only reruns when the camera moves.
  const camera = useMemo(() => ({
    centerLongitude,
    centerLatitude,
    scale
  }), [centerLongitude, centerLatitude, scale]);
  const suggestions = query.trim() ? cities.filter((city) => city.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 5) : [];
  return <div className="relative flex h-full min-h-full w-full flex-col overflow-hidden bg-[var(--portalink-bg-primary)]">
      {/* The global header contract places this page control on the exact same
          centerline as the adjacent main-navigation header control. */}
      <ScreenBack><div data-mobile-safe-header="" className="ps-panel-toolbar global-control-header relative z-10 shrink-0 justify-start gap-1 px-2">
        <WorldViewToggle onToggle={onBack} />
      </div></ScreenBack>

      {/* Starfield backdrop. */}
      <div aria-hidden="true" className="portalink-stars pointer-events-none absolute inset-0" />

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6">
        {/* Rotation keeps pointer priority; zoom is a separate gesture, so a
           drag can never resolve into opening a city. */}
        <div ref={globeRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={(event) => {
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08);
      }} onKeyDown={(event) => {
        if (event.key === '+' || event.key === '=') {
          zoomBy(1.25);
        }
        if (event.key === '-' || event.key === '_') {
          zoomBy(1 / 1.25);
        }
      }} role="group" tabIndex={0} aria-label="Globe. Drag to turn; press plus or minus to change how much geographic detail is shown." className={`aspect-square w-full max-w-[min(72vh,720px)] touch-none select-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portalink-focus-ring)] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
          <svg viewBox="0 0 104 104" className="h-full w-full" role="img" aria-label="Interactive globe. Drag to turn, then choose a city.">
            <defs>
              <clipPath id="portalink-clip">
                <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_RADIUS} />
              </clipPath>
              {/* Same directional sun, atmosphere and water grading as the
                 city globes, at browse scale. */}
              <radialGradient id="portalink-ocean" cx="32%" cy="26%" r="86%">
                <stop offset="0%" stopColor={isNight ? GLOBE_ATMOSPHERE.nightOceanDark : GLOBE_ATMOSPHERE.oceanLit} />
                <stop offset="38%" stopColor={isNight ? GLOBE_ATMOSPHERE.nightOceanDark : GLOBE_ATMOSPHERE.oceanMid} />
                <stop offset="72%" stopColor={isNight ? GLOBE_ATMOSPHERE.nightShadow : GLOBE_ATMOSPHERE.oceanDark} />
                <stop offset="100%" stopColor={isNight ? GLOBE_ATMOSPHERE.nightShadow : GLOBE_ATMOSPHERE.oceanShadow} />
              </radialGradient>
              <radialGradient id="portalink-specular" cx="36%" cy="28%" r="34%">
                <stop offset="0%" stopColor={GLOBE_ATMOSPHERE.oceanSpecular} stopOpacity={isNight ? 0 : 0.26} />
                <stop offset="100%" stopColor={GLOBE_ATMOSPHERE.oceanSpecular} stopOpacity="0" />
              </radialGradient>
              <radialGradient id="portalink-shade" cx="30%" cy="24%" r="92%">
                <stop offset="0%" stopColor={GLOBE_ATMOSPHERE.bright} stopOpacity={isNight ? 0.02 : 0.09} />
                <stop offset="34%" stopColor={GLOBE_ATMOSPHERE.bright} stopOpacity="0" />
                <stop offset="58%" stopColor={GLOBE_ATMOSPHERE.nightShadow} stopOpacity={isNight ? 0.28 : 0.1} />
                <stop offset="82%" stopColor={GLOBE_ATMOSPHERE.nightShadow} stopOpacity={isNight ? 0.6 : 0.34} />
                <stop offset="100%" stopColor={GLOBE_ATMOSPHERE.nightShadow} stopOpacity={isNight ? 0.78 : 0.58} />
              </radialGradient>
              <radialGradient id="portalink-bounce" cx="78%" cy="82%" r="46%">
                <stop offset="0%" stopColor={GLOBE_ATMOSPHERE.rim} stopOpacity={isNight ? 0.07 : 0.1} />
                <stop offset="100%" stopColor={GLOBE_ATMOSPHERE.rim} stopOpacity="0" />
              </radialGradient>
              <radialGradient id="portalink-limb" cx="50%" cy="50%" r="50%">
                <stop offset="93%" stopColor={GLOBE_ATMOSPHERE.rim} stopOpacity="0" />
                <stop offset="99%" stopColor={GLOBE_ATMOSPHERE.rim} stopOpacity={isNight ? 0.16 : 0.26} />
                <stop offset="100%" stopColor={GLOBE_ATMOSPHERE.rim} stopOpacity={isNight ? 0.1 : 0.16} />
              </radialGradient>
              <radialGradient id="portalink-sunlimb" cx="30%" cy="24%" r="78%">
                <stop offset="70%" stopColor={GLOBE_ATMOSPHERE.bright} stopOpacity="0" />
                <stop offset="100%" stopColor={GLOBE_ATMOSPHERE.bright} stopOpacity={isNight ? 0.1 : 0.22} />
              </radialGradient>
              <filter id="portalink-cloudblur" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.6" />
              </filter>
              <filter id="portalink-softblur" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.6" />
              </filter>
              <mask id="portalink-landmask">
                <g transform={`translate(${GLOBE_CENTER} ${GLOBE_CENTER}) scale(${scale}) translate(${-GLOBE_CENTER} ${-GLOBE_CENTER})`}>
                  {landPaths.map((path, index) => <path key={`landmask-${index}`} d={path} fill="#FFFFFF" />)}
                </g>
              </mask>
              <radialGradient id="portalink-cloudmask-grad" cx="32%" cy="26%" r="82%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
                <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.7" />
                <stop offset="85%" stopColor="#FFFFFF" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </radialGradient>
              <mask id="portalink-cloudmask">
                <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_RADIUS} fill="url(#portalink-cloudmask-grad)" />
              </mask>
            </defs>
            <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_RADIUS} fill={isNight ? GLOBE_COLORS.nightOcean : GLOBE_COLORS.dayOcean} />
            <g clipPath="url(#portalink-clip)">
              <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_RADIUS} fill="url(#portalink-ocean)" />
              <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_RADIUS} fill="url(#portalink-specular)" />
              {isGlobeDetailReady && <>{/* Cartography scales with the camera; markers do not, so they stay
                 legible at every level of detail. */}
              <g transform={`translate(${GLOBE_CENTER} ${GLOBE_CENTER}) scale(${scale}) translate(${-GLOBE_CENTER} ${-GLOBE_CENTER})`}>
                {/* Shallow water shelves the coastlines. */}
                <g filter="url(#portalink-softblur)" opacity={isNight ? 0.55 : 0.82}>
                  {landPaths.map((path, index) => <path key={`shelf-${index}`} d={path} fill="none" stroke={isNight ? GLOBE_ATMOSPHERE.shelfNight : GLOBE_ATMOSPHERE.shelfDay} strokeWidth={2.6 / scale} strokeLinejoin="round" strokeLinecap="round" />)}
                </g>
                {landPaths.map((path, index) => <path key={`land-${index}`} d={path} fill={(isNight ? LAND_TONES_NIGHT : LAND_TONES_DAY)[(index * 3 + 1) % LAND_TONES_DAY.length]} stroke={isNight ? GLOBE_COLORS.nightCoast : GLOBE_COLORS.coast} strokeOpacity="0.3" strokeWidth={0.25 / scale} strokeLinejoin="round" />)}
              </g>
              {/* Broad interior biome variation, painted through the land. */}
              <g mask="url(#portalink-landmask)" opacity={isNight ? 0.28 : 0.62}>
                <g filter="url(#portalink-cloudblur)">
                  <ellipse cx="30" cy="34" rx="16" ry="7" fill={GLOBE_ATMOSPHERE.biomeDense} />
                  <ellipse cx="58" cy="30" rx="14" ry="6" fill={GLOBE_ATMOSPHERE.biomeArid} />
                  <ellipse cx="70" cy="52" rx="12" ry="8" fill={GLOBE_ATMOSPHERE.biomeDense} />
                  <ellipse cx="38" cy="62" rx="18" ry="8" fill={GLOBE_ATMOSPHERE.biomeArid} />
                  <ellipse cx="62" cy="78" rx="13" ry="6" fill={GLOBE_ATMOSPHERE.biomeDense} />
                  <ellipse cx="20" cy="76" rx="11" ry="6" fill={GLOBE_ATMOSPHERE.biomeArid} />
                </g>
              </g>
              {/* Polar ice, curving with the sphere. */}
              <g filter="url(#portalink-softblur)" opacity={isNight ? 0.34 : 0.6}>
                {polarCaps.map((path, index) => <path key={`cap-${index}`} d={path} fill="none" stroke={isNight ? GLOBE_ATMOSPHERE.iceNight : GLOBE_ATMOSPHERE.iceDay} strokeWidth="7" strokeLinecap="round" />)}
              </g>
              <g mask="url(#portalink-cloudmask)" opacity={isNight ? 0.2 : 0.32}>
                <g filter="url(#portalink-cloudblur)" fill={GLOBE_ATMOSPHERE.cloud}>
                  <ellipse cx="24" cy="30" rx="15" ry="4.4" />
                  <ellipse cx="42" cy="24" rx="9" ry="3.2" />
                  <ellipse cx="66" cy="41" rx="13" ry="3.8" />
                  <ellipse cx="34" cy="58" rx="17" ry="5" />
                  <ellipse cx="72" cy="68" rx="10" ry="3.4" />
                  <ellipse cx="50" cy="82" rx="14" ry="4" />
                  <ellipse cx="16" cy="72" rx="8" ry="3" />
                </g>
                {/* Tighter cells inside the banding stop the cover reading as
                   one smear. */}
                <g filter="url(#portalink-softblur)" fill={GLOBE_ATMOSPHERE.cloud} opacity="0.75">
                  <ellipse cx="20" cy="29" rx="5.5" ry="2.2" />
                  <ellipse cx="33" cy="32" rx="4" ry="1.8" />
                  <ellipse cx="61" cy="39" rx="5" ry="2" />
                  <ellipse cx="74" cy="44" rx="3.6" ry="1.6" />
                  <ellipse cx="29" cy="57" rx="6" ry="2.4" />
                  <ellipse cx="44" cy="60" rx="4.4" ry="1.9" />
                  <ellipse cx="55" cy="81" rx="5" ry="2" />
                  <ellipse cx="68" cy="70" rx="3.4" ry="1.5" />
                </g>
              </g>
              </>}
              <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_RADIUS} fill="url(#portalink-shade)" />
              <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_RADIUS} fill="url(#portalink-bounce)" />
            </g>
            <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_RADIUS} fill="url(#portalink-limb)" />
            <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_RADIUS} fill="url(#portalink-sunlimb)" />
            {/* One geographic layer: a tiny point per reachable destination,
               derived from the camera. Navigation stays here. */}
            {isGlobeDetailReady && <g clipPath="url(#portalink-clip)">
              <GeographicLayer cities={geography.cities} camera={camera} pixelSize={pixelSize} onActivate={(city) => {
              const destination = toCityDestination(city.destinationId);
              if (destination) {
                onSelectCity(destination);
              }
              }} />
            </g>}
          </svg>
        </div>
      </div>

      

      <div className="relative z-10 mx-auto w-full max-w-[520px] px-6 pb-7">
        {suggestions.length > 0 && <ul className="mb-2 list-none space-y-1 p-0">
            {suggestions.map((city) => <li key={city.name} className="list-none">
                <button type="button" onClick={() => {
            focusCity(city);
            onSelectCity(city);
          }} onMouseEnter={() => focusCity(city)} className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-[var(--portalink-border-subtle)] bg-[var(--portalink-surface)] px-4 py-2 text-left text-small font-semibold text-[var(--portalink-text-primary)] transition-colors duration-150 hover:bg-[var(--portalink-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portalink-focus-ring)]">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="min-w-0 truncate">{city.name}</span>
                    {getCountryCode(city.name) && <span className="shrink-0 text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--portalink-text-tertiary)]">{getCountryCode(city.name)}</span>}
                  </span>
                  <span className="shrink-0 font-normal text-[var(--portalink-text-secondary)] [font-variant-numeric:tabular-nums]">{getLocalTimeAt(city.longitude)}</span>
                </button>
              </li>)}
          </ul>}
        
      </div>

      {/* Broadcast crawl along the bottom edge — additive, never overlapping. */}
      <div data-mobile-scroll-end="" className="relative z-10 shrink-0">
        <BroadcastTicker live={live} />
      </div>
    </div>;
}
