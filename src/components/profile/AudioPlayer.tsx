import React, { useEffect, useRef, useState } from 'react';
import { AudioLinesIcon, PauseIcon, PlayIcon, RotateCcwIcon, RotateCwIcon } from 'lucide-react';
import { Waveform } from './Waveform';
import { ResponsiveImage } from '../ui/ResponsiveImage';
type AudioPlayerProps = {
  fileName: string;
  duration: number;
  /**
   * A cover, when the project uploaded an image alongside the audio. Absent when
   * it did not — no artwork is ever generated to fill the square.
   */
  artworkUrl?: string;
  artworkAlt?: string;
  onClose: () => void;
};
function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// Audio work plays rather than paginates, and the waveform — not an icon — is
// the thing you look at.
export function AudioPlayer({
  fileName,
  duration,
  artworkUrl,
  artworkAlt,
  onClose
}: AudioPlayerProps) {
  // Nothing plays until the listener presses play.
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const frameRef = useRef(0);
  useEffect(() => {
    setPosition(0);
    setIsPlaying(false);
  }, [fileName]);
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    let previous = performance.now();
    function step(now: number) {
      const elapsed = (now - previous) / 1000;
      previous = now;
      setPosition((current) => current + elapsed >= duration ? duration : current + elapsed);
      frameRef.current = requestAnimationFrame(step);
    }
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [isPlaying, duration]);
  useEffect(() => {
    if (position >= duration) {
      setIsPlaying(false);
    }
  }, [position, duration]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  function skip(seconds: number) {
    setPosition((current) => Math.min(duration, Math.max(0, current + seconds)));
  }
  return <div className="flex h-full min-h-0 w-full flex-col bg-transparent" aria-label={`${fileName} audio player`}>
      {/* No identity bar. The sidebar names the project and the work states its
         own title below, so a header repeating it was a third copy of the same
         fact; the elapsed and total time already sit under the waveform. */}
      {/* Centred on both axes: the column is the only thing in the frame, so it
         sits in the middle of it rather than hanging from the top. `my-auto`
         rather than `justify-center` so a short viewport still scrolls to the
         full player instead of clipping it. */}
      <div className="scrollbar-slim flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-8">
        {/* One centred column: artwork, transport, then the waveform across the
           full measure with its times beneath. Artwork beside the waveform made
           the sound secondary to a placeholder square; stacked, the thing you
           look at while listening is the one full-width element. */}
        <div className="mx-auto my-auto flex w-full max-w-[620px] shrink-0 flex-col items-center">
            <div className="flex w-full max-w-[320px] flex-col">
              {/* A separately uploaded image becomes the cover. Nothing is
               generated: with no image, the square stays a plain marker of the
               medium rather than inventing artwork for the work. */}
              <div className="aspect-square w-full overflow-hidden rounded-[12px] bg-[var(--surface-inset)] ring-1 ring-[var(--hairline)]">
                {artworkUrl ? <ResponsiveImage src={artworkUrl} alt={artworkAlt ?? 'Audio artwork'} width={640} height={640} sizes="(min-width: 900px) 320px, 80vw" priority className="h-full w-full object-cover" /> : <span aria-hidden="true" className="flex h-full w-full items-center justify-center">
                    <AudioLinesIcon className="h-10 w-10" style={{
                color: 'var(--studio-audio)'
              }} />
                  </span>}
              </div>

              <div className="mt-4 flex items-center justify-center gap-3">
                <button type="button" onClick={() => skip(-15)} aria-label="Back 15 seconds" className="flex h-9 items-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold tabular-nums text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  <RotateCcwIcon className="h-4 w-4" aria-hidden="true" />
                  15
                </button>
                <button type="button" onClick={() => setIsPlaying((playing) => !playing)} aria-label={isPlaying ? 'Pause' : 'Play'} className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--accent-foreground)] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" style={{
              backgroundColor: 'var(--accent-color)'
            }}>
                  {isPlaying ? <PauseIcon className="h-[18px] w-[18px]" aria-hidden="true" /> : <PlayIcon className="h-[18px] w-[18px]" aria-hidden="true" />}
                </button>
                <button type="button" onClick={() => skip(15)} aria-label="Forward 15 seconds" className="flex h-9 items-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold tabular-nums text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  15
                  <RotateCwIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="mt-7 w-full">
              <Waveform seed={fileName} progress={progress} duration={duration} onSeek={setPosition} />

              <div className="mt-1.5 flex items-center justify-between text-[12px] tabular-nums text-[var(--text-secondary)]">
                <span>{formatTime(position)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
        </div>
      </div>
    </div>;
}
