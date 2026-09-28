/** One saved project-card density for a creator's Home and public profile. */
export const MIN_PROJECT_GRID_COLUMNS = 2;
export const MAX_PROJECT_GRID_COLUMNS = 13;
export const DEFAULT_PROJECT_GRID_COLUMNS = 2;

export function normalizeProjectGridColumns(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PROJECT_GRID_COLUMNS;
  return Math.max(MIN_PROJECT_GRID_COLUMNS, Math.min(MAX_PROJECT_GRID_COLUMNS, Math.round(value)));
}
