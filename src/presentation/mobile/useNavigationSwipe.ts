type Sample = { x: number; y: number; time: number };

/** A deliberate horizontal drag or quick flick; vertical scrolling always wins. */
export function navigationSwipe(start: Sample, end: Sample): 'left' | 'right' | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.abs(dx);
  if (distance < 24 || distance < Math.abs(dy) * 1.5) return null;
  if (distance < 56 && distance / Math.max(1, end.time - start.time) < 0.35) return null;
  return dx < 0 ? 'left' : 'right';
}
