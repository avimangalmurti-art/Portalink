/** A two-finger spread enlarges content; a pinch makes it smaller. */
export function pinchDistance(touches: ArrayLike<Pick<Touch, 'clientX' | 'clientY'>>) {
  if (touches.length !== 2) return null;
  const distance = Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
  return distance > 0 ? distance : null;
}

/** Discrete grid steps avoid layout jitter from small finger movements. */
export function pinchSteps(distance: number, startDistance: number) {
  return Math.round(Math.log(distance / startDistance) / Math.log(1.25));
}
