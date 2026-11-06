// Scrollend restores immediately; this fallback covers older browsers.
export const NAVIGATION_SCROLL_IDLE_DELAY = 100;
const SETTLE_SPEED = 0.18;
const RESUME_SPEED = 0.35;
const SETTLE_DURATION = 48;

/** Keep navigation visible through a slow momentum tail, until a fast resume. */
export function createNavigationScrollSettling() {
  let sample: { target: EventTarget | null; x: number; y: number; time: number } | null = null;
  let wasFast = false;
  let slowSince: number | undefined;
  let settling = false;
  const reset = () => { sample = null; wasFast = false; slowSince = undefined; settling = false; };
  return {
    reset,
    update(target: EventTarget | null, surface: Pick<HTMLElement, 'scrollLeft' | 'scrollTop'>, time: number) {
      if (sample?.target !== target) reset();
      if (sample && time > sample.time) {
        const distance = Math.hypot(surface.scrollLeft - sample.x, surface.scrollTop - sample.y);
        const speed = distance / (time - sample.time);
        if (speed > SETTLE_SPEED) {
          wasFast = true;
          slowSince = undefined;
          if (speed > RESUME_SPEED) settling = false;
        } else if (distance > 0 && wasFast && !settling) {
          slowSince ??= sample.time;
          if (time - slowSince >= SETTLE_DURATION) settling = true;
        }
      }
      sample = { target, x: surface.scrollLeft, y: surface.scrollTop, time };
      return settling;
    },
  };
}
