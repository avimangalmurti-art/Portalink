import React from 'react';

/**
 * Marks for the model providers listed under My Intelligence.
 *
 * Each is DRAWN HERE in the product's own stroke language — 24px box, 1.6
 * stroke, round caps and joins — rather than being an imported brand asset.
 * They evoke each provider's mark so a row is identifiable at a glance, while
 * staying part of one icon family and making no claim of affiliation. Every
 * one inherits `currentColor`, so the list stays a single tone.
 */
type MarkProps = {
  className?: string;
};
const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
};

/** Interlocking hexagonal knot. */
export function OpenAIMark({
  className
}: MarkProps) {
  return <svg {...BASE} className={className}>
      <path d="M12 3.6 19.3 7.8v8.4L12 20.4 4.7 16.2V7.8Z" />
      <path d="M12 3.6v8.4l7.3 4.2" />
      <path d="M12 12 4.7 16.2" />
    </svg>;
}

/** Four-pointed spark. */
export function GeminiMark({
  className
}: MarkProps) {
  return <svg {...BASE} className={className}>
      <path d="M12 3c0 4.97 4.03 9 9 9-4.97 0-9 4.03-9 9 0-4.97-4.03-9-9-9 4.97 0 9-4.03 9-9Z" />
    </svg>;
}

/** Radiating burst. */
export function ClaudeMark({
  className
}: MarkProps) {
  return <svg {...BASE} className={className}>
      <path d="M12 4v4.4M12 15.6V20M4 12h4.4M15.6 12H20" />
      <path d="M6.3 6.3 9.5 9.5M14.5 14.5l3.2 3.2M17.7 6.3 14.5 9.5M9.5 14.5l-3.2 3.2" />
    </svg>;
}

/** Four quadrants. */
export function CopilotMark({
  className
}: MarkProps) {
  return <svg {...BASE} className={className}>
      <rect x="3.8" y="3.8" width="7" height="7" rx="1" />
      <rect x="13.2" y="3.8" width="7" height="7" rx="1" />
      <rect x="3.8" y="13.2" width="7" height="7" rx="1" />
      <rect x="13.2" y="13.2" width="7" height="7" rx="1" />
    </svg>;
}

/** Crossed diagonals. */
export function GrokMark({
  className
}: MarkProps) {
  return <svg {...BASE} className={className}>
      <path d="M4.5 19.5 19.5 4.5" />
      <path d="M4.5 4.5 10.8 11" />
      <path d="M13.6 13.9 19.5 19.5" />
    </svg>;
}

/** Interlocked answer rings. */
export function PerplexityMark({
  className
}: MarkProps) {
  return <svg {...BASE} className={className}>
      <path d="M12 4.5v15" />
      <path d="M12 8.4 6.6 4.5v6.6H4.3v5.4h2.3v3.6L12 15.6" />
      <path d="M12 8.4l5.4-3.9v6.6h2.3v5.4h-2.3v3.6L12 15.6" />
    </svg>;
}

/** Stacked bands. */
export function MistralMark({
  className
}: MarkProps) {
  return <svg {...BASE} className={className}>
      <path d="M4 5.2h4M16 5.2h4" />
      <path d="M4 9.7h7.5M12.5 9.7H20" />
      <path d="M4 14.2h16" />
      <path d="M4 18.7h4M10 18.7h4M16 18.7h4" />
      <path d="M4 5.2v13.5M20 5.2v13.5" />
    </svg>;
}

/** Speech mark with a spark. */
export function CharacterMark({
  className
}: MarkProps) {
  return <svg {...BASE} className={className}>
      <path d="M20 13.2c0 3.1-3.1 5.6-7 5.6-.9 0-1.8-.14-2.6-.4L5.4 20l1.2-3.2A5.4 5.4 0 0 1 5 13.2c0-3.1 3.1-5.6 7-5.6" />
      <path d="M17.4 3.4c0 1.6 1.3 2.9 2.9 2.9-1.6 0-2.9 1.3-2.9 2.9 0-1.6-1.3-2.9-2.9-2.9 1.6 0 2.9-1.3 2.9-2.9Z" />
    </svg>;
}