export const MIN_PAGES_PER_ROW = 1;
export const MAX_PAGES_PER_ROW = 9;
export const DEFAULT_PAGES_PER_ROW = 3;

export function normalizePagesPerRow(
  value: number,
  fallback = DEFAULT_PAGES_PER_ROW,
): number {
  const candidate = Number.isFinite(value) ? value : fallback;
  return Math.max(MIN_PAGES_PER_ROW, Math.min(MAX_PAGES_PER_ROW, Math.round(candidate)));
}
