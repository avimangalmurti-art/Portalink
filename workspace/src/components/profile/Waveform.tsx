import React, { useRef } from 'react';

/**
 * The shared audio visualization. The same component reads as playback on a
 * profile and as analysis inside Studio, so one waveform serves both sides of
 * the product.
 *
 * Colour is semantic and scarce:
 *   inactive  neutral grey
 *   played    cyan (audio identity)
 *   playhead  the product accent (current interaction)
 *   gaze      purple (attention overlay, Studio only)
 *   anomaly   orange (a diagnostic point, Studio only)
 */

/** Bars are derived from the title, so a track always looks like itself. */
export function waveformBars(seed: string, count: number): number[] {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100003;
  }
  const bars: number[] = [];
  for (let index = 0; index < count; index += 1) {
    hash = (hash * 1103515245 + 12345) % 2147483648;
    const noise = hash / 2147483648;
    // A gentle arc keeps the shape musical rather than random static.
    const envelope = 0.45 + 0.55 * Math.sin(index / count * Math.PI);
    bars.push(Math.max(0.14, Math.min(1, noise * 0.75 + 0.25) * envelope));
  }
  return bars;
}
type WaveformProps = {
  seed: string;
  /** 0–1 share of the track already played. */
  progress: number;
  duration: number;
  barCount?: number;
  /** Seek by clicking or keyboard when provided. */
  onSeek?: (seconds: number) => void;
  /** Studio only: attention held across the track, 0–1 per bar. */
  gazeOverlay?: number[];
  /** Studio only: the point where listening falls away, in seconds. */
  anomalyAt?: number;
  className?: string;
};
export function Waveform({
  seed,
  progress,
  duration,
  barCount = 96,
  onSeek,
  gazeOverlay,
  anomalyAt,
  className = ''
}: WaveformProps) {
  const bars = waveformBars(seed, barCount);
  const trackRef = useRef<HTMLDivElement>(null);
  const playedIndex = Math.round(progress * barCount);
  function seekFromPointer(clientX: number) {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds || !onSeek) {
      return;
    }
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    onSeek(ratio * duration);
  }
  const isInteractive = Boolean(onSeek);
  return <div className={`relative ${className}`}>
      <div ref={trackRef} role={isInteractive ? 'slider' : 'img'} tabIndex={isInteractive ? 0 : undefined} aria-label={isInteractive ? 'Seek within track' : 'Waveform'} aria-valuemin={isInteractive ? 0 : undefined} aria-valuemax={isInteractive ? Math.round(duration) : undefined} aria-valuenow={isInteractive ? Math.round(progress * duration) : undefined} onClick={isInteractive ? (event) => seekFromPointer(event.clientX) : undefined} onKeyDown={isInteractive ? (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 5 : -5;
        onSeek?.(Math.min(duration, Math.max(0, progress * duration + delta)));
      }
    } : undefined} className={`flex h-24 w-full items-end gap-[2px] rounded-[8px] focus:outline-none sm:h-28 ${isInteractive ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]' : ''}`}>
        {bars.map((height, index) => {
        const isPlayed = index < playedIndex;
        const gaze = gazeOverlay?.[index];
        return <span key={index} aria-hidden="true" className="block min-w-0 flex-1 rounded-[1px] transition-colors duration-150" style={{
          height: `${height * 100}%`,
          // Attention, when Studio supplies it, replaces the played tone.
          backgroundColor: gaze !== undefined ? 'var(--studio-gaze)' : isPlayed ? 'var(--studio-audio)' : 'var(--surface-inset)',
          opacity: gaze !== undefined ? 0.25 + gaze * 0.75 : 1
        }} />;
      })}
      </div>

      {/* Progress rail, attached directly beneath the bars. */}
      <div aria-hidden="true" className="relative mt-2 h-[3px] w-full overflow-visible rounded-full bg-[var(--surface-inset)]">
        <span className="absolute left-0 top-0 h-full rounded-full" style={{
        width: `${progress * 100}%`,
        backgroundColor: 'var(--studio-audio)'
      }} />
        {/* The playhead is the point of current interaction. */}
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.28)]" style={{
        left: `${progress * 100}%`,
        backgroundColor: 'var(--accent-color)'
      }} />
        {/* A diagnostic point, not a fill. */}
        {anomalyAt !== undefined && duration > 0 && <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{
        left: `${anomalyAt / duration * 100}%`,
        backgroundColor: 'var(--studio-warning)'
      }} />}
      </div>
    </div>;
}

/** A tiny signature in the index, so audio reads as playable before opening. */
export function WaveformSignature({
  seed,
  barCount = 16,
  className = ''




}: {seed: string;barCount?: number;className?: string;}) {
  const bars = waveformBars(seed, barCount);
  return <span aria-hidden="true" className={`flex h-3 items-end gap-[1.5px] ${className}`}>
      {bars.map((height, index) => <span key={index} className="block w-[2px] rounded-[1px] bg-[var(--text-tertiary)]" style={{
      height: `${Math.max(height * 100, 18)}%`,
      opacity: 0.55
    }} />)}
    </span>;
}
