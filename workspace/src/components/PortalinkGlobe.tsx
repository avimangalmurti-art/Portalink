import React from 'react';
import { CityGlobe } from './CityGlobe';

// A compact desk globe mark with a fixed meridian arc and stand.
export function PortalinkGlobe({
  className


}: {className?: string;}) {
  return <span className={`relative block ${className ?? ''}`} aria-hidden="true">
      <span className="absolute left-[10%] top-[3%] block h-[67%] w-[80%] overflow-hidden rounded-full">
        <CityGlobe latitude={12} longitude={0} className="h-full w-full" />
      </span>
      <svg viewBox="0 0 100 120" className="relative block h-full w-full" role="presentation">
        {/* Stem and base only — nothing crosses the spinning sphere. */}
        <path d="M50 88 L50 104" stroke="#F6F3EA" strokeWidth="5" strokeLinecap="round" />
        <ellipse cx="50" cy="110" rx="26" ry="7" fill="#F6F3EA" />
      </svg>
    </span>;
}
